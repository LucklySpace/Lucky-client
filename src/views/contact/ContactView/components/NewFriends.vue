<template>
  <div :aria-label="$t('friends.requestsList')" class="requests requests--fullscreen no-select" role="region">
    <!-- header -->
    <header aria-live="polite" class="requests__header" role="banner">
      <div class="requests__header-inner">
        <div class="requests__title">{{ $t("contacts.friendRequests") }}</div>
        <div class="requests__subtitle">{{ $t("contacts.pendingRequests", { count: pendingCount }) }}</div>
        <div class="requests__actions">
          <el-button 
            :aria-label="$t('friends.refreshRequestsList')" 
            size="small" 
            type="text" 
            @click="refresh"
          >
            <i class="iconfont icon-refresh" /> {{ $t("contacts.refresh") }}
          </el-button>
        </div>
      </div>
    </header>

    <!-- body -->
    <main class="requests__body" role="main">
      <div v-if="!hasRequests" class="requests__empty" role="status">
        {{ $t("contacts.noRequests") }}
      </div>

      <ul v-else class="requests__list" role="list">
        <li
          v-for="req in displayRequests"
          :key="req.id"
          :aria-label="$t('friends.requestFrom', { name: req.name })"
          class="requests__item"
          role="listitem"
        >
          <div class="requests__left">
            <span class="requests__avatar">
              <Avatar :avatar="req.avatar || ''" :name="req.name" :width="64" :borderRadius="6" />
            </span>
          </div>

          <div class="requests__center">
            <div class="requests__name">{{ req.name }}</div>
            <div v-if="req.message" class="requests__message">{{ req.message }}</div>
            <div v-else class="requests__message requests__message--muted">
              {{ $t("contacts.defaultRequestMsg") }}
            </div>
          </div>

          <div class="requests__right">
            <template v-if="getStatus(req) === 'pending'">
              <el-button 
                :loading="isLoading(req.id, 'accept')" 
                size="small" 
                type="primary" 
                @click="approve(req, 1)"
              >
                {{ $t("contacts.accept") }}
              </el-button>

              <el-button 
                :loading="isLoading(req.id, 'reject')" 
                size="small" 
                @click="approve(req, 2)"
              >
                {{ $t("contacts.reject") }}
              </el-button>
            </template>

            <template v-else>
              <span
                :class="{
                  'requests__badge--accepted': getStatus(req) === 'accepted',
                  'requests__badge--rejected': getStatus(req) === 'rejected'
                }"
                aria-live="polite"
                class="requests__badge"
              >
                {{ getStatus(req) === "accepted" ? $t("contacts.accepted") : $t("contacts.rejected") }}
              </span>
            </template>
          </div>
        </li>
      </ul>
    </main>
  </div>
</template>

<script lang="ts" setup>
import { computed, reactive } from "vue";
import { useI18n } from "vue-i18n";
import { ElMessage } from "element-plus";
import { useFriendsStore } from "@/store/modules/friends";
import Avatar from "@/components/Avatar/index.vue";

const { t } = useI18n();
const friendStore = useFriendsStore() as any;

/* -------------------- Data & Computeds -------------------- */

// 获取请求列表，兼容 store 中不同的命名可能
const displayRequests = computed(() => {
  return friendStore.newFriends ?? friendStore.requests ?? friendStore.friendRequests ?? [];
});

const hasRequests = computed(() => (displayRequests.value?.length ?? 0) > 0);

// 本地状态管理
const loadingMap = reactive<Record<string, { accept: boolean; reject: boolean }>>({});
const overrideStatus = reactive<Record<string, "accepted" | "rejected">>({});

// 计算待处理数量
const pendingCount = computed(() => {
  return displayRequests.value.reduce((count: number, req: any) => {
    return getStatus(req) === "pending" ? count + 1 : count;
  }, 0);
});

/* -------------------- Helpers -------------------- */

function mapApproveStatusToKey(raw?: number | null) {
  if (raw === 1) return "accepted";
  if (raw === 2) return "rejected";
  return "pending";
}

