<template>
  <div ref="messageRecordsRef" aria-label="消息记录" class="message-records" role="region">
    <DynamicScroller ref="scrollerRef" :items="data" :min-item-size="64" class="message-records__message-list"
      key-field="messageId" @scroll="handleScroll">
      <template #default="{ item, index, active }">
        <DynamicScrollerItem :active="active" :index="index" :item="item">
          <Message :message="item" :more="shouldDisplayMore(index) && active" :time="shouldDisplayTime(index)"
            @handleMoreMessage="handleMoreMessage" />
        </DynamicScrollerItem>
      </template>
    </DynamicScroller>

    <!-- 新消息提示按钮（已注释，如需启用请取消注释） -->
    <!-- <div v-if="showNewMessageTip" class="message-records__new-message-tip" @click="scrollToBottom">
      有 {{ newMessageCount }} 条新消息，点击查看
    </div> -->

    <el-drawer v-model="chatStore.isShowDetail" :destroy-on-close="true" :title="chatStore.getCurrentName" size="32%"
      style="position: absolute" @close="chatStore.handleChatDetail">
      <GroupDetail v-if="isGroupMessage" @handleClearGroupMessage="handleClearMessage"
        @handleQuitGroup="handleDelete" />
      <SingleDetail v-if="isSingleMessage" @handleClearFriendMessage="handleClearMessage"
        @handleDeleteContact="handleDelete" />
    </el-drawer>
  </div>
</template>

<script lang="ts" setup>
import type { PropType } from "vue";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import GroupDetail from "@/components/ChatDetail/group.vue";
import SingleDetail from "@/components/ChatDetail/single.vue";
import { DynamicScroller, DynamicScrollerItem } from "vue-virtual-scroller";
import { IMessageType } from "@/constants";
import { useDebounceFn } from "@vueuse/core";
import { useChatStore } from "@/store/modules/chat";
import { useFriendsStore } from "@/store/modules/friends";

// ------------------------- Props & Emits -------------------------
const props = defineProps({
  data: {
    type: Array as PropType<any[]>,
    required: true,
    default: () => []
  },
  count: {
    type: Number,
    required: true,
    default: 0
  },
  chat: {
    type: Object as PropType<Record<string, any>>,
    required: true,
    default: () => ({})
  }
});

// ------------------------- Stores / Computed -------------------------
const chatStore = useChatStore();
const friendStore = useFriendsStore();
const isGroupMessage = computed(() => chatStore.getCurrentType === IMessageType.GROUP_MESSAGE.code);
const isSingleMessage = computed(() => chatStore.getCurrentType === IMessageType.SINGLE_MESSAGE.code);

// ------------------------- Refs & Internal State -------------------------
const scrollerRef = ref<InstanceType<typeof DynamicScroller> | null>(null);
const messageRecordsRef = ref<HTMLElement | null>(null);

const previousScrollHeight = ref(0);
const previousScrollTop = ref(0);
const isLoadingMore = ref(false);

// 新消息提示与“是否在底部”状态
const newMessageCount = ref(0);
const isAtBottom = ref(true);
// const showNewMessageTip = computed(() => newMessageCount.value > 0 && !isAtBottom.value);

// ------------------------- Methods -------------------------
function handleMoreMessage() {
  const el = scrollerRef.value?.$el as HTMLElement | undefined;
  if (el) {
    previousScrollHeight.value = el.scrollHeight;
    previousScrollTop.value = el.scrollTop;
    isLoadingMore.value = true;
  }
  chatStore.handleMoreMessage();
}

// 删除会话对象
async function handleDelete() {
  if (chatStore.currentChat) {
    await friendStore.handleDeleteContact(chatStore.currentChat);
  }
}

// 清空会话消息
async function handleClearMessage() {
  if (chatStore.currentChat) {
    await chatStore.handleClearMessage(chatStore.currentChat);
  }
}

function shouldDisplayMore(index: number) {
  return typeof index === "number" && index === 0 && props.count > 0;
}

function shouldDisplayTime(index: number): boolean {
  if (!Array.isArray(props.data)) return false;
  if (index === 0) return true;
  const curr = props.data[index];
  const prev = props.data[index - 1];
  if (!curr || !prev) return false;
  return curr.messageTime - prev.messageTime >= 5 * 60 * 1000;
}

/**
 * 尝试平滑滚动到底部
 */
