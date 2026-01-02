<template>
  <el-aside class="sidebar no-select" width="68px">
    <!-- mac交通灯 -->
    <System v-if="currPlatform === 'macos'" about-visible class="system-wrap" />

    <!-- 顶部：头像 -->
    <div class="avatar-wrap">
      <span ref="avatarRef" shape="square" class="el-avatar" :class="avatarClass" @click="toggleAvatarPopover">
        <Avatar
          :avatar="userStore.avatar"
          :name="userStore.name"
          :width="44"
          :borderRadius="4"
          backgroundColor="var(--side-hover-color)"
          color="var(--side-bg-color)"
        ></Avatar>
      </span>
      <el-popover
        ref="avatarPopoverRef"
        :virtual-ref="avatarRef"
        placement="right"
        trigger="click"
        virtual-triggering
        width="260"
      >
        <UserPopover :contact="userStore.userInfo" :is-me="true" />
      </el-popover>
    </div>

    <!-- 中间：菜单（垂直图标） -->
    <el-menu :collapse="true" :default-active="currentPath" :router="true" class="icon-menu" @select="handleSelectMenu">
      <el-menu-item v-for="(item, index) in menuItems" :index="item.index">
        <el-badge
          :badge-style="{ 'font-size': `12px` }"
          :color="item.color"
          :hidden="item.hidden"
          :max="item.max"
          :offset="item.offset"
          :value="item.value"
          class="badge"
        >
          <i :class="item.icon" />
        </el-badge>
      </el-menu-item>
    </el-menu>

    <!-- 底部：设置 -->
    <div class="settings">
      <button ref="settingBtnRef" aria-label="settings" class="icon-btn" @click="toggleSettingPopover">
        <i class="iconfont icon-shezhi2" />
      </button>

      <el-popover
        ref="settingPopoverRef"
        :virtual-ref="settingBtnRef"
        placement="right"
        trigger="click"
        virtual-triggering
        width="180"
      >
        <ul class="settings-list">
          <li @click="openSettings">{{ $t("settings.label") }}</li>
          <li @click="logout">{{ $t("settings.logout") }}</li>
        </ul>
      </el-popover>
    </div>
  </el-aside>

  <!-- 设置对话框 -->
  <Setting
    :title="$t('settings.label')"
    :visible="settingDialogParam.showDialog"
    @handleClose="handleCloseSettingDialog"
  />

  <!-- <Dialog :modelValue="settingDialogParam.showDialog" :isMac="false" @close="settingDialogParam.showDialog = false">
    nihao
  </Dialog> -->
</template>

