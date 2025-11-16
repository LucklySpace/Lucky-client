<template>
  <article class="msg">
    <!-- 系统消息：仅渲染气泡 -->
    <section v-if="isSystem" :aria-label="$t('messages.system')" class="msg--system">
      <div class="msg__system-bubble">
        <Suspense>
          <template #default>
            <component :is="currentComponent" :message="message" />
          </template>
          <template #fallback>
            <div class="msg__loading">{{ $t("messages.loading") }}</div>
          </template>
        </Suspense>
      </div>
    </section>

    <!-- 非系统消息：头像/昵称/气泡/气泡弹出 -->
    <section v-else :class="['msg__row', { 'msg__row--owner': message.isOwner }]">
      <div v-if="more || time" class="msg__meta">
        <button
          v-if="more"
          :aria-label="$t('messages.viewMoreHistory')"
          class="msg__more no-select"
          type="button"
          @click="handleMoreMessage"
        >
          <span>{{ $t("messages.viewMoreMessages") }}</span>
        </button>

        <time v-if="time" :datetime="new Date(message.messageTime).toISOString()" class="msg__time no-select">
          <span>{{ useFriendlyTime(message.messageTime, "yyyy-MM-dd", true) }}</span>
        </time>
      </div>

      <!-- 左侧头像（仅当非本人） -->
      <span
        v-show="!message.isOwner"
        ref="leftAvatarRef"
        @click="handleSelectAvatar"
        class="msg__avatar msg__avatar--left lazy-img no-select"
      >
          <Avatar
            :avatar="message.avatar"
            :name="message.remark ?? message.name"
            :width="35"
          ></Avatar>
          <!-- {{ message.avatar }}, {{ message.name }} -->
      </span>
      <!-- <el-image
        v-show="!message.isOwner"
        ref="leftAvatarRef"
        :src="message.avatar"
        class="msg__avatar msg__avatar--left lazy-img no-select"
        loading="lazy"
        @click="handleSelectAvatar"
      /> -->

      <!-- 消息内容 -->
      <div :class="['msg__content', { 'msg__content--owner': message.isOwner }]">
        <header :class="['msg__author', { 'msg__author--owner': message.isOwner }]">
          {{ message.name }}
        </header>

        <div class="msg__bubble">
          <Suspense>
            <template #default>

              <component
                :is="currentComponent"
                v-if="currentComponent"
                :key="message.messageId"
                :message="message"
              />

            </template>
          </Suspense>
        </div>
      </div>

      <!-- 右侧头像（仅本人） -->
      <span
         v-show="message.isOwner"
         @click="handleSelectAvatar"
         class="msg__avatar msg__avatar--right lazy-img no-select">
          <Avatar
          ref="rightAvatarRef"
          :avatar="message.avatar"
          :name="message.name"
          :width="35"
          :borderRadius="3"
        ></Avatar>
       </span>
      <!-- <el-image
        v-show="message.isOwner"
        ref="rightAvatarRef"
        :src="message.avatar"
        class="msg__avatar msg__avatar--right lazy-img no-select"
        loading="lazy"
        @click="handleSelectAvatar"
      /> -->
    </section>

    <!-- 头像弹出 -->
    <el-popover
      ref="avatarPopoverRef"
      :auto-close="5000"
      :offset="-15"
      :placement="message?.isOwner ? 'left-end' : 'right-end'"
      :show-arrow="false"
      :virtual-ref="message.isOwner ? rightAvatarRef : leftAvatarRef"
      popper-class="msg__popover"
      trigger="click"
      virtual-triggering
      width="250"
    >
      <template #default>
        <UserPopover :contact="userInfo" :is-me="message.isOwner" />
      </template>
    </el-popover>
  </article>
</template>

<script lang="ts" setup>
  const VideoBubble = defineAsyncComponent(() => import("@/components/Bubble/video.vue"));
  const TextBubble = defineAsyncComponent(() => import("@/components/Bubble/text.vue"));
  const FileBubble = defineAsyncComponent(() => import("@/components/Bubble/file.vue"));
  const AudioBubble = defineAsyncComponent(() => import("@/components/Bubble/audio.vue"));
  const ImageBubble = defineAsyncComponent(() => import("@/components/Bubble/image.vue"));
  const SystemBubble = defineAsyncComponent(() => import("@/components/Bubble/system.vue"));
  const GroupInviteBubble = defineAsyncComponent(() => import("@/components/Bubble/groupInvite.vue"));
  const UserPopover = defineAsyncComponent(() => import("@/components/UserPopover/index.vue"));
  import Avatar from "@/components/Avatar/index.vue";
  import { useFriendsStore } from "@/store/modules/friends";
  import { useUserStore } from "@/store/modules/user";
  import { MessageContentType } from "@/constants";
  import { useTimeFormat } from "@/hooks/useTimeFormat";

  const { useFriendlyTime } = useTimeFormat();

  const userStore = useUserStore();
  const friendStore = useFriendsStore();

  const avatarPopoverRef = ref();
  const leftAvatarRef = ref();
  const rightAvatarRef = ref();

  const props = defineProps({
    message: {
      type: Object,
      required: true,
      default: () => ({})
    },
    time: {
      type: Boolean,
      required: true,
      default: false
    },
    more: {
      type: Boolean,
      required: true,
      default: false
    }
  });

  const { message } = toRefs(props);
  const userInfo = ref();

  const emit = defineEmits(["handleMoreMessage"]);

  const componentMap = {
    [MessageContentType.TEXT.code]: TextBubble,
    [MessageContentType.IMAGE.code]: ImageBubble,
    [MessageContentType.AUDIO.code]: AudioBubble,
    [MessageContentType.VIDEO.code]: VideoBubble,
    [MessageContentType.FILE.code]: FileBubble,
    [MessageContentType.GROUP_INVITE.code]: GroupInviteBubble,
    [MessageContentType.TIP.code]: SystemBubble
  };

  const currentComponent = computed(() => componentMap[props.message?.messageContentType]);

  const isSystem = computed(() => props.message?.messageContentType === MessageContentType.TIP.code);

  const handleMoreMessage = () => emit("handleMoreMessage");

  const handleSelectAvatar = async () => {
    const msg = message.value as any;
    if (msg.isOwner) {
      userInfo.value = userStore.userInfo;
    } else {
      userInfo.value = await friendStore.handleGetContactInfo(msg.fromId);
    }
  };
