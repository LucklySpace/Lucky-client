import { defineStore } from "pinia";
import { ref } from "vue";
import { StoresEnum } from "@/constants";
import { FTSQueryBuilder, QueryBuilder, useMappers } from "@/database";
import { extractMessageText } from "@/utils/Strings";
import { useLogger } from "@/hooks/useLogger";

/**
 * 聚合后返回的会话级别搜索结果类型
 */
interface Chat {
  id: string;
  chatId: string;
  chatType: number;
  name: string;
  avatar?: string;
  unread?: number;
  message?: string;
  messageTime?: number;
  count?: number;
}

// 4) 规范化 raw matches（改用数组，便于后续处理）
type RawMatch = {
  messageId: string;
  toId: string; // 对应 chats.toId（单聊为 otherId，群聊为 groupId）
  chatType: number; // 0 单聊, 1 群聊
  messageTime?: number;
  messageBody?: string;
};

type AggInfo = {
  chatType: number;
  matchedMessageIds: string[];
  matchCount: number;
  lastMessageTime: number; // 0 表示无
  lastMessage: string;
};

const logger = useLogger();

// 使用 setup 语法重构 Pinia store
export const useSearchStore = defineStore(StoresEnum.SEARCH, () => {
  // 响应式状态
  const searchResults = ref<any[]>([]);
  const recentItems = ref<any[]>([]);

  // mappers（DB 操作）
  const { singleMessageMapper, groupMessageMapper, friendsMapper, chatsMapper } = useMappers();

  /**
   * 清空搜索结果
   */
  function clearSearch() {
    searchResults.value = [];
    recentItems.value = [];
  }

  /**
   * 联系人搜索：基于 Friends 表匹配 name/alias/location
   */
  async function searchFriends(query: string) {
    const qb = new QueryBuilder<any>();
    qb.select("*")
      .like("name", query)
      .or(q => q.like("location", query));
    return await friendsMapper.selectList(qb);
  }

  /**
   * 群组搜索：基于 Friends 表匹配 name/alias/location
   * 注意：当前实现与 searchFriends 相同，可能需要根据实际表结构调整
   */
  async function searchGroups(query: string) {
    const qb = new QueryBuilder<any>();
    qb.select("*")
      .like("name", query)
      .or(q => q.like("location", query));
    return await friendsMapper.selectList(qb);
  }

  /**
   * 消息搜索：在 SingleMessage 和 GroupMessage 中匹配 messageBody，
   * 返回带上 avatar/fromName/chatType 的结果
   */
  async function searchMessages(query: string): Promise<any[]> {
    // 参数防护：trim 后为空直接返回空数组
    const q = (query ?? "").trim();
    if (!q) return [];

    const MAX_RESULT_GROUPS = 200;

    try {
      // 1) FTS 查询只取 messageId，减少 IO
      const qbSingle = new FTSQueryBuilder<any>();
      qbSingle.select("messageId").like("messageBody", q);

      const qbGroup = new FTSQueryBuilder<any>();
      qbGroup.select("messageId").like("messageBody", q);

      const [ftsSingleRes, ftsGroupRes] = await Promise.all([
        singleMessageMapper.searchFTSByBuilder(qbSingle),
        groupMessageMapper.searchFTSByBuilder(qbGroup)
      ]);

      const singleMessageIds = (ftsSingleRes?.records ?? []).map((r: any) => r.messageId).filter(Boolean);
      const groupMessageIds = (ftsGroupRes?.records ?? []).map((r: any) => r.messageId).filter(Boolean);

      // 2) 若无匹配项，直接返回
      if (!singleMessageIds.length && !groupMessageIds.length) return [];

      // 3) 批量加载真实消息记录（并行）
      const [singleMessages, groupMessages] = await Promise.all([
        singleMessageIds.length ? singleMessageMapper.selectByIds(singleMessageIds) : Promise.resolve([]),
        groupMessageIds.length ? groupMessageMapper.selectByIds(groupMessageIds) : Promise.resolve([])
      ]);

      const rawMatchesArr: RawMatch[] = [];

      // helper：计算单聊的 otherId（假设 ownerId 为本地用户 id）
      const getSingleOtherId = (m: any) => {
        if (m.ownerId && m.fromId && String(m.ownerId) === String(m.fromId)) return m.toId ?? m.fromId;
        return m.fromId ?? m.toId ?? "unknown";
      };

      for (const m of singleMessages || []) {
        rawMatchesArr.push({
          messageId: m.messageId,
          toId: String(getSingleOtherId(m)),
          chatType: 0,
          messageTime: m.messageTime,
          messageBody: m.messageBody
        });
      }

      for (const m of groupMessages || []) {
        rawMatchesArr.push({
          messageId: m.messageId,
          toId: String(m.groupId),
          chatType: 1,
          messageTime: m.messageTime,
          messageBody: m.messageBody
        });
      }

      const aggMap = new Map<string, AggInfo>();

      for (const r of rawMatchesArr) {
        const key = r.toId;
        if (!aggMap.has(key)) {
          aggMap.set(key, {
            chatType: r.chatType,
            matchedMessageIds: [],
            matchCount: 0,
            lastMessageTime: 0,
            lastMessage: ""
          });
        }
        const ent = aggMap.get(key)!;
        ent.matchCount += 1;
        // 更新最近匹配时间与 snippet（以最新的一条为 snippet）
        if ((r.messageTime ?? 0) > (ent.lastMessageTime ?? 0)) {
          ent.lastMessageTime = r.messageTime ?? 0;
          ent.lastMessage = extractMessageText(r.messageBody) ?? "";
        }
      }

      // 6) 构建要查询 chats.toId 的列表（去重、并限制数量）
      const toIdList = Array.from(aggMap.keys()).slice(0, MAX_RESULT_GROUPS);
      if (!toIdList.length) return [];

      // 7) 批量查询 chats 表（toId IN (...)）
      const qb = new QueryBuilder<any>();
      qb.select("*").in("toId", toIdList);
      const chatRows = (await chatsMapper.selectList(qb)) || [];

      // build a map for quick lookup by toId
      const chatRowMap = new Map<string, any>();
      for (const row of chatRows) {
        if (row && row.toId != null) chatRowMap.set(String(row.toId), row);
      }

      // 8) 合并结果：优先把有 chats 元数据的合并在前
      const merged: Chat[] = [];

      for (const toId of toIdList) {
        const agg = aggMap.get(toId)!;
        const chatRow = chatRowMap.get(toId);
        if (chatRow) {
          // 将聚合信息附加到 chat 行上
          merged.push({
            ...chatRow,
            count: agg.matchCount,
            messageTime: agg.lastMessageTime,
            message: agg.lastMessage
          });
        }
        if (merged.length >= MAX_RESULT_GROUPS) break;
      }

      // 9) 最终按 lastMatchTime 倒序返回
      merged.sort((a, b) => (b.messageTime ?? 0) - (a.messageTime ?? 0));

      return merged;
    } catch (err) {
      logger.error("[searchMessages] error:", err);
      return [];
    }
  }

  // 导出状态和方法
  return {
    // 状态
    searchResults,
    recentItems,

    // 方法
    clearSearch,
    searchFriends,
    searchGroups,
    searchMessages
  };
});
