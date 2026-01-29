import { MessageType, StoresEnum } from "@/constants";
import { FTSQueryBuilder, PageResult, QueryBuilder, Segmenter, useMappers } from "@/database";
import { useLogger } from "@/hooks/useLogger";
import { extractMessageText, highlightTextByTokens } from "@/utils/Strings";
import { defineStore } from "pinia";
import { ref } from "vue";

// ==================== 类型定义 ====================

/** 聚合后返回的会话级别搜索结果 */
interface ChatSearchResult {
  chatId: string;
  chatType: number;
  name: string;
  avatar?: string;
  unread?: number;
  message?: string;
  messageTime?: number;
  count?: number;
}

/** 历史消息搜索的会话上下文 */
interface ChatContext {
  toId: string;
  chatType: number;
  name?: string;
  avatar?: string;
}

/** 历史消息搜索的用户上下文 */
interface UserContext {
  ownerId: string;
  userInfo?: { name?: string; avatar?: string | null };
  groupMembers?: Map<string, { userId: string; name?: string; avatar?: string | null }>;
}

/** 历史消息搜索结果 */
interface HistorySearchResult {
  list: any[];
  total: number;
}

/** 原始消息匹配记录 */
type RawMatch = {
  messageId: string;
  toId: string;
  chatType: number;
  messageTime?: number;
  messageBody?: string;
};

