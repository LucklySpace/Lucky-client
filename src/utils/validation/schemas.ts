/**
 * @file 运行时数据验证 Schemas
 * @description 使用 Zod 进行运行时类型验证，确保数据安全性
 * @date 2025-01-15
 */

import { z } from "zod";

// ==================== 基础类型 ====================

/**
 * 用户ID验证
 */
export const userIdSchema = z.string().min(1, "用户ID不能为空");

/**
 * 聊天ID验证
 */
export const chatIdSchema = z.union([z.string(), z.number()]);

/**
 * 消息ID验证
 */
export const messageIdSchema = z.string().min(1, "消息ID不能为空");

/**
 * URL验证
 */
export const urlSchema = z.string().url("无效的URL格式");

/**
 * 手机号验证（中国大陆）
 */
export const phoneSchema = z
  .string()
  .regex(/^1[3-9]\d{9}$/, "无效的手机号格式");

/**
 * 邮箱验证
 */
export const emailSchema = z.string().email("无效的邮箱格式");

// ==================== 消息相关 ====================

/**
 * 消息内容类型
 */
export const messageContentTypeSchema = z.enum([
  "text",
  "image",
  "video",
  "audio",
  "file",
  "location",
]);

/**
 * 消息部分接口
 */
export const messagePartSchema = z.object({
  text: z.string().optional(),
  type: z.string().optional(),
  data: z.any().optional(),
});

/**
 * 基础消息接口
 */
export const messageSchema = z.object({
  messageId: messageIdSchema,
  fromId: z.string().optional(),
  toId: z.string().optional(),
  groupId: z.string().optional(),
  message: z.string(),
  messageType: z.number(),
  messageContentType: messageContentTypeSchema.optional(),
  sendTime: z.union([z.string(), z.number()]).optional(),
  status: z.number().optional(),
  messageParts: z.array(messagePartSchema).optional(),
});

/**
 * 私聊消息接口
 */
export const singleMessageSchema = messageSchema.extend({
  fromId: z.string(),
  toId: z.string(),
});

/**
 * 群聊消息接口
 */
export const groupMessageSchema = messageSchema.extend({
  groupId: z.string(),
  fromId: z.string(),
});

// ==================== 聊天相关 ====================

/**
 * 聊天类型
 */
export const chatTypeSchema = z.enum(["single", "group"]);

/**
 * 聊天会话接口
 */
export const chatSchema = z.object({
  chatId: chatIdSchema,
  chatType: chatTypeSchema,
  name: z.string(),
  avatar: z.string().nullable().optional(),
  unread: z.number().default(0),
  isMute: z.number().default(0),
  lastMessage: z.string().optional(),
  lastTime: z.union([z.string(), z.number()]).optional(),
  sequence: z.number().optional(),
});

// ==================== 用户相关 ====================

/**
 * 用户信息接口
 */
export const userSchema = z.object({
  userId: userIdSchema,
  name: z.string().min(1, "用户名不能为空"),
  avatar: z.string().nullable().optional(),
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
  token: z.string().optional(),
});

/**
 * 登录请求接口
 */
export const loginRequestSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(6, "密码至少6位"),
  deviceType: z.string().optional(),
});

/**
 * 注册请求接口
 */
export const registerRequestSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(6, "密码至少6位"),
  verifyCode: z.string().length(6, "验证码为6位"),
  name: z.string().min(1, "用户名不能为空"),
});

// ==================== 好友相关 ====================

/**
 * 好友信息接口
 */
export const friendSchema = z.object({
  userId: userIdSchema,
  name: z.string(),
  avatar: z.string().nullable().optional(),
  remark: z.string().optional(),
  group: z.string().optional(),
  status: z.number().optional(),
});

/**
 * 好友请求接口
 */
export const friendRequestSchema = z.object({
  fromUserId: userIdSchema,
  toUserId: userIdSchema,
  message: z.string().optional(),
  status: z.number().optional(),
});

