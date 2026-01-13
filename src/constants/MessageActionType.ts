/**
 * IM 操作类型枚举
 * 对应后端 ActionType.java
 *
 * 设计原则：
 * - 使用固定编号区间便于分组
 * - 1-99: 消息相关
 * - 70+: 表情/反应
 * - 200-299: 群组成员/权限操作
 * - 300-399: 好友/联系人
 * - 600-699: 文件/传输
 * - 900-999: 系统/管理
 */

export interface ActionTypeItem {
  code: number;
  desc: string;
}

/**
 * IM 操作类型枚举对象
 */
export const ActionType = {
  // ========== 消息相关（1 - 99）==========
  /** 发送消息 */
  SEND_MESSAGE: { code: 1, desc: "发送消息" },
  /** 编辑消息 */
  EDIT_MESSAGE: { code: 2, desc: "编辑消息" },
  /** 删除消息 */
  DELETE_MESSAGE: { code: 3, desc: "删除消息" },
  /** 撤回消息 */
  RECALL_MESSAGE: { code: 4, desc: "撤回消息" },
  /** 回复消息 */
  REPLY_MESSAGE: { code: 5, desc: "回复消息" },
  /** 转发消息 */
  FORWARD_MESSAGE: { code: 6, desc: "转发消息" },
  /** 已读回执 */
  MARK_READ: { code: 7, desc: "已读回执" },
  /** 正在输入 */
  TYPING: { code: 8, desc: "正在输入" },
  /** 引用消息 */
  MESSAGE_QUOTE: { code: 9, desc: "引用消息" },

  // ========== 表情 / 反应（70+）==========
  /** 添加表情反应 */
  REACTION_ADD: { code: 70, desc: "添加表情反应" },
  /** 移除表情反应 */
  REACTION_REMOVE: { code: 71, desc: "移除表情反应" },

  // ========== 群组成员 / 权限操作（200 - 299）==========
  /** 创建群组 */
  CREATE_GROUP: { code: 200, desc: "创建群组" },
  /** 群组邀请 */
  INVITE_TO_GROUP: { code: 201, desc: "群组邀请" },
  /** 成员加入群组 */
  JOIN_GROUP: { code: 202, desc: "成员加入群组" },
  /** 主动退出群组 */
  LEAVE_GROUP: { code: 203, desc: "主动退出群组" },
  /** 移除群成员 */
  KICK_FROM_GROUP: { code: 204, desc: "移除群成员" },
  /** 设置管理员 */
  PROMOTE_TO_ADMIN: { code: 205, desc: "设置管理员" },
  /** 取消管理员 */
  DEMOTE_FROM_ADMIN: { code: 206, desc: "取消管理员" },
  /** 移交群主 */
  TRANSFER_GROUP_OWNER: { code: 207, desc: "移交群主" },
  /** 修改群信息 */
  SET_GROUP_INFO: { code: 208, desc: "修改群信息" },
  /** 设置群公告 */
  SET_GROUP_ANNOUNCEMENT: { code: 209, desc: "设置群公告" },
  /** 设置群加入方式 */
  SET_GROUP_JOIN_MODE: { code: 210, desc: "设置群加入方式" },
  /** 批准入群申请 */
  APPROVE_JOIN_REQUEST: { code: 211, desc: "批准入群申请" },
  /** 拒绝入群申请 */
  REJECT_JOIN_REQUEST: { code: 212, desc: "拒绝入群申请" },
  /** 群组加入审批 */
  JOIN_APPROVE_GROUP: { code: 213, desc: "群组加入审批" },
  /** 群组加入审批结果 */
  JOIN_APPROVE_RESULT_GROUP: { code: 214, desc: "群组加入审批结果" },
  /** 单人禁言 */
  MUTE_MEMBER: { code: 215, desc: "单人禁言" },
  /** 取消禁言 */
  UNMUTE_MEMBER: { code: 216, desc: "取消禁言" },
  /** 全员禁言 */
  MUTE_ALL: { code: 217, desc: "全员禁言" },
  /** 取消全员禁言 */
  UNMUTE_ALL: { code: 218, desc: "取消全员禁言" },
  /** 设置群成员角色 */
  SET_MEMBER_ROLE: { code: 219, desc: "设置群成员角色" },
  /** 解散/删除群组 */
  REMOVE_GROUP: { code: 220, desc: "解散/删除群组" },

  // ========== 好友 / 联系人（300 - 399）==========
  /** 添加好友 */
  ADD_FRIEND: { code: 300, desc: "添加好友" },
  /** 删除好友 */
  REMOVE_FRIEND: { code: 301, desc: "删除好友" },
  /** 拉黑用户 */
  BLOCK_USER: { code: 302, desc: "拉黑用户" },
  /** 解除拉黑 */
  UNBLOCK_USER: { code: 303, desc: "解除拉黑" },
  /** 好友请求 */
  FRIEND_REQUEST: { code: 304, desc: "好友请求" },

  // ========== 文件/传输（600 - 699）==========
  /** 文件上传 */
  UPLOAD_FILE: { code: 600, desc: "文件上传" },
  /** 文件下载 */
  DOWNLOAD_FILE: { code: 601, desc: "文件下载" },
  /** 文件分享 */
  SHARE_FILE: { code: 602, desc: "文件分享" },
  /** 分片上传 */
  CHUNK_UPLOAD: { code: 603, desc: "分片上传" },
  /** 分片合并完成 */
  CHUNK_COMPLETE: { code: 604, desc: "分片合并完成" },

  // ========== 系统 / 管理（900 - 999）==========
  /** 系统通知 */
  SYSTEM_NOTIFICATION: { code: 900, desc: "系统通知" },
  /** 平台管理操作 */
  MODERATION_ACTION: { code: 901, desc: "平台管理操作" },
  /** 审计日志记录 */
  AUDIT_LOG: { code: 902, desc: "审计日志记录" },
} as const;