async function scrollToBottom({ behavior = "smooth" } = { behavior: "smooth" }) {
  await nextTick();
  requestAnimationFrame(async () => {
    const scroller = scrollerRef.value;
    const el = scroller?.$el as HTMLElement | undefined;
    try {
      // 先强制更新一次虚拟列表的尺寸/位置，避免高度未计算完成导致的未到底部问题
      try {
        (scroller as any)?.update?.();
      } catch { }
      const length = props.data.length;
      (scroller as any).scrollToItem(length - 1 > 0 ? length - 1 : 0);
      await nextTick();
      // 某些版本无 scrollToBottom 方法， fallback 到 DOM 滚动
      if ((scroller as any)?.scrollToBottom) {
        (scroller as any).scrollToBottom({ behavior });
      } else if (el) {
        el.scrollTo({ top: el.scrollHeight });
      }
    } catch (e) {
      // 兜底DOM操作
      if (el) el.scrollTop = el.scrollHeight;
    } finally {
      newMessageCount.value = 0;
      isAtBottom.value = true;
      await nextTick();
      if ((scroller as any)?.scrollToBottom) {
        (scroller as any).scrollToBottom({ behavior });
      } else if (el) {
        el.scrollTo({ top: el.scrollHeight });
      }
    }
  });
}

/**
 * 处理滚动事件（debounced）
 */
const handleScrollInner = () => {
  const el = scrollerRef.value?.$el as HTMLElement | undefined;
  if (!el) return;
  const { scrollTop, scrollHeight, offsetHeight } = el;
  const threshold = 10; // 允许小阈值认为在底部
  const atBottomNow = Math.ceil(scrollTop + offsetHeight) >= scrollHeight - threshold;
  isAtBottom.value = atBottomNow;
  if (atBottomNow) {
    newMessageCount.value = 0;
  }
};

const handleScroll = useDebounceFn(handleScrollInner, 100); // 略微增加debounce时间以优化性能

// ------------------------- Watchers & Lifecycle -------------------------
onMounted(async () => {
  await nextTick();
  // 进入页面时立即滚到底部（auto行为避免闪烁）
  scrollToBottom({ behavior: "auto" });
});

onBeforeUnmount(() => {
  // 清理资源（如有）
});

// 监视 data 长度变化：处理加载更多 & 新消息
watch(
  () => props.data.length,
  async (newLen, oldLen) => {
    await nextTick();
    const el = scrollerRef.value?.$el as HTMLElement | undefined;
    if (!el) return;
    // 每次数据量变化尽量让虚拟列表先完成一次重算
    try {
      (scrollerRef.value as any)?.update?.();
    } catch { }

    // 加载更多场景
    if (isLoadingMore.value) {
      const delta = el.scrollHeight - previousScrollHeight.value;
      el.scrollTop = previousScrollTop.value + delta;
      isLoadingMore.value = false;
      return;
    }

    // 新消息到来
    const deltaCount = Math.max(0, newLen - (oldLen || 0));
    if (deltaCount > 0) {
      // 如果是自己发出的消息，则无论是否在底部都滚到底部（与主流 IM 一致）
      const last = props.data[newLen - 1];
      const fromSelf = !!last?.isOwner;
      if (fromSelf || isAtBottom.value) {
        await scrollToBottom({ behavior: "smooth" });
      } else {
        newMessageCount.value += deltaCount;
      }
    }
  }
);
</script>

<style lang="scss" scoped>
/* 滚动条 mixin（BEM兼容） */
@mixin scroll-bar($width: 6px) {
  &::-webkit-scrollbar-track {
    border-radius: 10px;
    background-color: transparent;
  }

  &::-webkit-scrollbar {
    width: $width;
    height: 10px;
    background-color: transparent;
    transition: opacity 0.3s ease;
  }

  &::-webkit-scrollbar-thumb {
    border-radius: 10px;
    background-color: rgba(0, 0, 0, 0.2);
  }
}

.message-records {
  height: 100%;
  width: 100%;
  position: relative;

  .message-records__message-list {
    height: 100%;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: none;
    overflow-anchor: none;
    @include scroll-bar();

    // 隐藏滚动条（非hover时）
    // &::-webkit-scrollbar-thumb {
    //   background-color: transparent;
    // }
  }

  .message-records__new-message-tip {
    position: absolute;
    bottom: 20px;
    right: 6%;
    background: #409eff;
    color: white;
    padding: 6px 12px;
    border-radius: 20px;
    cursor: pointer;
    font-size: 14px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    z-index: 10;
  }

  /* Transition 动画（BEM风格） */
  .message-records__fade-enter-active,
  .message-records__fade-leave-active {
    transition: opacity 0.3s ease;
  }

  .message-records__fade-enter-from,
  .message-records__fade-leave-to {
    opacity: 0;
  }
}
</style>
