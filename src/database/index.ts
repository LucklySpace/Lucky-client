// src/hooks/useMappers.ts
import { markRaw, readonly, shallowReactive } from "vue";
import ChatsMapper from "./mapper/ChatsMapper";
import SingleMessageMapper from "./mapper/SingleMessageMapper";
import GroupMessageMapper from "./mapper/GroupMessageMapper";
import FriendsMapper from "./mapper/FriendsMapper";
import { QueryBuilder } from "./orm/query/QueryBuilder";
import { FTSQueryBuilder } from "./orm/query/FTSQueryBuilder";
import { PageResult } from "./orm/BaseMapper";
import Segmenter from "./orm/core/Segmenter";
import { DatabaseManager } from "./orm/core/DatabaseManager";

/**
 * 全局 Mapper 上下文接口
 */
export interface MapperContext {
  chatsMapper: ChatsMapper;
  singleMessageMapper: SingleMessageMapper;
  groupMessageMapper: GroupMessageMapper;
  friendsMapper: FriendsMapper;
  // 如需更多 Mapper，在这里添加
}

// 私有单例实例
const _mapperContext = shallowReactive<MapperContext>({
  chatsMapper: markRaw(new ChatsMapper()),
  singleMessageMapper: markRaw(new SingleMessageMapper()),
  groupMessageMapper: markRaw(new GroupMessageMapper()),
  friendsMapper: markRaw(new FriendsMapper())
});

/**
 * useMappers Hook
 *
 * 返回一个只读的 MapperContext 对象，
 * 可在任何 Vue 组件的 setup() 中调用获取各表的 Mapper 实例。
 */
export function useMappers(): Readonly<MapperContext> {
  return readonly(_mapperContext) as Readonly<MapperContext>;
}

/**
 * 初始化数据库（支持用户隔离）
 * @param userId 用户ID
 */
export async function initDatabase(userId: string) {
  // 0. 参数校验（禁止空 userId 初始化）
  if (!userId || !String(userId).trim()) {
    throw new Error("initDatabase: invalid userId");
  }
  // 1. 设置用户ID，重置数据库连接
  await DatabaseManager.setUserId(userId);

  // 挂载到 window
  (window as any).DatabaseManager = DatabaseManager;

  // 2. 重新确保所有 Mapper 对应的表结构存在
  const mappers = Object.values(_mapperContext);
  for (const mapper of mappers) {
    if (mapper) {
      // 初始化基础表
      if (typeof (mapper as any).ensureTable === "function") {
        await (mapper as any).ensureTable();
      }
      // 初始化 FTS 表 (全文搜索)
      if (typeof (mapper as any).createFTSTable === "function") {
        await (mapper as any).createFTSTable();
      }
    }
  }
}


export { QueryBuilder, FTSQueryBuilder, Segmenter };

export type { PageResult };