/** 聚合信息 */
type AggInfo = {
  chatType: number;
  matchedMessageIds: string[];
  matchCount: number;
  lastMessageTime: number;
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
   * 联系人搜索：基于 Friends 表匹配 name/remark/location
   */
  async function searchFriends(query: string) {
    const qb = new QueryBuilder<any>();
    qb.select("*")
      .like("name", query)
      .or(q => q.like("location", query));
    return await friendsMapper.selectList(qb);
  }

  /**
   * 群组搜索：基于 Friends 表匹配 name/remark/location
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
   * 消息搜索：在 SingleMessage 和 GroupMessage 中匹配 messageBody
   * 返回按会话聚合的结果列表
   */
  async function searchMessages(query: string): Promise<ChatSearchResult[]> {
    const q = (query ?? "").trim();
    if (!q) return [];

    const MAX_RESULT_GROUPS = 200;

    try {
      // 1) FTS 并行查询
      const qbSingle = new FTSQueryBuilder<any>().select("messageId").like("messageBody", q);
      const qbGroup = new FTSQueryBuilder<any>().select("messageId").like("messageBody", q);

      const [ftsSingleRes, ftsGroupRes] = await Promise.all([
        singleMessageMapper.searchFTSByBuilder(qbSingle),
        groupMessageMapper.searchFTSByBuilder(qbGroup)
      ]);

      const singleIds = (ftsSingleRes?.records ?? []).map((r: any) => r.messageId).filter(Boolean);
      const groupIds = (ftsGroupRes?.records ?? []).map((r: any) => r.messageId).filter(Boolean);

      if (!singleIds.length && !groupIds.length) return [];

      // 2) 批量加载消息记录
      const [singleMessages, groupMessages] = await Promise.all([
        singleIds.length ? singleMessageMapper.selectByIds(singleIds) : [],
        groupIds.length ? groupMessageMapper.selectByIds(groupIds) : []
      ]);

      // 3) 构建原始匹配数组
      const rawMatches: RawMatch[] = [];

      const getOtherId = (m: any) =>
        m.ownerId && m.fromId && String(m.ownerId) === String(m.fromId)
          ? m.toId ?? m.fromId
          : m.fromId ?? m.toId ?? "unknown";

      for (const m of singleMessages || []) {
        rawMatches.push({
          messageId: m.messageId,
          toId: String(getOtherId(m)),
          chatType: 0,
          messageTime: m.messageTime,
          messageBody: m.messageBody
        });
      }

      for (const m of groupMessages || []) {
        rawMatches.push({
          messageId: m.messageId,
          toId: String(m.groupId),
          chatType: 1,
          messageTime: m.messageTime,
          messageBody: m.messageBody
        });
      }

      // 4) 按 toId 聚合
      const aggMap = new Map<string, AggInfo>();

      for (const r of rawMatches) {
        let agg = aggMap.get(r.toId);
        if (!agg) {
          agg = { chatType: r.chatType, matchedMessageIds: [], matchCount: 0, lastMessageTime: 0, lastMessage: "" };
          aggMap.set(r.toId, agg);
        }
        agg.matchCount++;
        if ((r.messageTime ?? 0) > agg.lastMessageTime) {
          agg.lastMessageTime = r.messageTime ?? 0;
          agg.lastMessage = extractMessageText(r.messageBody) ?? "";
        }
      }

      // 5) 查询 chats 表元数据
      const toIdList = Array.from(aggMap.keys()).slice(0, MAX_RESULT_GROUPS);
      if (!toIdList.length) return [];

      const qb = new QueryBuilder<any>().select("*").in("toId", toIdList);
      const chatRows = (await chatsMapper.selectList(qb)) || [];
      const chatMap = new Map(chatRows.filter(r => r?.toId != null).map(r => [String(r.toId), r]));

      // 6) 合并结果
      const merged: ChatSearchResult[] = [];
      for (const toId of toIdList) {
        const agg = aggMap.get(toId)!;
        const chat = chatMap.get(toId);
        if (chat) {
          merged.push({ ...chat, count: agg.matchCount, messageTime: agg.lastMessageTime, message: agg.lastMessage });
        }
        if (merged.length >= MAX_RESULT_GROUPS) break;
      }

      return merged.sort((a, b) => (b.messageTime ?? 0) - (a.messageTime ?? 0));
    } catch (err) {
      logger.error("[searchMessages] error:", err);
      return [];
    }
  }

  // ==================== 历史消息搜索 ====================

  /**
   * 对搜索关键词进行分词处理
   */
  async function tokenizeQuery(query?: string | string[]): Promise<string[]> {
    if (Array.isArray(query)) {
      return query.map(String).map(t => t.trim().replace(/["']/g, "")).filter(Boolean);
    }

    const str = (query ?? "").trim();
    if (!str) return [];

    let tokens: string[];
    if (str.includes(" ")) {
      tokens = str.split(/\s+/);
    } else {
      try {
        const segmented = await Segmenter.segment(str);
        tokens = segmented?.length ? segmented : (/[\p{Script=Han}]/u.test(str) ? Array.from(str) : [str]);
      } catch {
        tokens = /[\p{Script=Han}]/u.test(str) ? Array.from(str) : [str];
      }
    }

    return tokens.map(t => t.trim().replace(/["']/g, "")).filter(Boolean);
  }

  /**
   * 在指定会话中搜索历史消息
   *
   * @param chatContext - 会话上下文（toId, chatType, name, avatar）
   * @param userContext - 用户上下文（ownerId, userInfo, groupMembers）
   * @param pageInfo - 分页参数
   * @param query - 搜索关键词（可选）
   */
  async function searchChatHistory(
    chatContext: ChatContext,
    userContext: UserContext,
    pageInfo: PageResult<any>,
    query?: string | string[]
  ): Promise<HistorySearchResult> {
    const EMPTY_RESULT: HistorySearchResult = { list: [], total: 0 };

    // 参数校验
    if (!chatContext?.toId || !userContext?.ownerId) {
      return EMPTY_RESULT;
    }

    const { toId, chatType, name: chatName, avatar: chatAvatar } = chatContext;
    const { ownerId, userInfo, groupMembers } = userContext;
    const isSingleChat = chatType === MessageType.SINGLE_MESSAGE.code;
    const mapper = isSingleChat ? singleMessageMapper : groupMessageMapper;

    try {
      // 1) 构建 FTS 查询
      const qb = new FTSQueryBuilder<any>();

      if (isSingleChat) {
        qb.raw("((fromId = ? AND toId = ?) OR (fromId = ? AND toId = ?))", ownerId, toId, toId, ownerId);
      } else {
        qb.raw("ownerId = ? AND groupId = ?", ownerId, toId);
      }
      qb.orderByAsc("sequence");

      // 2) 分词处理
      const tokens = await tokenizeQuery(query);

      if (tokens.length) {
        qb.setMatchColumn("messageBody")
          .matchKeyword(tokens.join(" "), "and")
          .addSnippetSelect("excerpt", "snippet({table}, 0, '<b>', '</b>', '...', 10)")
          .setRankingExpr("bm25({table})", "DESC");
      } else {
        qb.isNotNull("messageBody");
      }

      // 3) 执行分页查询
      const ftsPage = await (mapper as any).searchFTS5Page(qb, pageInfo.page, pageInfo.size) ?? { records: [], total: 0 };
      const messageIds = ftsPage.records?.map((r: any) => r.messageId).filter(Boolean) ?? [];

      if (!messageIds.length) {
        return { list: [], total: ftsPage.total ?? 0 };
      }

      // 4) 获取完整消息记录
      const records = await (mapper as any).selectByIds(messageIds, "messageTime", "desc") ?? [];
      if (!records.length) {
        return { list: [], total: ftsPage.total ?? 0 };
      }

      // 5) 构建成员映射（群聊场景）
      const memberMap = groupMembers ?? new Map();

      // 6) 格式化结果
      const list = records.map((item: any) => {
        if (!item) return null;

        // 解析 messageBody
        let body: any;
        if (typeof item.messageBody === "string") {
          try {
            body = JSON.parse(item.messageBody);
          } catch {
            body = { text: item.messageBody ?? "" };
          }
        } else {
          body = item.messageBody ?? {};
        }

        // 高亮搜索词
        if (tokens.length && body?.text) {
          body.text = highlightTextByTokens(body.text, tokens);
        }

        const isOwner = String(ownerId) === String(item.fromId);
        const member = !isSingleChat ? memberMap.get?.(item.fromId) : null;

        return {
          ...item,
          messageBody: body,
          name: isOwner ? userInfo?.name : isSingleChat ? chatName : member?.name ?? "未知",
          avatar: isOwner ? userInfo?.avatar : isSingleChat ? chatAvatar : member?.avatar ?? "",
          isOwner
        };
      }).filter(Boolean);

      return { list, total: ftsPage.total ?? 0 };
    } catch (err) {
      logger.error("[searchChatHistory] error:", err);
      return EMPTY_RESULT;
    }
  }

  // ==================== 导出 ====================

  return {
    // 状态
    searchResults,
    recentItems,

    // 方法
    clearSearch,
    searchFriends,
    searchGroups,
    searchMessages,
    searchChatHistory,
    tokenizeQuery
  };
});
