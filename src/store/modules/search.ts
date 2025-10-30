import { defineStore } from "pinia";
import { StoresEnum } from "@/constants";
import { FTSQueryBuilder, QueryBuilder, useMappers } from "@/database";
import { extractMessageText } from "@/utils/Strings";

const logger = useLogger();

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

// mappers（DB 操作）
const { singleMessageMapper, groupMessageMapper, friendsMapper, chatsMapper } = useMappers();

export const useSearchStore = defineStore(StoresEnum.SCREEN, {
  state: () => ({
    searchResults: [],
    recentItems: []
  }),
  actions: {
    clearSearch() {
    },

    // 联系人搜索：基于 Friends 表匹配 name/alias/location
    async searchFriends(query: string) {
      const qb = new QueryBuilder<any>();
      qb.select("*")
        .like("name", query)
        .or(q => q.like("location", query));
      return await friendsMapper.selectList(qb);
    },

    async searchGroups(query: string) {
      const qb = new QueryBuilder<any>();
      qb.select("*")
        .like("name", query)
        .or(q => q.like("location", query));
      return await friendsMapper.selectList(qb);
    },

    async searchMessages(query: string): Promise<any[]> {
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

    // 消息搜索：在 SingleMessage 和 GroupMessage 中匹配 messageBody，返回带上 avatar/fromName/chatType 的结果
    // async searchMessages(query: string): Promise<AggregatedMessageResult[]> {
    //   // 参数防护：trim 后为空直接返回空数组（避免无谓 DB 调用）
    //   const q = (query ?? "").trim();
    //   if (!q) return [];

    //   // 限制返回的会话数，避免一次性返回太多（可按需调整）
    //   const MAX_RESULT_GROUPS = 200;

    //   try {
    //     // 1) 构建 FTS 查询：只取 messageId（先拿 id 减少 IO）
    //     const qbSingle = new FTSQueryBuilder<SingleMessage>();
    //     qbSingle.select("messageId").match("messageBody", q);

    //     const qbGroup = new FTSQueryBuilder<GroupMessage>();
    //     qbGroup.select("messageId").match("messageBody", q);

    //     // 并行执行 FTS 查询（只返 ids）
    //     const [ftsSingleRes, ftsGroupRes] = await Promise.all([
    //       singleMessageMapper.searchFTSByBuilder(qbSingle),
    //       groupMessageMapper.searchFTSByBuilder(qbGroup)
    //     ]);

    //     const singleIds = (ftsSingleRes?.records ?? []).map((r: any) => r.messageId).filter(Boolean);
    //     const groupIds = (ftsGroupRes?.records ?? []).map((r: any) => r.messageId).filter(Boolean);

    //     // 如果没有匹配就立即返回
    //     if (singleIds.length === 0 && groupIds.length === 0) return [];

    //     // 2) 批量加载真实消息记录（并行）
    //     const [singleMessages, groupMessages] = await Promise.all([
    //       singleIds.length ? singleMessageMapper.selectByIds(singleIds) : Promise.resolve([]),
    //       groupIds.length ? groupMessageMapper.selectByIds(groupIds) : Promise.resolve([])
    //     ]);

    //     const rawMatches: RawMatch[] = [];

    //     // 填充单聊（注意字段名以你的 DB 实体为准）
    //     for (const m of singleMessages || []) {
    //       rawMatches.push({
    //         messageId: m.messageId,
    //         chatId: m.toId ?? m.fromId ?? `single_${m.messageId}`,
    //         chatType: 0,
    //         fromId: m.fromId,
    //         name: m.fromId,
    //         messageBody: m.messageBody,
    //         messageTime: m.messageTime,
    //         avatar: m.fromId ?? null // 尝试从好友表获取头像（如果 mapper 有该方法）
    //       });
    //     }

    //     // 填充群聊
    //     for (const m of groupMessages || []) {
    //       rawMatches.push({
    //         messageId: m.messageId ?? "",
    //         chatId: m.groupId ?? `group_${m.messageId}`,
    //         chatType: 1,
    //         fromId: m.fromId,
    //         name: m.fromId,
    //         messageBody: m.messageBody,
    //         messageTime: m.messageTime,
    //         avatar: m.fromId ?? null
    //       });
    //     }

    //     // 4) 按 chatId 聚合：统计 matchCount、收集 matched message ids、找最近一条并生成 snippet
    //     const groups = new Map<string, { chatType: number; items: RawMatch[] }>();

    //     for (const rm of rawMatches) {
    //       const k = rm.chatId;
    //       if (!groups.has(k)) groups.set(k, { chatType: rm.chatType, items: [] });
    //       groups.get(k)!.items.push(rm);
    //     }

    //     const results: AggregatedMessageResult[] = [];

    //     for (const [chatId, entry] of groups.entries()) {
    //       const items = entry.items;
    //       // 按时间倒序，方便取最近一条作为 snippet
    //       items.sort((a, b) => (b.messageTime ?? 0) - (a.messageTime ?? 0));
    //       const last = items[0];

    //       // snippet：取最近一条匹配消息的 messageBody；若需要可以截断或拼接多条
    //       const snippet = last && last.messageBody ? String(last.messageBody) : "";

    //       // displayName / avatar：优先从 Chats 表/映射查找（如果你有聊天表），否则使用 fromName 或 chatId
    //       // 这里示例尝试从 singleMessageMapper/groupMessageMapper 或 friendsMapper 查找友好名称（以实际项目接口为准）
    //       let displayName = last?.name ?? chatId;
    //       let avatar = last?.avatar ?? null;

    //       // 如果存在会话元数据（例如 Chats 表），可额外查询以覆盖 displayName/avatar
    //       // try {
    //       //   const chatMeta = await /* 如果有 chatMapper，可替换为实际 mapper 查询 */ Promise.resolve(null);
    //       //   if (chatMeta) {
    //       //     displayName = chatMeta.name ?? displayName;
    //       //     avatar = chatMeta.avatar ?? avatar;
    //       //   }
    //       // } catch {
    //       //   // 忽略元数据查询错误
    //       // }

    //       results.push({
    //         chatId,
    //         chatType: entry.chatType,
    //         matchCount: items.length,
    //         lastMatchTime: last?.messageTime,
    //         snippet,
    //         avatar,
    //         displayName,
    //         matchedMessageIds: items.map(i => i.messageId)
    //       });

    //       // 可选：提前限制返回组数
    //       if (results.length >= MAX_RESULT_GROUPS) break;
    //     }

    //     // 5) 最终按最近匹配时间倒序返回
    //     results.sort((a, b) => (b.lastMatchTime ?? 0) - (a.lastMatchTime ?? 0));
    //     return results;
    //   } catch (err) {
    //     logger.error("[searchMessages] error:", err);
    //     // 发生异常时返回空数组，调用方可以显示错误提示
    //     return [];
    //   }
    // }
  }
});
