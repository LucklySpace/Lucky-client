<template>
  <div :aria-label="$t('friends.requestsList')" class="requests requests--fullscreen no-select" role="region">
    <!-- header -->
    <header aria-live="polite" class="requests__header" role="banner">
      <div class="requests__header-inner">
        <div class="requests__title">{{ $t("contacts.friendRequests") }}</div>
        <div class="requests__subtitle">{{ $t("contacts.pendingRequests", { count: pendingCount }) }}</div>
        <div class="requests__actions">
          <el-button :aria-label="$t('friends.refreshRequestsList')" size="small" type="text" @click="refresh">
            <i class="iconfont icon-refresh" /> {{ $t("contacts.refresh") }}
          </el-button>
        </div>
      </div>
    </header>

    <!-- body -->
    <main class="requests__body" role="main">
      <div v-if="!hasRequests" class="requests__empty" role="status">{{ $t("contacts.noRequests") }}</div>

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
              <Avatar :avatar="req.avatar || ' '" :name="req.name" :width="64" :borderRadius="6" />
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
              <el-button :loading="isLoading(req.id, 'accept')" size="small" type="primary" @click="approve(req, 1)">
                {{ $t("contacts.accept") }}
              </el-button>

              <el-button :loading="isLoading(req.id, 'reject')" size="small" @click="approve(req, 2)">
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
  /**
   * FullscreenFriendRequests.vue（简化版）
   *
   * 要点：
   * - 状态来源：优先读取后端字段 req.approveStatus（0/1/2）
   * - 本地仅存 loading 状态与本地 override（操作后用于即时反馈）
   * - 逻辑简单、易读、易维护
   */

  import { computed, reactive } from "vue";
  import { ElMessage } from "element-plus";
  import { useFriendsStore } from "@/store/modules/friends";
  import Avatar from "@/components/Avatar/index.vue";

  /* -------------------- store & data -------------------- */
  const friendStore = useFriendsStore() as any;

  /* 直接使用 store 中的原始数组（不克隆） */
  const displayRequests = computed(() => {
    // 兼容命名：newFriends / requests / friendRequests
    return friendStore.newFriends ?? friendStore.requests ?? friendStore.friendRequests ?? [];
  });
  const hasRequests = computed(() => (displayRequests.value?.length ?? 0) > 0);

  /* 本地简单状态：loadingMap[id] = { accept: boolean, reject: boolean }, overrideStatus[id] = 'accepted'|'rejected' */
  const loadingMap = reactive<Record<string, { accept: boolean; reject: boolean }>>({});
  const overrideStatus = reactive<Record<string, "accepted" | "rejected">>({});

  /* -------------------- helpers -------------------- */

  /**
   * approveStatus 后端字段映射说明：
   *   0 -> pending, 1 -> accepted, 2 -> rejected
   */
  function mapApproveStatusToKey(raw?: number | null) {
    if (raw === 1) return "accepted";
    if (raw === 2) return "rejected";
    return "pending";
  }

  /** 获取请求当前状态：优先使用本地 override（操作反馈），否则使用后端字段 */
  function getStatus(req: any): "pending" | "accepted" | "rejected" {
    if (!req || !req.id) return "pending";
    if (overrideStatus[req.id]) return overrideStatus[req.id];
    return mapApproveStatusToKey(req.approveStatus ?? 0);
  }

  /** 返回是否在 loading */
  function isLoading(id: string | number | undefined, kind: "accept" | "reject") {
    if (!id) return false;
    const s = loadingMap[String(id)];
    return !!(s && s[kind]);
  }

  /* 计算 pending 数（用于标题） */
  const pendingCount = computed(() => {
    const arr = displayRequests.value || [];
    let n = 0;
    for (let i = 0; i < arr.length; i++) {
      if (getStatus(arr[i]) === "pending") n++;
    }
    return n;
  });

  /* -------------------- actions -------------------- */

  /** 刷新（调用 store 的加载方法） */
  function refresh() {
    try {
      if (typeof friendStore.loadNewFriends === "function") friendStore.loadNewFriends();
      ElMessage.info("刷新中…");
    } catch (err) {
      console.warn("refresh failed", err);
      ElMessage.error("刷新失败");
    }
  }

  /**
   * 同意/拒绝
   * simple：status = 1 (accept) or 2 (reject)
   * 逻辑：
   *  - 设置 loading
   *  - 调用 store 处理（friendStore.handleApproveContact）
   *  - 成功后写入 overrideStatus 以即时更新 UI；如果 store 返回并更新了原数组，后端字段会覆盖它
   */
  async function approve(req: any, status: 1 | 2) {
    if (!req || !req.id) return;
    const id = String(req.id);

    // 初始化 loading map
    if (!loadingMap[id]) loadingMap[id] = { accept: false, reject: false };

    // 防重入：若已非 pending 则不允许再次操作
    if (getStatus(req) !== "pending") return;

    if (status === 1) loadingMap[id].accept = true;
    else loadingMap[id].reject = true;

    try {
      debugger
      // friendStore.handleApproveContact(req, status) 假定会调用后端并更新 store
      if (typeof friendStore.handleApproveContact === "function") {
        await friendStore.handleApproveContact(req, status);
      } else {
        // 若 store 方法不存在，模拟成功（便于测试）
        await Promise.resolve();
      }

      // 本地覆盖状态，立刻反馈 UI（后端实际数据到来时可覆盖）
      overrideStatus[id] = status === 1 ? "accepted" : "rejected";

      ElMessage.success(status === 1 ? ` 已同意` : `已拒绝`);
    } catch (err) {
      console.error("approve failed", err);
      ElMessage.error("操作失败，请稍后重试");
    } finally {
      if (status === 1) loadingMap[id].accept = false;
      else loadingMap[id].reject = false;
    }
  }

  /* 小工具：首字母回退 */
  function initials(name?: string) {
    const n = (name ?? "").trim();
    if (!n) return "#";
    return /[A-Za-z0-9]/.test(n[0]) ? n[0].toUpperCase() : n[0];
  }