<script lang="ts" setup>
  import { computed, defineAsyncComponent, ref, unref } from "vue";
  import { ElMessage } from "element-plus";
  import System from "@/components/System/index.vue";
  import Avatar from "@/components/Avatar/index.vue";
  import { useUserStore } from "@/store/modules/user";
  import { useChatStore } from "@/store/modules/chat";
  import { useFriendsStore } from "@/store/modules/friends";
  import { useWebSocketWorker } from "@/hooks/useWebSocketWorker";
  import { CloseMainWindow } from "@/windows/main";
  import { ShowLoginWindow } from "@/windows/login";
  import { useSystemClose } from "@/hooks/useSystem";

  const { currPlatform } = useSystemClose();

  const Setting = defineAsyncComponent(() => import("@/views/setting/index.vue"));
  const UserPopover = defineAsyncComponent(() => import("@/components/UserPopover/index.vue"));

  const route = useRoute();
  const chatStore = useChatStore();
  const friendStore = useFriendsStore();
  const userStore = useUserStore();
  const { state } = useWebSocketWorker();

  const avatarRef = ref<HTMLElement | null>(null);
  const avatarPopoverRef = ref<any>(null);
  const settingBtnRef = ref<HTMLElement | null>(null);
  const settingPopoverRef = ref<any>(null);

  const settingDialogParam = ref({ showDialog: false });

  const DEFAULT_ROUTE = "/message";

  // 绑定到当前路由
  const currentPath = computed(() => route.path || DEFAULT_ROUTE);

  const menuItems = computed(() => [
    {
      index: "/message",
      value: chatStore.getTotalUnread,
      hidden: chatStore.getTotalUnread == 0,
      showZero: false,
      color: "#ff4d4f",
      max: 99,
      offset: [-6, -1],
      icon: "iconfont icon-faqihuihua"
    },
    {
      index: "/contact",
      value: friendStore.getTotalNewFriends,
      hidden: friendStore.getTotalNewFriends == 0,
      showZero: false,
      color: "#ff4d4f",
      max: 99,
      offset: [-6, -1],
      icon: "iconfont icon-lianxiren10"
    }
  ]);

  const avatarClass = computed(() => {
    const st = state?.status;
    return {
      "avatar-online": st === "open",
      "avatar-connecting": st === "connecting",
      "avatar-offline": st !== "open" && st !== "connecting"
    };
  });

  function handleSelectMenu() {
    chatStore.currentChat = null;
  }

  function toggleAvatarPopover() {
    // 使用 popper 实例的 show/hide 更稳
    const pop = unref(avatarPopoverRef);
    if (pop?.popperRef?.isShow) pop.hide?.();
    else pop?.show?.();
  }

  function toggleSettingPopover() {
    const pop = unref(settingPopoverRef);
    if (pop?.popperRef?.isShow) pop.hide?.();
    else pop?.show?.();
  }

  function openSettings() {
    unref(settingPopoverRef)?.hide?.();
    settingDialogParam.value.showDialog = true;
  }

  function handleCloseSettingDialog() {
    settingDialogParam.value.showDialog = false;
  }

  function logout() {
    ElMessage("退出登录");
    userStore.loginOut();
    CloseMainWindow();
    ShowLoginWindow();
  }
</script>

<style lang="scss" scoped>
  .sidebar {
    background: var(--side-bg-color);
    width: 68px;
    padding: 12px 0;
    display: flex;
    flex-direction: column;
    align-items: center; // 保留这一层居中
    box-sizing: border-box;
    overflow: hidden;

    .system-wrap {
      margin: 2px;
      width: 100%; // 确保占满宽度
      display: flex;
      justify-content: center;
    }

  .avatar-wrap {
    display: flex;
    justify-content: center;
    width: 100%;
    border-radius: 3px;
    
    .el-avatar {
      width: 44px;
      height: 44px;
    }
  }

    .icon-menu {
      width: 100%;
      background: transparent;
      border-right: none;
      margin-top: 10px;

      .el-menu-item {
        display: flex;
        justify-content: center;
        padding: 6px 0;
        color: #cdd0d6;

        .badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        i {
          font-size: 24px;
          line-height: 1;
        }

        // &:hover {
        //   background: rgba(255, 255, 255, 0.1);
        // }

        &:hover {
          background: transparent;
          color: #fff;
        }

        &.is-active {
          color: #fff;
        }
      }
    }

    .settings {
      position: absolute;
      bottom: 20px;

      .icon-btn {
        width: 44px;
        height: 44px;
        border: none;
        border-radius: 8px;
        background: transparent;
        cursor: pointer;
        display: grid;
        place-items: center;
        transition: background 0.12s ease;

        &:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        i {
          font-size: 24px;
          color: #fff;
        }
      }
    }
  }

  /* 设置弹层里的列表 */
  .settings-list {
    list-style: none;
    padding: 6px 0;
    margin: 0;

    li {
      padding: 10px 12px;
      cursor: pointer;
      border-bottom: 1px solid #f5f5f5;
      font-size: 14px;

      &:hover {
        background-color: #f5f5f5;
      }

      &:last-child {
        border-bottom: none;
      }
    }
  }

  /* 徽标样式微调：去边框、居中 */
  :deep(.el-badge__content) {
    border: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
  }
</style>
