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

export { QueryBuilder, FTSQueryBuilder, Segmenter };

export type { PageResult };
