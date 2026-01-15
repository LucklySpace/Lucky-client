<template>
  <div :aria-label="$t('friends.requestsList')" class="friend-requests no-select" role="region">
    <!-- 头部 -->
    <header class="friend-requests__header">
      <div class="friend-requests__title">{{ $t("contacts.friendRequests") }}</div>
      <div class="friend-requests__subtitle">{{ $t("contacts.pendingRequests", { count: pendingCount }) }}</div>
      <el-button size="small" type="text" @click="refresh">
        <i class="iconfont icon-refresh" /> {{ $t("contacts.refresh") }}
      </el-button>
    </header>

    <!-- 主体 -->
    <main class="friend-requests__body">
      <div v-if="!hasRequests" class="friend-requests__empty">{{ $t("contacts.noRequests") }}</div>

      <ul v-else class="friend-requests__list">
        <li v-for="req in requests" :key="req.id" class="friend-requests__item">
          <!-- 头像 -->
          <Avatar :avatar="req.avatar || ' '" :name="req.name" :width="64" :borderRadius="6" />

          <!-- 信息 -->
          <div class="friend-requests__info">
            <div class="friend-requests__name">{{ req.name }}</div>
            <div class="friend-requests__message" :class="{ 'friend-requests__message--muted': !req.message }">
              {{ req.message || $t("contacts.defaultRequestMsg") }}
            </div>
          </div>

          <!-- 操作 -->
          <div class="friend-requests__actions">
            <template v-if="isPending(req)">
              <el-button :loading="isLoading(req.id, 'accept')" size="small" type="primary"
                @click="handleApprove(req, ACCEPTED.code)">
                {{ $t("contacts.accept") }}
              </el-button>
              <el-button :loading="isLoading(req.id, 'reject')" size="small" @click="handleApprove(req, REJECTED.code)">
                {{ $t("contacts.reject") }}
              </el-button>
            </template>

            <span v-else class="friend-requests__badge" :class="getStatusClass(req)">
              {{ isAccepted(req) ? $t("contacts.accepted") : $t("contacts.rejected") }}
            </span>
          </div>
        </li>
      </ul>
    </main>
  </div>
</template>

<script lang="ts" setup>
import { computed, reactive } from "vue";
import { ElMessage } from "element-plus";
import { useFriendsStore } from "@/store/modules/friends";
import { FriendRequestStatus } from "@/constants";
import Avatar from "@/components/Avatar/index.vue";

interface FriendRequest {
  id: string;
  name?: string;
  avatar?: string;
  message?: string;
  approveStatus?: number; // 0: 待处理, 1: 已接受, 2: 已拒绝
}

type LoadingAction = "accept" | "reject";

const { PENDING, ACCEPTED, REJECTED } = FriendRequestStatus;

const friendStore = useFriendsStore();
const loadingMap = reactive<Record<string, Record<LoadingAction, boolean>>>({});

const requests = computed<FriendRequest[]>(() =>
  (friendStore as any).newFriends ?? (friendStore as any).requests ?? []
);

const hasRequests = computed(() => requests.value.length > 0);

const pendingCount = computed(() =>
  requests.value.filter((req) => isPending(req)).length
);

// 状态判断
const isPending = (req: FriendRequest) => req.approveStatus === PENDING.code;
const isAccepted = (req: FriendRequest) => req.approveStatus === ACCEPTED.code;

const getStatusClass = (req: FriendRequest): string =>
  isAccepted(req) ? "friend-requests__badge--accepted" : "friend-requests__badge--rejected";

// Loading 状态
const isLoading = (id: string | undefined, action: LoadingAction): boolean => {
  if (!id) return false;
  return loadingMap[id]?.[action] ?? false;
};

const setLoading = (id: string, action: LoadingAction, value: boolean) => {
  if (!loadingMap[id]) {
    loadingMap[id] = { accept: false, reject: false };
  }
  loadingMap[id][action] = value;
};

// 操作
const refresh = () => {
  try {
    (friendStore as any).loadNewFriends?.();
    ElMessage.info("刷新中…");
  } catch {
    ElMessage.error("刷新失败");
  }
};

// 处理好友请求
const handleApprove = async (req: FriendRequest, status: typeof ACCEPTED.code | typeof REJECTED.code) => {
  if (!req?.id || !isPending(req)) return;

  const isAccept = status === ACCEPTED.code;
  const action: LoadingAction = isAccept ? "accept" : "reject";
  setLoading(req.id, action, true);

  try {
    await (friendStore as any).handleApproveContact?.(req, status);
    if(isAccept){
      friendStore.loadContacts?.();
    }
    ElMessage.success(isAccept ? ACCEPTED.type : REJECTED.type);
  } catch {
    ElMessage.error("操作失败，请稍后重试");
  } finally {
    setLoading(req.id, action, false);
  }
};
</script>

<style lang="scss" scoped>
.friend-requests {
  height: calc(100vh - 65px);
  display: flex;
  flex-direction: column;
  background: var(--side-bg, #f5f7fa);
  color: #111827;

  &__header {
    position: sticky;
    top: 0;
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: #fff;
    border-bottom: 1px solid rgba(15, 23, 42, 0.06);
    z-index: 10;
  }

    &__title {
      font-size: 18px;
      font-weight: 700;
    }

  &__subtitle {
    flex: 1;
    color: #6b6b6b;
    font-size: 13px;
  }

  &__body {
    flex: 1;
    overflow: auto;
    padding: 16px;
  }

    &__empty {
      text-align: center;
      padding: 48px;
      color: #8b8b8b;
    }

    &__list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    &__item {
      display: flex;
      gap: 16px;
      align-items: center;
      padding: 12px;
      background: #fff;
      border-radius: 10px;
      box-shadow: 0 4px 10px rgba(15, 23, 42, 0.04);
    }

  &__info {
    flex: 1;
    min-width: 0;
  }

    &__name {
      font-weight: 600;
      font-size: 15px;
      color: #0f1724;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

  &__message {
    margin-top: 6px;
    font-size: 13px;
    color: #6b6b6b;

    &--muted {
      color: #9aa0a6;
    }
  }

  &__actions {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: flex-end;
    min-width: 180px;
  }

  &__badge {
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 13px;
    color: var(--content-font-color);
  }

    @media (max-width: 640px) {
      &__item {
        padding: 10px;
        gap: 10px;
      }

    &__actions {
      min-width: 140px;
    }
  }
}
</style>