// ==================== 群组相关 ====================

/**
 * 群组成员接口
 */
export const groupMemberSchema = z.object({
  userId: userIdSchema,
  name: z.string(),
  avatar: z.string().nullable().optional(),
  role: z.enum(["owner", "admin", "member"]).default("member"),
  joinTime: z.union([z.string(), z.number()]).optional(),
});

/**
 * 群组信息接口
 */
export const groupSchema = z.object({
  groupId: z.string(),
  name: z.string().min(1, "群名不能为空"),
  avatar: z.string().nullable().optional(),
  owner: userIdSchema,
  members: z.array(groupMemberSchema),
  maxMembers: z.number().optional(),
  createTime: z.union([z.string(), z.number()]).optional(),
});

// ==================== 文件相关 ====================

/**
 * 文件上传请求接口
 */
export const fileUploadRequestSchema = z.object({
  fileName: z.string().min(1, "文件名不能为空"),
  fileSize: z.number().positive("文件大小必须大于0"),
  fileType: z.string().optional(),
  chunkIndex: z.number().optional(),
  totalChunks: z.number().optional(),
});

/**
 * 文件信息接口
 */
export const fileInfoSchema = z.object({
  fileId: z.string().optional(),
  fileName: z.string(),
  fileSize: z.number(),
  fileType: z.string(),
  fileUrl: urlSchema.optional(),
  uploadTime: z.union([z.string(), z.number()]).optional(),
});

// ==================== WebSocket 相关 ====================

/**
 * WebSocket 消息接口
 */
export const wsMessageSchema = z.object({
  code: z.number(),
  data: z.any().optional(),
  message: z.string().optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
});

/**
 * 心跳消息接口
 */
export const heartbeatMessageSchema = z.object({
  code: z.literal(1),
  data: z.string(),
  timestamp: z.union([z.string(), z.number()]).optional(),
});

// ==================== API 响应 ====================

/**
 * 通用API响应接口
 */
export const apiResponseSchema = z.object({
  code: z.number(),
  message: z.string().optional(),
  data: z.any().optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
});

/**
 * 分页响应接口
 */
export const paginatedResponseSchema = z.object({
  code: z.number(),
  message: z.string().optional(),
  data: z.object({
    list: z.array(z.any()),
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
  }),
  timestamp: z.union([z.string(), z.number()]).optional(),
});

// ==================== 验证辅助函数 ====================

/**
 * 验证数据是否符合schema
 */
export function validateData<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
      throw new Error(`数据验证失败: ${errorMessages}`);
    }
    throw error;
  }
}

/**
 * 安全验证数据（返回null而非抛出错误）
 */
export function safeValidateData<T>(schema: z.ZodSchema<T>, data: unknown): T | null {
  try {
    return schema.parse(data);
  } catch {
    return null;
  }
}

/**
 * 创建验证器装饰器工厂
 */
export function createValidator<T>(schema: z.ZodSchema<T>) {
  return (data: unknown, fieldName = "data"): T => {
    return validateData(schema, data);
  };
}

// ==================== 导出 ====================

export default {
  // 用户相关
  userIdSchema,
  userSchema,
  loginRequestSchema,
  registerRequestSchema,

  // 消息相关
  messageSchema,
  singleMessageSchema,
  groupMessageSchema,

  // 聊天相关
  chatSchema,
  chatTypeSchema,

  // 好友相关
  friendSchema,
  friendRequestSchema,

  // 群组相关
  groupSchema,
  groupMemberSchema,

  // 文件相关
  fileUploadRequestSchema,
  fileInfoSchema,

  // WebSocket相关
  wsMessageSchema,
  heartbeatMessageSchema,

  // API响应
  apiResponseSchema,
  paginatedResponseSchema,

  // 工具函数
  validateData,
  safeValidateData,
  createValidator,
};