function getStatus(req: any): "pending" | "accepted" | "rejected" {
  if (!req?.id) return "pending";
  // 优先使用本地操作后的状态
  if (overrideStatus[req.id]) return overrideStatus[req.id];
  return mapApproveStatusToKey(req.approveStatus ?? 0);
}

function isLoading(id: string | number | undefined, kind: "accept" | "reject") {
  if (!id) return false;
  return !!loadingMap[String(id)]?.[kind];
}

/* -------------------- Actions -------------------- */

function refresh() {
  try {
    if (typeof friendStore.loadNewFriends === "function") {
      friendStore.loadNewFriends();
    }
    ElMessage.info(t("common.refreshing") || "刷新中…");
  } catch (err) {
    console.warn("refresh failed", err);
    ElMessage.error(t("common.refreshFailed") || "刷新失败");
  }
}

async function approve(req: any, status: 1 | 2) {
  if (!req?.id) return;
  const id = String(req.id);

  // 初始化 loading
  if (!loadingMap[id]) loadingMap[id] = { accept: false, reject: false };

  // 防止重复操作
  if (getStatus(req) !== "pending") return;

  const type = status === 1 ? "accept" : "reject";
  loadingMap[id][type] = true;

  try {
    if (typeof friendStore.handleApproveContact === "function") {
      await friendStore.handleApproveContact(req, status);
    } else {
      // 模拟请求延时
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 更新本地状态
    overrideStatus[id] = status === 1 ? "accepted" : "rejected";
    ElMessage.success(status === 1 ? t("contacts.accepted") : t("contacts.rejected"));
  } catch (err) {
    console.error("approve failed", err);
    ElMessage.error(t("common.operationFailed") || "操作失败，请稍后重试");
  } finally {
    loadingMap[id][type] = false;
  }
}
</script>

<style lang="scss" scoped>
/* 定义局部变量 */
$avatar-size: 64px;
$padding-h: 24px;

.requests {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--el-bg-color-page);
  
  &__header {
    flex-shrink: 0;
    padding: 20px $padding-h;
    background-color: var(--el-bg-color);
    border-bottom: 1px solid var(--el-border-color-light);

    &-inner {
      max-width: 800px;
      margin: 0 auto;
      display: flex;
      align-items: baseline;
      gap: 12px;
    }
  }

  &__title {
    font-size: 20px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  &__subtitle {
    font-size: 14px;
    color: var(--el-text-color-secondary);
    flex: 1;
  }

  &__body {
    flex: 1;
    overflow-y: auto;
    padding: 0 $padding-h;
  }

  &__list {
    max-width: 800px;
    margin: 20px auto;
    list-style: none;
    padding: 0;
  }

  &__item {
    display: flex;
    align-items: center;
    background-color: var(--el-bg-color);
    padding: 16px;
    border-radius: 8px;
    margin-bottom: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    transition: box-shadow 0.2s;

    &:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    }
  }

  &__left {
    margin-right: 16px;
    flex-shrink: 0;
  }

  &__center {
    flex: 1;
    min-width: 0;
    margin-right: 16px;
  }

  &__name {
    font-size: 16px;
    font-weight: 500;
    color: var(--el-text-color-primary);
    margin-bottom: 4px;
  }

  &__message {
    font-size: 14px;
    color: var(--el-text-color-regular);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    &--muted {
      color: var(--el-text-color-secondary);
      font-style: italic;
    }
  }

  &__right {
    flex-shrink: 0;
    display: flex;
    gap: 8px;
    align-items: center;
  }

  &__badge {
    font-size: 13px;
    padding: 4px 12px;
    border-radius: 4px;
    background-color: var(--el-fill-color);
    color: var(--el-text-color-secondary);

    &--accepted {
      color: var(--el-color-success);
      background-color: var(--el-color-success-light-9);
    }

    &--rejected {
      color: var(--el-color-danger);
      background-color: var(--el-color-danger-light-9);
    }
  }

  &__empty {
    padding-top: 100px;
    text-align: center;
    color: var(--el-text-color-placeholder);
    font-size: 14px;
  }
}
</style>