/** IM 操作类型 code 类型 */
export type ActionTypeCode = typeof ActionType[keyof typeof ActionType]["code"];

/** IM 操作类型 key 类型 */
export type ActionTypeKey = keyof typeof ActionType;

// 构建 code -> 枚举项 的映射
const actionTypeByCode = new Map<number, ActionTypeItem & { key: string }>();
for (const [key, value] of Object.entries(ActionType)) {
  actionTypeByCode.set(value.code, { ...value, key });
}

/**
 * 根据 code 获取 IM 操作类型
 * @param code IM 操作类型 code
 * @returns IM 操作类型对象，找不到返回 undefined
 */
export function getIMActionTypeByCode(code: number): (ActionTypeItem & { key: string }) | undefined {
  return actionTypeByCode.get(code);
}

/**
 * 根据 code 获取 IM 操作类型，找不到则抛出异常
 * @param code IM 操作类型 code
 * @throws Error 找不到时抛出异常
 */
export function getIMActionTypeByCodeOrThrow(code: number): ActionTypeItem & { key: string } {
  const result = actionTypeByCode.get(code);
  if (!result) {
    throw new Error(`Unknown ActionType code: ${code}`);
  }
  return result;
}

// ========== 分类判断方法 ==========

/**
 * 判断是否为消息相关操作（code 1-99）
 */
export function isMessageAction(code: number): boolean {
  return code >= 1 && code <= 99;
}

/**
 * 判断是否为表情反应操作（code 70-79）
 */
export function isReactionAction(code: number): boolean {
  return code >= 70 && code <= 79;
}

/**
 * 判断是否为群组操作（code 200-299）
 */
export function isGroupAction(code: number): boolean {
  return code >= 200 && code <= 299;
}

/**
 * 判断是否为好友/联系人操作（code 300-399）
 */
export function isFriendAction(code: number): boolean {
  return code >= 300 && code <= 399;
}

/**
 * 判断是否为文件传输操作（code 600-699）
 */
export function isFileTransferAction(code: number): boolean {
  return code >= 600 && code <= 699;
}

/**
 * 判断是否为系统管理操作（code 900-999）
 */
export function isSystemAction(code: number): boolean {
  return code >= 900 && code <= 999;
}

