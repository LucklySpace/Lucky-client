/**
 * 群管理相关类型定义
 * @description 对应后端 GroupDto、GroupMemberDto、GroupInviteDto
 */

// ==================== 基础类型 ====================

/**
 * 群成员信息
 * @description 对应后端返回的群成员数据
 */
export interface GroupMember {
  /** 用户 ID */
  userId: string;
  /** 用户昵称 */
  name: string;
  /** 用户头像 */
  avatar?: string;
  /** 成员角色: 0-群主, 1-管理员, 2-普通成员, 3-禁言成员 */
  role?: number;
  /** 群内昵称 */
  alias?: string;
  /** 群备注 */
  remark?: string;
  /** 禁言状态: 0-禁言, 1-正常 */
  mute?: number;
  /** 禁言结束时间戳 */
  muteEndTime?: number;
  /** 禁言时长（秒） */
  muteDuration?: number;
  /** 加入时间 */
  joinTime?: number;
}

/**
 * 群信息
 * @description 对应后端 ImGroupPo / GroupDto
 */
export interface GroupInfo {
  /** 群组 ID */
  groupId: string;
  /** 群名称 */
  groupName?: string;
  /** 群头像 */
  avatar?: string;
  /** 群简介 */
  introduction?: string;
  /** 群公告 */
  notification?: string;
  /** 群主 ID */
  ownerId?: string;
  /** 加入方式: 0-禁止申请, 1-需要审批, 2-自由加入 */
  applyJoinType?: number;
  /** 全员禁言: 0-禁言, 1-正常 */
  muteAll?: number;
  /** 群类型: 0-公开群, 1-私有群 */
  groupType?: number;
  /** 群状态: 0-解散, 1-正常 */
  status?: number;
  /** 群成员数量 */
  memberCount?: number;
  /** 创建时间 */
  createTime?: number;
}

// ==================== API 请求参数类型 ====================

/**
 * 群邀请参数
 * @description 对应后端 GroupInviteDto
 */
export interface GroupInviteParams {
  /** 群聊 ID（创建群聊时可不传） */
  groupId?: string;
  /** 用户 ID（操作者） */
  userId?: string;
  /** 被邀请用户 ID 列表 */
  memberIds: string[];
  /** 邀请类型 */
  type: number;
  /** 邀请信息 */
  message?: string;
  /** 群名称（创建群聊时使用） */
  groupName?: string;
  /** 邀请来源 */
  addSource?: number;
}

/**
 * 群邀请审批参数
 * @description 对应后端 GroupInviteDto 的审批相关字段
 */
export interface GroupApproveParams {
  /** 邀请请求 ID */
  requestId: string;
  /** 群组 ID */
  groupId: string;
  /** 用户 ID（当前操作者） */
  userId?: string;
  /** 邀请人 ID */
  inviterId?: string;
  /** 审批状态: 0-待处理, 1-同意, 2-拒绝 */
  approveStatus: number;
  /** 验证者用户 ID（群主或管理员） */
  verifierId?: string;
  /** 群主或管理员验证状态 */
  verifierStatus?: number;
}

/**
 * 群成员操作参数
 * @description 用于踢人、设置管理员、禁言等操作
 */
export interface GroupMemberActionParams {
  /** 群组 ID */
  groupId: string;
  /** 操作者用户 ID */
  userId?: string;
  /** 目标用户 ID（被操作的成员） */
  targetUserId: string;
  /** 成员角色: 0-群主, 1-管理员, 2-普通成员, 3-禁言成员 */
  role?: number;
  /** 禁言状态: 0-禁言, 1-正常 */
  mute?: number;
  /** 禁言时长（秒），0表示永久禁言 */
  muteDuration?: number;
  /** 群内昵称 */
  alias?: string;
  /** 群备注 */
  remark?: string;
}

/**
 * 群设置参数
 * @description 用于更新群信息
 */
export interface GroupSettingParams {
  /** 群组 ID */
  groupId: string;
  /** 操作者用户 ID */
  userId?: string;
  /** 群名称 */
  groupName?: string;
  /** 群头像 */
  avatar?: string;
  /** 群简介 */
  introduction?: string;
  /** 群公告 */
  notification?: string;
  /** 加入方式: 0-禁止申请, 1-需要审批, 2-自由加入 */
  applyJoinType?: number;
  /** 全员禁言: 0-禁言, 1-正常 */
  muteAll?: number;
}

/**
 * 群查询参数
 * @description 用于查询群信息或群成员
 */
export interface GroupQueryParams {
  /** 群组 ID */
  groupId: string;
  /** 用户 ID */
  userId?: string;
}

// ==================== API 响应类型 ====================

/**
 * 群操作结果
 */
export interface GroupOperationResult<T = any> {
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  message?: string;
  /** 返回数据 */
  data?: T;
}

// ==================== Store 状态类型 ====================

/**
 * 群 Store 状态
 */
export interface GroupState {
  /** 群成员映射表 */
  members: Record<string, GroupMember>;
  /** 群信息 */
  info: GroupInfo | null;
  /** 加载状态 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
}

// ==================== 工具类型 ====================

/**
 * 群成员角色类型
 */
export type GroupMemberRoleCode = 0 | 1 | 2 | 3;

/**
 * 群加入方式类型
 */
export type GroupJoinModeCode = 0 | 1 | 2;

/**
 * 群禁言状态类型
 */
export type GroupMuteStatusCode = 0 | 1;

/**
 * 群状态类型
 */
export type GroupStatusCode = 0 | 1;

/**
 * 审批状态类型
 */
export type ApproveStatusCode = 0 | 1 | 2;

