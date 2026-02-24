/**
 * 消息内容类型枚举
 * 对应后端 IMessageContentType.java
 *
 * 设计原则：
 * - 使用固定编号区间便于分组
 * - 0: 系统提示
 * - 1-99: 文本类
 * - 100-199: 媒体类
 * - 200-299: 文件/二进制
 * - 300-399: 富媒体/结构化内容
 * - 400+: 其它/保留
 */

export interface MessageContentTypeItem {
  code: number;
  desc: string;
}

/**
 * 消息内容类型枚举对象
 */
export const MessageContentType = {
  // ========== 系统 / 提示 ==========
  /** 系统提示 */
  TIP: { code: 0, desc: "系统提示" },

  // ========== 文本类（1-99）==========
  TEXT: { code: 1, desc: "纯文本" },
  MARKDOWN: { code: 2, desc: "Markdown 文本" },
  RICH_TEXT: { code: 3, desc: "富文本（带样式/HTML）" },

  // ========== 媒体（100-199）==========
  IMAGE: { code: 100, desc: "图片" },
  GIF: { code: 101, desc: "动画图片(GIF/WebP)" },
  VIDEO: { code: 110, desc: "视频" },
  AUDIO: { code: 120, desc: "语音/音频" },
  STICKER: { code: 130, desc: "贴纸 / 表情包" },

  // ========== 文件 / 二进制（200-299）==========
  FILE: { code: 200, desc: "文件（通用）" },
  ARCHIVE: { code: 201, desc: "压缩包" },
  DOCUMENT: { code: 202, desc: "文档（pdf/doc/xlsx 等）" },

  // ========== 富媒体 / 结构化内容（300-399）==========
  LOCATION: { code: 300, desc: "位置 / 地理位置信息" },
  CONTACT_CARD: { code: 310, desc: "名片 / 联系人卡片" },
  URL_PREVIEW: { code: 320, desc: "链接预览（网页摘要）" },
  POLL: { code: 330, desc: "投票 / 问卷" },
  FORWARD: { code: 340, desc: "转发内容（封装）" },

  // ========== 群组（400-421）==========
  CREATE_GROUP: { code: 400, desc: "创建群组" },
  INVITE_TO_GROUP: { code: 401, desc: "群组邀请" },
  JOIN_GROUP: { code: 402, desc: "成员加入群组" },
  LEAVE_GROUP: { code: 403, desc: "主动退出群组" },
  KICK_FROM_GROUP: { code: 404, desc: "移除群成员" },
  PROMOTE_TO_ADMIN: { code: 405, desc: "设置管理员" },
  DEMOTE_FROM_ADMIN: { code: 406, desc: "取消管理员" },
  TRANSFER_GROUP_OWNER: { code: 407, desc: "移交群主" },
  SET_GROUP_INFO: { code: 408, desc: "修改群信息" },
  SET_GROUP_ANNOUNCEMENT: { code: 409, desc: "设置群公告" },
  SET_GROUP_JOIN_MODE: { code: 410, desc: "设置群加入方式" },
  APPROVE_JOIN_REQUEST: { code: 411, desc: "批准入群申请" },
  REJECT_JOIN_REQUEST: { code: 412, desc: "拒绝入群申请" },
  JOIN_APPROVE_GROUP: { code: 413, desc: "群组加入审批" },
  JOIN_APPROVE_RESULT_GROUP: { code: 414, desc: "群组加入审批结果" },
  MUTE_MEMBER: { code: 415, desc: "单人禁言" },
  UNMUTE_MEMBER: { code: 416, desc: "取消禁言" },
  MUTE_ALL: { code: 417, desc: "全员禁言" },
  UNMUTE_ALL: { code: 418, desc: "取消全员禁言" },
  SET_MEMBER_ROLE: { code: 419, desc: "设置群成员角色" },
  REMOVE_GROUP: { code: 420, desc: "解散/删除群组" },
  GROUP_OPERATION: { code: 421, desc: "群组操作（通用）" },

  // ========== 消息操作（450-458）==========
  SEND_MESSAGE: { code: 450, desc: "发送消息" },
  EDIT_MESSAGE: { code: 451, desc: "编辑消息" },
  DELETE_MESSAGE: { code: 452, desc: "删除消息" },
  RECALL_MESSAGE: { code: 453, desc: "撤回消息" },
  REPLY_MESSAGE: { code: 454, desc: "回复消息" },
  FORWARD_MESSAGE: { code: 455, desc: "转发消息" },
  MARK_READ: { code: 456, desc: "已读回执" },
  TYPING: { code: 457, desc: "正在输入" },
  MESSAGE_QUOTE: { code: 458, desc: "引用消息" },
  MERGE_MESSAGE: { code: 459, desc: "合并消息" },

  // ========== 其它 / 保留 ==========
  COMPLEX: { code: 500, desc: "混合消息（多类型组合）" },

  UNKNOWN: { code: 999, desc: "未知类型（保底）" },
} as const;

/** 消息内容类型 code 类型 */
export type MessageContentTypeCode = typeof MessageContentType[keyof typeof MessageContentType]["code"];

/** 消息内容类型 key 类型 */
export type MessageContentTypeKey = keyof typeof MessageContentType;

// 构建 code -> 枚举项 的映射
const contentTypeByCode = new Map<number, MessageContentTypeItem & { key: string }>();
for (const [key, value] of Object.entries(MessageContentType)) {
  contentTypeByCode.set(value.code, { ...value, key });
}

/**
 * 根据 code 获取消息内容类型
 * @param code 消息内容类型 code
 * @returns 消息内容类型对象，找不到返回 undefined
 */
export function getMessageContentTypeByCode(code: number): (MessageContentTypeItem & { key: string }) | undefined {
  return contentTypeByCode.get(code);
}

/**
 * 根据 code 获取消息内容类型，找不到则返回 UNKNOWN
 * @param code 消息内容类型 code
 * @returns 消息内容类型对象
 */
export function getMessageContentTypeByCodeOrDefault(code: number): MessageContentTypeItem & { key: string } {
  return contentTypeByCode.get(code) ?? { ...MessageContentType.UNKNOWN, key: "UNKNOWN" };
}

/**
 * 判断是否为文本类消息（code 1-99）
 */
export function isTextType(code: number): boolean {
  return code >= 1 && code <= 99;
}

/**
 * 判断是否为媒体类消息（code 100-199）
 */
export function isMediaType(code: number): boolean {
  return code >= 100 && code <= 199;
}

/**
 * 判断是否为文件类消息（code 200-299）
 */
export function isFileType(code: number): boolean {
  return code >= 200 && code <= 299;
}

/**
 * 判断是否为富媒体/结构化内容消息（code 300-399）
 */
export function isRichMediaType(code: number): boolean {
  return code >= 300 && code <= 399;
}

