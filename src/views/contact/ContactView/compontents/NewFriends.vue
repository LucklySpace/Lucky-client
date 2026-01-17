<template>
  <div :aria-label="$t('friends.requestsList')" class="friend-requests no-select" role="region">
    <!-- 头部区域 -->
    <header class="friend-requests__header">
      <div class="friend-requests__header-left">
        <h2 class="friend-requests__title">{{ $t("contacts.friendRequests") }}</h2>
        <el-tag v-if="pendingCount > 0" class="friend-requests__count" round size="small">
          {{ pendingCount }}
        </el-tag>
      </div>
      <el-button :loading="isRefreshing" circle size="small" @click="refresh">
        <el-icon>
          <Refresh />
        </el-icon>
      </el-button>
    </header>

    <!-- 列表主体 -->
    <main class="friend-requests__body">
      <el-scrollbar>
        <div v-if="!hasRequests" class="friend-requests__empty">
          <el-empty :description="$t('contacts.noRequests')" />
        </div>

        <transition-group v-else class="friend-requests__list" name="list" tag="ul">
          <li v-for="req in requests" :key="req.id" class="friend-requests__item">
            <!-- 用户头像 -->
            <Avatar :avatar="req.avatar || ''" :name="req.name" :width="48" />

            <!-- 请求信息 -->
            <div class="friend-requests__info">
              <div class="friend-requests__name">{{ req.name || $t("contacts.unknownUser") }}</div>
              <div class="friend-requests__message" :class="{ 'friend-requests__message--empty': !req.message }">
                {{ req.message || $t("contacts.defaultRequestMsg") }}
              </div>
            </div>

            <!-- 操作区域 -->
            <div class="friend-requests__actions">
              <template v-if="isPending(req)">
                <el-button :loading="isLoading(req.id, 'accept')" size="small" type="primary"
                  @click="handleApprove(req, ACCEPTED.code)">
                  <el-icon :size="16">
                    <Check />
                  </el-icon>
                </el-button>
                <el-button :loading="isLoading(req.id, 'reject')" size="small"
                  @click="handleApprove(req, REJECTED.code)">
                  <el-icon :size="16">
                    <Close />
                  </el-icon>
                </el-button>
              </template>

              <div v-else class="friend-requests__status" :class="getStatusClass(req)">
                <el-icon v-if="isAccepted(req)">
                  <CircleCheck />
                </el-icon>
                <el-icon v-else>
                  <CircleClose />
                </el-icon>
                <span>{{ isAccepted(req) ? $t("contacts.accepted") : $t("contacts.rejected") }}</span>
              </div>
            </div>
          </li>
        </transition-group>
      </el-scrollbar>
    </main>
  </div>
</template>

<script lang="ts" setup>
import { computed, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import { useI18n } from "vue-i18n";
import { Refresh, Check, Close, CircleCheck, CircleClose } from "@element-plus/icons-vue";
import { useFriendsStore } from "@/store/modules/friends";
import { FriendRequestStatus } from "@/constants";
import Avatar from "@/components/Avatar/index.vue";

// ===================== 类型定义 =====================

interface FriendRequest {
  id: string;
  name?: string;
  avatar?: string;
  message?: string;
  approveStatus?: number;
}

type ActionType = "accept" | "reject";

// ===================== 常量 & Store =====================

const { t } = useI18n();
const { PENDING, ACCEPTED, REJECTED } = FriendRequestStatus;
const friendStore = useFriendsStore();

// ===================== 状态变量 =====================

const isRefreshing = ref(false);
const loadingMap = reactive<Record<string, Partial<Record<ActionType, boolean>>>>({});

// ===================== 计算属性 =====================

/** 请求列表 */
const requests = computed<FriendRequest[]>(() => friendStore.newFriends || []);

/** 是否有请求 */
const hasRequests = computed(() => requests.value.length > 0);

/** 待处理计数 */
const pendingCount = computed(() => requests.value.filter(isPending).length);

// ===================== 辅助函数 =====================

const isPending = (req: FriendRequest) => req.approveStatus === PENDING.code;
const isAccepted = (req: FriendRequest) => req.approveStatus === ACCEPTED.code;

const getStatusClass = (req: FriendRequest): string =>
  isAccepted(req) ? "friend-requests__status--accepted" : "friend-requests__status--rejected";

const isLoading = (id: string, action: ActionType): boolean => loadingMap[id]?.[action] ?? false;

// ===================== 核心操作 =====================

/** 刷新列表 */
const refresh = async () => {
  if (isRefreshing.value) return;
  isRefreshing.value = true;
  try {
    await friendStore.loadNewFriends();
    ElMessage.success(t("contacts.syncSuccess", "同步成功"));
  } catch {
    ElMessage.error(t("contacts.syncFailed", "同步失败"));
  } finally {
    isRefreshing.value = false;
  }
};

/** 处理审批 */
const handleApprove = async (req: FriendRequest, status: number) => {
  if (!req?.id || !isPending(req)) return;

  const isAccept = status === ACCEPTED.code;
  const action: ActionType = isAccept ? "accept" : "reject";

  if (!loadingMap[req.id]) loadingMap[req.id] = {};
  loadingMap[req.id]![action] = true;

  try {
    await friendStore.handleApproveContact(req, status);

    if (isAccept) {
      // 同意后刷新联系人列表
      await friendStore.loadContacts();
    }

    ElMessage.success(isAccept ? ACCEPTED.type : REJECTED.type);
  } catch (err) {
    console.error("Approve contact error:", err);
    ElMessage.error(t("contacts.actionFailed", "操作失败"));
  } finally {
    if (loadingMap[req.id]) loadingMap[req.id]![action] = false;
  }
};
</script>

<style lang="scss" scoped>
.friend-requests {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--content-bg-color, #f9fafb);
  overflow: hidden;

  &__header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    background: var(--header-bg-color, #ffffff);
    border-bottom: 1px solid var(--main-border-color, #e5e7eb);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
    z-index: 10;

    &-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
  }

  &__title {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: var(--header-font-color, #111827);
  }

  &__count {
    height: 18px;
    padding: 0 6px;
    font-size: 11px;
    font-weight: 600;
  }

  &__body {
    flex: 1;
    min-height: 0;
  }

  &__empty {
    padding-top: 60px;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 20px;
    margin: 0;
    list-style: none;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 14px;
    background: var(--header-bg-color, #ffffff);
    border: 1px solid var(--main-border-color, #f0f2f5);
    border-radius: 12px;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);

    &:hover {
      border-color: var(--side-active-bg-color, #409eff);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
      transform: translateY(-1px);
    }
  }

  &__info {
    flex: 1;
    min-width: 0;
  }

  &__name {
    font-size: 15px;
    font-weight: 600;
    color: var(--header-font-color, #1a1a1a);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__message {
    margin-top: 4px;
    font-size: 13px;
    color: var(--content-message-font-color, #6b7280);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;

    &--empty {
      color: var(--content-message-font-color, #9ca3af);
      font-style: italic;
    }
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
  }

  &__status {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    font-weight: 500;
    padding: 4px 10px;
    border-radius: 6px;

    &--accepted {
      // color: var(--success-color);
      // background: rgba(16, 185, 129, 0.08);
    }

    &--rejected {
      // color: var(--main-red-color, #ef4444);
      // background: rgba(239, 68, 68, 0.08);
    }

    .el-icon {
      font-size: 16px;
    }
  }
}

// 列表动画
.list-enter-active,
.list-leave-active {
  transition: all 0.4s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

.list-move {
  transition: transform 0.4s ease;
}
</style>