</script>

<style lang="scss" scoped>
  // 基础变量（可扩展为全局变量）
  $avatar-size: 40px;
  $avatar-size-sm: 36px;
  $gap: 12px;
  $meta-padding-x: 6px;
  $max-content-width: 70%;
  $transition-fast: 0.2s;

  .msg {
    min-height: 0;
    // 每条消息间距
    //margin: 6px 0;

    // 系统消息样式（居中）
    &--system {
      display: flex;
      justify-content: center;
      // padding: 6px 0;

      .msg__system-bubble {
        font-size: 12px;
        padding: 10px 16px;
        max-width: 70%;
        text-align: center;
        line-height: 1.5;
        // box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        backdrop-filter: blur(6px);
        // border-radius: 12px;
      }
    }

    // ---------- 主行：meta + body ----------
    &__row {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      padding: 10px 10px 20px 10px;
      transition: background-color $transition-fast ease, transform $transition-fast ease;
      gap: $gap;

      // &:hover {
      //   background-color: rgba(0, 0, 0, 0.02);
      //   border-radius: 8px;
      // }

      // 当为自己消息时使用修饰类
      //&--owner {
      // 通过子元素 .msg__content--owner 来推到右侧
      //}

      // meta 行（占满整行，居中）
      & > .msg__meta {
        order: 0;
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 12px;
        padding: 0 $meta-padding-x;

        // 更细致的 grid 布局支持两行显示（more + time）
        display: grid;
        grid-template-rows: auto auto;
        row-gap: 8px;
        justify-items: center;
      }

      // 头像（左右两个变体）
      & > .msg__avatar {
        order: 1;
        flex: 0 0 $avatar-size;
        margin-top: 16px;
        border-radius: 6px;
        cursor: pointer;
        transition: transform $transition-fast ease, box-shadow $transition-fast ease;
        // box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
        border: 2px solid transparent;

        // &:hover {
        //   transform: scale(1.05);
        //   box-shadow: 0 4px 8px rgba(0, 0, 0, 0.12);
        //   border-color: var(--content-active-color, #409eff);
        // }

        &--left {
          order: 1;
        }

        &--right {
          order: 2;
        }
      }

      // 内容容器
      .msg__content {
        order: 1;
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-width: 0;
        // 限制内容宽度：总宽度减去头像和间距，避免与头像同排时换行
        max-width: calc(100% - #{$avatar-size} - #{$gap});

        &--owner {
          align-items: flex-end;
          margin-left: auto;
        }

        .msg__author {
          font-size: 12px;
          color: var(--content-message-font-color);
          margin-bottom: 4px;
          font-weight: 500;
          opacity: 0.85;
          letter-spacing: 0.3px;

          &--owner {
            text-align: right;
          }
        }

        .msg__bubble {
          position: relative;
          word-break: break-word;
          overflow-wrap: anywhere;
        }
      }
    }

    // 响应式：窄屏时调整
    @media (max-width: 640px) {
      .msg__row {
        padding: 10px;
        gap: 8px;

        > .msg__avatar {
          width: $avatar-size-sm;
          height: $avatar-size-sm;
          flex: 0 0 $avatar-size-sm;
          margin: 0 8px;
          box-sizing: border-box;
        }

        .msg__content {
          max-width: calc(100% - #{$avatar-size-sm} - 8px);
        }
      }
    }

    /* more 按钮 */
    .msg__more {
      margin: 0;
      padding: 8px;
      color: var(--content-active-color, #539df3);
      background-color: transparent;
      font-size: 13px;
      cursor: pointer;
      display: flex;
      border: none; /* 去掉边框 */
      outline: none; /* 去掉轮廓 */
      user-select: none;
      transition: color 0.2s;
      transition: transform $transition-fast ease, box-shadow $transition-fast ease;

      // &:hover {
      //   color: #1890ff;
      //   background-color: rgba(64, 158, 255, 0.12);
      //   transform: translateY(-1px);
      //   box-shadow: 0 2px 8px rgba(64, 158, 255, 0.12);
      // }

      &:active {
        transform: translateY(0);
      }
    }

    .msg__time {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      color: var(--content-message-font-color);
      opacity: 0.8;
      white-space: nowrap;
    }

    // 加载占位
    .msg__loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 12px;
      color: var(--content-message-font-color);
      opacity: 0.6;
      font-size: 12px;
      animation: pulse 1.5s ease-in-out infinite;
    }

    .msg__popover {
      // 用于 el-popover 的自定义类，按需调整
      border-radius: 8px;
    }
  }

  // pulse 动画
  @keyframes pulse {
    0% {
      opacity: 0.6;
      transform: translateY(0);
    }
    50% {
      opacity: 0.9;
      transform: translateY(-2px);
    }
    100% {
      opacity: 0.6;
      transform: translateY(0);
    }
  }
</style>