</script>

<style lang="scss" scoped>
  /* 简化并使用 BEM 风格类名，样式精简易维护 */

  .requests {
    &--fullscreen {
      height: calc(100vh - 65px);
      display: flex;
      flex-direction: column;
      background: var(--side-bg, #f5f7fa);
      color: #111827;
    }

    &__header {
      position: sticky;
      top: 0;
      background: #fff;
      border-bottom: 1px solid rgba(15, 23, 42, 0.06);
      z-index: 10;
    }

    &__header-inner {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
    }

    &__title {
      font-size: 18px;
      font-weight: 700;
    }

    &__subtitle {
      color: #6b6b6b;
      font-size: 13px;
    }

    &__body {
      flex: 1 1 auto;
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

    &__left {
      width: 64px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    &__avatar {
      border-radius: 8px !important;
      width: 64px !important;
      height: 64px !important;
    }

    &__avatar-fallback {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #7cc0ff, #4aa3ff);
      color: #fff;
      font-weight: 700;
      font-size: 20px;
      border-radius: 8px;
    }

    &__center {
      flex: 1 1 auto;
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
    }

    &__message--muted {
      color: #9aa0a6;
    }

    &__right {
      width: 200px;
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: flex-end;
    }

    &__badge {
      padding: 6px 12px;
      border-radius: 999px;
      color: #fff;
      font-size: 13px;
    }

    &__badge--accepted {
      color: var(--content-font-color);
      // background: linear-gradient(90deg, #34c759, #0fbf5a);
    }

    &__badge--rejected {
      color: var(--content-font-color);
      // background: linear-gradient(90deg, #e55353, #c94141);
    }

    @media (max-width: 640px) {
      &__item {
        padding: 10px;
        gap: 10px;
      }
      &__right {
        width: 140px;
      }
      &__avatar {
        width: 56px !important;
        height: 56px !important;
      }
    }
  }
</style>
