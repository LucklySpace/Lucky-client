import api from "@/api/index";
import {
    Events,
    GroupMemberRole,
    GroupMuteStatus,
    MessageType,
    StoresEnum
} from "@/constants";
import { useMappers } from "@/database";
import Chats from "@/database/entity/Chats";
import { globalEventBus } from "@/hooks/useEventBus";
import { GroupOperationMessageBody } from "@/models";
import type {
    GroupApproveParams,
    GroupInfo,
    GroupInviteParams,
    GroupMember,
    GroupMemberActionParams,
    GroupSettingParams,
    GroupState
} from "@/types/group";
import { safeExecute } from "@/utils/ExceptionHandler";
import { storage } from "@/utils/Storage";
import { defineStore } from "pinia";
import { computed, reactive, ref } from "vue";
import { useFriendsStore } from "./friends";
import { useUserStore } from "./user";

// 重新导出类型供外部使用
export type {
    GroupApproveParams,
    GroupInfo,
    GroupInviteParams,
    GroupMember,
    GroupMemberActionParams,
    GroupSettingParams,
    GroupState
};

// ==================== Store 定义 ====================

export const useGroupStore = defineStore(StoresEnum.GROUP, () => {
    // ==================== 依赖 ====================
    const { chatsMapper } = useMappers();
    const userStore = useUserStore();
    const log = useLogger();

    // ==================== 状态 ====================
    const state = reactive<GroupState>({
        members: {},
        info: null,
        loading: false,
        error: null
    });

    // 当前操作的群组 ID
    const currentGroupId = ref<string | null>(null);

    // ==================== 核心工具 ====================
    const ownerId = computed(() => userStore.userId || storage.get("userId"));

    const exec = <T>(fn: () => Promise<T>, opts?: { op?: string; fallback?: T }) =>
        safeExecute(fn, { operation: opts?.op, fallback: opts?.fallback, silent: !opts?.op });

    // ==================== 计算属性 ====================
    const getters = {
        /** 当前群成员列表 */
        memberList: computed((): GroupMember[] => {
            const list = Object.values(state.members || {});
            const roleRank = (r?: number) =>
                r === GroupMemberRole.OWNER.code ? 0 :
                    r === GroupMemberRole.ADMIN.code ? 1 : 2;
            return list.sort((a, b) => {
                const ra = roleRank(a.role);
                const rb = roleRank(b.role);
                if (ra !== rb) return ra - rb;
                const na = (a.alias || a.name || String(a.userId)).toLowerCase();
                const nb = (b.alias || b.name || String(b.userId)).toLowerCase();
                return na.localeCompare(nb, "zh-CN");
            });
        }),

        /** 当前群成员（排除自己） */
        membersExcludeSelf: computed((): GroupMember[] => {
            const arr = Object.values(state.members || {}).filter(m => m?.userId !== ownerId.value);
            const roleRank = (r?: number) =>
                r === GroupMemberRole.OWNER.code ? 0 :
                    r === GroupMemberRole.ADMIN.code ? 1 : 2;
            arr.sort((a, b) => {
                const ra = roleRank(a.role);
                const rb = roleRank(b.role);
                if (ra !== rb) return ra - rb;
                const na = (a.alias || a.name || String(a.userId)).toLowerCase();
                const nb = (b.alias || b.name || String(b.userId)).toLowerCase();
                return na.localeCompare(nb, "zh-CN");
            });
            return arr.map(m => ({
                userId: String(m.userId ?? m),
                name: m.name ?? String(m.userId),
                avatar: m.avatar ?? undefined,
                role: m.role,
                alias: m.alias,
                mute: m.mute
            }));
        }),

        /** 当前用户在群中的成员信息 */
        currentMember: computed((): GroupMember | null => {
            const me = String(ownerId.value);
            return Object.values(state.members || {}).find(m => String(m?.userId) === me) ?? null;
        }),

        /** 当前用户在群中的角色 */
        currentRole: computed((): number => {
            const member = getters.currentMember.value;
            const role = member?.role ?? GroupMemberRole.MEMBER.code;
            return Number.isFinite(role) ? role : GroupMemberRole.MEMBER.code;
        }),

        /** 是否为群主 */
        isOwner: computed((): boolean => getters.currentRole.value === GroupMemberRole.OWNER.code),

        /** 是否为管理员 */
        isAdmin: computed((): boolean => getters.currentRole.value === GroupMemberRole.ADMIN.code),

        /** 是否有管理权限（群主或管理员） */
        hasAdminPermission: computed((): boolean =>
            getters.currentRole.value === GroupMemberRole.OWNER.code ||
            getters.currentRole.value === GroupMemberRole.ADMIN.code
        ),

        /** 群公告 */
        notification: computed((): string => state.info?.notification || ""),

        /** 群名称 */
        groupName: computed((): string => state.info?.groupName || ""),

        /** 禁言状态 */
        isMuted: computed((): boolean => getters.currentMember.value?.mute === GroupMuteStatus.MUTED.code || state.info?.muteAll === GroupMuteStatus.MUTED.code),

        /** 全员禁言状态 */
        isMuteAll: computed((): boolean => state.info?.muteAll === GroupMuteStatus.MUTED.code),

        /** 群成员数量 */
        memberCount: computed((): number => Object.keys(state.members || {}).length)
    };

    // ==================== 成员管理 ====================

    /**
     * 加载群成员列表
     * @param groupId 群组 ID
     */
    const loadMembers = async (groupId: string): Promise<void> => {
        if (!groupId) return;

        state.loading = true;
        currentGroupId.value = groupId;

        const res = await exec(() => api.GetGroupMember({ groupId: groupId }), { op: "loadGroupMembers" });
        if (res) {
            state.members = res as Record<string, GroupMember>;
        }

        state.loading = false;
    };

    /**
     * 加载群信息
     * @param groupId 群组 ID
     */
    const loadGroupInfo = async (groupId: string): Promise<GroupInfo | null> => {
        if (!groupId) return null;

        state.loading = true;
        const res = await exec(() => api.GetGroupInfo({ groupId }), { op: "loadGroupInfo" }) as GroupInfo | null;

        if (res) {
            state.info = res;
        }

        state.loading = false;
        return res;
    };

    /**
     * 邀请群成员
     * @param params 邀请参数
     */
    const inviteMembers = async (params: GroupInviteParams): Promise<void> => {
        if (!params.memberIds?.length) return;

        await exec(() => api.InviteGroupMember({
            groupId: params.groupId ?? currentGroupId.value ?? "",
            userId: ownerId.value,
            memberIds: params.memberIds,
            type: params.type ?? MessageType.INVITE_TO_GROUP.code,
            message: params.message,
            groupName: params.groupName
        }), { op: "inviteGroupMembers" });
    };

    /**
     * 审批群邀请
     * @param params 审批参数
     */
    const approveInvite = async (params: GroupApproveParams): Promise<void> => {
        await exec(() => api.ApproveGroup({
            requestId: params.requestId,
            groupId: params.groupId,
            userId: ownerId.value,
            inviterId: params.inviterId,
            approveStatus: params.approveStatus
        }), { op: "approveGroupInvite" });
    };

    /**
     * 踢出群成员
     * @param params 操作参数
     */
    const kickMember = async (params: GroupMemberActionParams): Promise<boolean> => {
        if (!getters.hasAdminPermission.value) {
            state.error = "没有权限执行此操作";
            return false;
        }

        const result = await exec(() => api.KickGroupMember({
            groupId: params.groupId,
            userId: ownerId.value,
            targetUserId: params.targetUserId
        }), { op: "kickGroupMember" });

        if (result !== undefined) {
            // 从本地成员列表中移除
            if (state.members[params.targetUserId]) {
                delete state.members[params.targetUserId];
            }
            return true;
        }
        return false;
    };

    /**
     * 设置/取消管理员
     * @param params 操作参数
     */
    const setAdmin = async (params: GroupMemberActionParams): Promise<boolean> => {
        if (!getters.isOwner.value) {
            state.error = "只有群主才能设置管理员";
            return false;
        }

        const result = await exec(() => api.SetGroupAdmin({
            groupId: params.groupId,
            userId: ownerId.value,
            targetUserId: params.targetUserId,
            role: params.role ?? GroupMemberRole.ADMIN.code
        }), { op: "setGroupAdmin" });

        if (result !== undefined) {
            // 更新本地成员角色
            if (state.members[params.targetUserId]) {
                state.members[params.targetUserId].role = params.role;
            }
            return true;
        }
        return false;
    };

    /**
     * 移交群主
     * @param params 操作参数
     */
    const transferOwner = async (params: GroupMemberActionParams): Promise<boolean> => {
        if (!getters.isOwner.value) {
            state.error = "只有群主才能移交群主身份";
            return false;
        }

        const result = await exec(() => api.TransferGroupOwner({
            groupId: params.groupId,
            userId: ownerId.value,
            targetUserId: params.targetUserId
        }), { op: "transferGroupOwner" });

        if (result !== undefined) {
            // 更新本地成员角色
            const me = ownerId.value;
            if (state.members[me]) {
                state.members[me].role = GroupMemberRole.MEMBER.code;
            }
            if (state.members[params.targetUserId]) {
                state.members[params.targetUserId].role = GroupMemberRole.OWNER.code;
            }
            return true;
        }
        return false;
    };

    /**
     * 禁言/取消禁言成员
     * @param params 操作参数
     */
    const muteMember = async (params: GroupMemberActionParams): Promise<boolean> => {
        if (!getters.hasAdminPermission.value) {
            state.error = "没有权限执行此操作";
            return false;
        }

        const result = await exec(() => api.MuteGroupMember({
            groupId: params.groupId,
            userId: ownerId.value,
            targetUserId: params.targetUserId,
            mute: params.mute ?? GroupMuteStatus.MUTED.code,
            muteDuration: params.muteDuration ?? 0
        }), { op: "muteGroupMember" });

        if (result !== undefined) {
            // 更新本地成员禁言状态
            if (state.members[params.targetUserId]) {
                state.members[params.targetUserId].mute = params.mute;
                if (params.mute === GroupMuteStatus.MUTED.code && params.muteDuration) {
                    state.members[params.targetUserId].muteEndTime = Date.now() + params.muteDuration * 1000;
                } else {
                    state.members[params.targetUserId].muteEndTime = undefined;
                }
            }
            return true;
        }
        return false;
    };

    /**
     * 更新群成员信息（群昵称/备注）
     * @param params 操作参数
     */
    const updateMemberInfo = async (params: GroupMemberActionParams): Promise<boolean> => {
        const result = await exec(() => api.UpdateGroupMember({
            groupId: params.groupId,
            userId: ownerId.value,
            targetUserId: params.targetUserId,
            alias: params.alias,
            remark: params.remark
        }), { op: "updateGroupMember" });

        if (result !== undefined) {
            // 更新本地成员信息
            if (state.members[params.targetUserId]) {
                if (params.alias) state.members[params.targetUserId].alias = params.alias;
            }
            return true;
        }
        return false;
    };

    // ==================== 群设置管理 ====================

    /**
     * 更新群信息
     * @param params 设置参数
     * @param chatId 会话 ID（可选）
     */
    const updateGroupInfo = async (
        params: GroupSettingParams,
        chatId?: string | number
    ): Promise<boolean> => {
        const payload: any = {
            groupId: params.groupId,
            userId: ownerId.value
        };

        if (params.groupName) payload.groupName = params.groupName;
        if (params.avatar) payload.avatar = params.avatar;
        if (params.introduction) payload.introduction = params.introduction;
        if (params.notification) payload.notification = params.notification;

        const result = await api.updateGroupInfo(payload);
        if (!result) {
            state.error = "更新群信息失败";
            return false;
        }

        // 更新本地状态
        if (state.info && state.info.groupId === params.groupId) {
            if (params.groupName) state.info.groupName = params.groupName;
            if (params.avatar) state.info.avatar = params.avatar;
            if (params.introduction) state.info.introduction = params.introduction;
            if (params.notification) state.info.notification = params.notification;
        }

        // 更新 friends store 中的群列表
        const friendsStore = useFriendsStore();
        const gIdx = friendsStore.groups.findIndex((g: any) => String(g.groupId) === String(params.groupId));
        if (gIdx !== -1) {
            if (params.groupName) friendsStore.groups[gIdx].groupName = params.groupName;
            if (params.notification) (friendsStore.groups[gIdx] as any).notification = params.notification;
        }
        if (friendsStore.shipInfo && String((friendsStore.shipInfo as any).groupId) === String(params.groupId)) {
            if (params.groupName) (friendsStore.shipInfo as any).groupName = params.groupName;
            if (params.notification) (friendsStore.shipInfo as any).notification = params.notification;
        }

        // 更新 chats 数据库
        const chatKey = chatId ?? params.groupId;
        if (params.groupName) {
            await chatsMapper.updateById(chatKey, { name: params.groupName } as Chats);
            await chatsMapper.insertOrUpdateFTS({ chatId: chatKey, name: params.groupName } as any);
        }
        if (params.notification) {
            await chatsMapper.updateById(chatKey, { notification: params.notification } as any);
        }

        // 发送事件通知
        if (params.groupName) {
            globalEventBus.emit(Events.GROUP_RENAMED as any, {
                groupId: params.groupId,
                groupName: params.groupName
            });
        }
        if (params.notification) {
            globalEventBus.emit(Events.GROUP_NOTICE_CHANGED as any, {
                groupId: params.groupId,
                chatId: chatKey,
                content: params.notification
            });
        }

        return true;
    };

    /**
     * 设置群加入方式
     * @param groupId 群组 ID
     * @param joinMode 加入方式
     */
    const setJoinMode = async (groupId: string, joinMode: number): Promise<boolean> => {
        if (!getters.hasAdminPermission.value) {
            state.error = "没有权限执行此操作";
            return false;
        }

        const result = await exec(() => api.SetGroupJoinMode({
            groupId,
            userId: ownerId.value,
            applyJoinType: joinMode
        }), { op: "setGroupJoinMode" });

        if (result !== undefined) {
            if (state.info) {
                state.info.applyJoinType = joinMode;
            }
            return true;
        }
        return false;
    };

    /**
     * 设置/取消全员禁言
     * @param groupId 群组 ID
     * @param muteAll 禁言状态
     */
    const setMuteAll = async (groupId: string, muteAll: number): Promise<boolean> => {
        if (!getters.hasAdminPermission.value) {
            state.error = "没有权限执行此操作";
            return false;
        }

        const result = await exec(() => api.MuteAllGroupMembers({
            groupId,
            userId: ownerId.value,
            muteAll
        }), { op: "setMuteAll" });

        if (result !== undefined) {
            if (state.info) {
                state.info.muteAll = muteAll;
            }
            return true;
        }
        return false;
    };

    /**
     * 设置群公告
     * @param groupId 群组 ID
     * @param notification 公告内容
     * @param chatId 会话 ID（可选）
     */
    const setAnnouncement = async (
        groupId: string,
        notification: string,
        chatId?: string | number
    ): Promise<boolean> => {
        if (!getters.hasAdminPermission.value) {
            state.error = "没有权限执行此操作";
            return false;
        }

        const result = await exec(() => api.SetGroupAnnouncement({
            groupId,
            userId: ownerId.value,
            notification
        }), { op: "setGroupAnnouncement" });

        if (result !== undefined) {
            if (state.info) {
                state.info.notification = notification;
            }

            // 更新数据库
            const chatKey = chatId ?? groupId;
            await chatsMapper.updateById(chatKey, { notification } as any);

            // 发送事件通知
            globalEventBus.emit(Events.GROUP_NOTICE_CHANGED as any, {
                groupId,
                chatId: chatKey,
                content: notification
            });

            return true;
        }
        return false;
    };

    const applyGroupOperation = (code: number, op: GroupOperationMessageBody): void => {
        if (!op || !op.groupId) return;

        const handlers: Record<number, (o: GroupOperationMessageBody) => void> = {
            [MessageType.KICK_FROM_GROUP.code]: (o) => {
                if (o.targetUserId && state.members[o.targetUserId]) {
                    delete state.members[o.targetUserId];
                }
            },
            [MessageType.PROMOTE_TO_ADMIN.code]: (o) => {
                if (o.targetUserId && state.members[o.targetUserId]) {
                    state.members[o.targetUserId].role = GroupMemberRole.ADMIN.code;
                }
            },
            [MessageType.DEMOTE_FROM_ADMIN.code]: (o) => {
                if (o.targetUserId && state.members[o.targetUserId]) {
                    state.members[o.targetUserId].role = GroupMemberRole.MEMBER.code;
                }
            },
            [MessageType.TRANSFER_GROUP_OWNER.code]: (o) => {
                const prevOwner = o.operatorId;
                if (prevOwner && state.members[prevOwner]) {
                    state.members[prevOwner].role = GroupMemberRole.MEMBER.code;
                }
                if (o.targetUserId && state.members[o.targetUserId]) {
                    state.members[o.targetUserId].role = GroupMemberRole.OWNER.code;
                }
            },
            [MessageType.MUTE_MEMBER.code]: (o) => {
                if (o.targetUserId && state.members[o.targetUserId]) {
                    state.members[o.targetUserId].mute = GroupMuteStatus.MUTED.code;
                    const dur = Number((o.extra?.muteDuration as any) ?? 0);
                    state.members[o.targetUserId].muteEndTime = dur > 0 ? Date.now() + dur * 1000 : undefined;
                }
            },
            [MessageType.UNMUTE_MEMBER.code]: (o) => {
                if (o.targetUserId && state.members[o.targetUserId]) {
                    state.members[o.targetUserId].mute = GroupMuteStatus.NORMAL.code;
                    state.members[o.targetUserId].muteEndTime = undefined;
                }
            },
            [MessageType.MUTE_ALL.code]: (o) => {
                if (state.info && state.info.groupId === o.groupId) {
                    state.info.muteAll = GroupMuteStatus.MUTED.code;
                }
            },
            [MessageType.UNMUTE_ALL.code]: (o) => {
                if (state.info && state.info.groupId === o.groupId) {
                    state.info.muteAll = GroupMuteStatus.NORMAL.code;
                }
            },
            [MessageType.SET_MEMBER_ROLE.code]: (o) => {
                const newRole = Number((o.extra?.newRole as any) ?? GroupMemberRole.MEMBER.code);
                if (o.targetUserId && state.members[o.targetUserId]) {
                    state.members[o.targetUserId].role = newRole;
                }
            },
            [MessageType.SET_GROUP_INFO.code]: (o) => {
                if (state.info && state.info.groupId === o.groupId) {
                    if (o.groupName) state.info.groupName = o.groupName;
                    if (o.groupAvatar) state.info.avatar = o.groupAvatar;
                }
            },
            [MessageType.SET_GROUP_ANNOUNCEMENT.code]: (o) => {
                const content = String((o.extra?.announcement as any) ?? o.description ?? "");
                if (state.info && state.info.groupId === o.groupId && content) {
                    state.info.notification = content;
                }
            },
            [MessageType.SET_GROUP_JOIN_MODE.code]: (o) => {
                const mode = Number((o.extra?.joinMode as any) ?? state.info?.applyJoinType ?? 0);
                if (state.info && state.info.groupId === o.groupId) {
                    state.info.applyJoinType = mode;
                }
            },
            [MessageType.REMOVE_GROUP.code]: (o) => {
                if (state.info && state.info.groupId === o.groupId) {
                    state.members = {};
                    state.info = null;
                    currentGroupId.value = null;
                }
            },
            [MessageType.JOIN_GROUP.code]: (o) => {
                void loadMembers(o.groupId);
            },
            [MessageType.LEAVE_GROUP.code]: (o) => {
                if (o.targetUserId && state.members[o.targetUserId]) {
                    delete state.members[o.targetUserId];
                }
            },
        };

        try {
            const handler = handlers[op.operationType];
            if (handler) {
                handler(op);
            } else {
                log.prettyWarn("group", `未处理的群组操作类型: ${op.operationType}`, op);
            }
        } catch (e) {
            log.prettyError("group", "应用群组操作失败", e);
        }
    };

    /**
     * 解散群组
     * @param groupId 群组 ID
     */
    const dismissGroup = async (groupId: string): Promise<boolean> => {
        if (!getters.isOwner.value) {
            state.error = "只有群主才能解散群组";
            return false;
        }

        const result = await exec(() => api.DismissGroup({
            groupId,
            userId: ownerId.value
        }), { op: "dismissGroup" });

        if (result !== undefined) {
            // 清空本地状态
            state.members = {};
            state.info = null;
            currentGroupId.value = null;
            return true;
        }
        return false;
    };

    /**
     * 退出群聊
     * @param groupId 群组 ID
     */
    const quitGroup = async (groupId: string): Promise<boolean> => {
        if (getters.isOwner.value) {
            state.error = "群主不能退出群聊，请先移交群主身份或解散群组";
            return false;
        }

        const result = await exec(() => api.QuitGroups({
            groupId,
            userId: ownerId.value
        }), { op: "quitGroup" });

        if (result !== undefined) {
            // 清空本地状态
            state.members = {};
            state.info = null;
            currentGroupId.value = null;
            return true;
        }
        return false;
    };

    // ==================== 工具方法 ====================

    /**
     * 重置状态
     */
    const reset = () => {
        state.members = {};
        state.info = null;
        state.loading = false;
        state.error = null;
        currentGroupId.value = null;
    };

    /**
     * 设置成员数据（供外部直接设置）
     * @param members 成员数据
     */
    const setMembers = (members: Record<string, GroupMember>) => {
        state.members = members;
    };

    /**
     * 获取成员信息
     * @param userId 用户 ID
     */
    const getMember = (userId: string): GroupMember | null => {
        return state.members[userId] ?? null;
    };

    /**
     * 检查是否存在指定成员
     * @param userId 用户 ID
     */
    const hasMember = (userId: string): boolean => {
        return !!state.members[String(userId)];
    };

    /**
     * 检查用户是否为管理员或群主
     * @param userId 用户 ID
     */
    const isAdminOrOwner = (userId: string): boolean => {
        const member = state.members[userId];
        if (!member) return false;
        return member.role === GroupMemberRole.OWNER.code || member.role === GroupMemberRole.ADMIN.code;
    };

    /**
     * 检查用户是否被禁言
     * @param userId 用户 ID
     */
    const isMuted = (userId: string): boolean => {
        const member = state.members[userId];
        if (!member) return false;

        // 检查全员禁言
        if (state.info?.muteAll === GroupMuteStatus.MUTED.code) {
            // 管理员和群主不受全员禁言影响
            if (!isAdminOrOwner(userId)) return true;
        }

        // 检查个人禁言
        if (member.mute === GroupMuteStatus.MUTED.code) {
            // 检查禁言是否过期
            if (member.muteEndTime && member.muteEndTime < Date.now()) {
                member.mute = GroupMuteStatus.NORMAL.code;
                return false;
            }
            return true;
        }

        return false;
    };

    // ==================== 导出 ====================
    return {
        // 状态
        state,
        currentGroupId,
        members: computed({ get: () => state.members, set: v => { state.members = v; } }),
        info: computed({ get: () => state.info, set: v => { state.info = v; } }),
        loading: computed({ get: () => state.loading, set: v => { state.loading = v; } }),
        error: computed({ get: () => state.error, set: v => { state.error = v; } }),

        // 计算属性
        getMemberList: getters.memberList,
        getMembersExcludeSelf: getters.membersExcludeSelf,
        getCurrentMember: getters.currentMember,
        getCurrentRole: getters.currentRole,
        getIsOwner: getters.isOwner,
        getIsAdmin: getters.isAdmin,
        getHasAdminPermission: getters.hasAdminPermission,
        getNotification: getters.notification,
        getGroupName: getters.groupName,
        getIsMuted: getters.isMuted,
        getIsMuteAll: getters.isMuteAll,
        getMemberCount: getters.memberCount,
        getOwnerId: ownerId,

        // 成员管理
        loadMembers,
        loadGroupInfo,
        inviteMembers,
        approveInvite,
        kickMember,
        setAdmin,
        transferOwner,
        muteMember,
        updateMemberInfo,

        // 群设置管理
        updateGroupInfo,
        setJoinMode,
        setMuteAll,
        setAnnouncement,
        dismissGroup,
        quitGroup,

        // 工具方法
        reset,
        setMembers,
        getMember,
        hasMember,
        isAdminOrOwner,
        isMuted,
        applyGroupOperation,

        // 状态管理
        setLoading: (v: boolean) => { state.loading = v; },
        setError: (e: string | null) => { state.error = e; if (e) log.error?.("[GroupStore]", e); }
    };
}, {
    persist: [
        {
            key: `${StoresEnum.GROUP}_local`,
            paths: [],
            storage: localStorage
        },
        {
            key: `${StoresEnum.GROUP}_session`,
            paths: ["state.members", "state.info", "currentGroupId"],
            storage: sessionStorage
        }
    ]
});
