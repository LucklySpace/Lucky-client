<template>
  <div aria-label="消息记录" class="message-records" role="region">
    <DynamicScroller v-if="validMessages.length > 0" ref="scrollerRef" :items="validMessages" :min-item-size="64"
      :buffer="200" class="message-records__list" key-field="messageId" @scroll="handleScroll">
      <template #default="{ item, index, active }">
        <DynamicScrollerItem :active="active" :index="index" :item="item" :size-dependencies="[item.messageBody]">
          <Message :message="item" :id="`message-${item.messageId}`"
            :more="isFirstItem(index) && active && hasMoreMessages" :time="shouldDisplayTime(index)"
            @handleMoreMessage="loadMoreMessages" />
        </DynamicScrollerItem>
      </template>
    </DynamicScroller>

    <!-- 空消息列表 -->
    <div v-else class="message-records__empty" />

    <el-drawer v-model="chatStore.isShowDetail" :destroy-on-close="true" :title="chatStore.getCurrentName" size="32%"
      style="position: absolute" @close="chatStore.handleChatDetail">
      <component :is="detailComponent" @handleClearGroupMessage="handleClearMessage"
        @handleClearFriendMessage="handleClearMessage" @handleQuitGroup="handleDelete"
        @handleDeleteContact="handleDelete" />
    </el-drawer>
  </div>
</template>

<script lang="ts" setup>
import GroupDetail from "@/components/ChatDetail/group.vue";
import SingleDetail from "@/components/ChatDetail/single.vue";
import { MessageType } from "@/constants";
import { useChatStore } from "@/store/modules/chat";
import { useMessageStore } from "@/store/modules/message";
import { useFriendsStore } from "@/store/modules/friends";
import { useDebounceFn } from "@vueuse/core";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { DynamicScroller, DynamicScrollerItem } from "vue-virtual-scroller";

// ========================= 类型定义 =========================
interface MessageItem {
  messageId: string;
  messageTime: number;
  isOwner?: boolean;
  [key: string]: unknown;
}

interface ScrollerInstance {
  $el: HTMLElement;
  update?: () => void;
  scrollToItem?: (index: number) => void;
  scrollToBottom?: (options?: { behavior: ScrollBehavior }) => void;
}

const props = defineProps<{
  data: MessageItem[];
  count: number;
  chat: Record<string, unknown>;
}>();

const TIME_GAP_THRESHOLD = 5 * 60 * 1000; // 5分钟
const SCROLL_BOTTOM_THRESHOLD = 10;

const chatStore = useChatStore();
const messageStore = useMessageStore();
const friendStore = useFriendsStore();

const scrollerRef = ref<ScrollerInstance | null>(null);

// 滚动状态
const scrollState = ref({
  previousHeight: 0,
  previousTop: 0,
  isLoadingMore: false,
  isAtBottom: true,
});

// 过滤有效消息（确保每条消息都有有效的 messageId）
const validMessages = computed(() => {
  if (!Array.isArray(props.data)) return [];

  const seen = new Set<string>();
  return props.data.filter((item) => {
    // 确保有有效的 messageId
    if (!item?.messageId) return false;

    const id = String(item.messageId);

    // 去重
    if (seen.has(id)) return false;
    seen.add(id);

    return true;
  });
});

// 是否是群聊
const isGroupMessage = computed(
  () => chatStore.getCurrentType === MessageType.GROUP_MESSAGE.code
);

// 详情组件
const detailComponent = computed(() =>
  isGroupMessage.value ? GroupDetail : SingleDetail
);

// 是否有更多消息
const hasMoreMessages = computed(() => props.count > 0);

// 获取滚动元素
const getScrollerEl = (): HTMLElement | null => scrollerRef.value?.$el ?? null;

// 更新滚动元素
const updateScroller = () => {
  scrollerRef.value?.update?.();
};

// 滚动到元素底部
const scrollToEnd = (el: HTMLElement, behavior: ScrollBehavior = "smooth") => {
  const scroller = scrollerRef.value;
  if (scroller?.scrollToBottom) {
    scroller.scrollToBottom({ behavior });
  } else {
    el.scrollTo({ top: el.scrollHeight, behavior });
  }
};

// 是否是第一条消息
const isFirstItem = (index: number): boolean => index === 0;

// 是否显示时间
const shouldDisplayTime = (index: number): boolean => {
  if (index === 0) return true;
  const messages = validMessages.value;
  const curr = messages[index];
  const prev = messages[index - 1];
  if (!curr || !prev) return false;
  return curr.messageTime - prev.messageTime >= TIME_GAP_THRESHOLD;
};

// 加载更多消息
const loadMoreMessages = () => {
  const el = getScrollerEl();
  if (el) {
    scrollState.value = {
      ...scrollState.value,
      previousHeight: el.scrollHeight,
      previousTop: el.scrollTop,
      isLoadingMore: true,
    };
  }
  messageStore.handleMoreMessage();
};

// 删除会话对象
const handleDelete = async () => {
  if (chatStore.currentChat) {
    await friendStore.handleDeleteContact(chatStore.currentChat);
  }
};

// 清空会话消息
const handleClearMessage = async () => {
  if (chatStore.currentChat) {
    await messageStore.handleClearMessage(chatStore.currentChat);
  }
};

// 滚动到元素底部
const scrollToBottom = async (behavior: ScrollBehavior = "smooth") => {
  await nextTick();

  return new Promise<void>((resolve) => {
    requestAnimationFrame(async () => {
      const el = getScrollerEl();
      if (!el) return resolve();

      try {
        updateScroller();
        const lastIndex = Math.max(0, validMessages.value.length - 1);
        scrollerRef.value?.scrollToItem?.(lastIndex);
        await nextTick();
        scrollToEnd(el, behavior);
      } catch {
        // 兜底 DOM 操作
        el.scrollTop = el.scrollHeight;
      } finally {
        scrollState.value.isAtBottom = true;
        resolve();
      }
    });
  });
};

// 检查滚动位置
const checkScrollPosition = () => {
  const el = getScrollerEl();
  if (!el) return;

  const { scrollTop, scrollHeight, offsetHeight } = el;
  const isAtBottom =
    Math.ceil(scrollTop + offsetHeight) >= scrollHeight - SCROLL_BOTTOM_THRESHOLD;

  scrollState.value.isAtBottom = isAtBottom;
};

// 处理滚动事件
const handleScroll = useDebounceFn(checkScrollPosition, 100);

// 加载更多消息完成
const handleLoadMoreComplete = (el: HTMLElement) => {
  const { previousHeight, previousTop } = scrollState.value;
  const delta = el.scrollHeight - previousHeight;
  el.scrollTop = previousTop + delta;
  scrollState.value.isLoadingMore = false;
};

// 处理新消息
const handleNewMessages = async (newLen: number, oldLen: number) => {
  const deltaCount = newLen - oldLen;
  if (deltaCount <= 0) return;

  const messages = validMessages.value;
  const lastMessage = messages[messages.length - 1];
  const isOwnMessage = lastMessage?.isOwner;

  // 自己发送的消息或已在底部时，自动滚动
  if (isOwnMessage || scrollState.value.isAtBottom) {
    await scrollToBottom("smooth");
  }
};

onMounted(() => scrollToBottom("auto"));

// 监听有效消息列表变化
watch(
  () => validMessages.value.length,
  async (newLen, oldLen = 0) => {
    await nextTick();
    const el = getScrollerEl();
    if (!el) return;

    updateScroller();

    if (scrollState.value.isLoadingMore) {
      handleLoadMoreComplete(el);
      return;
    }

    await handleNewMessages(newLen, oldLen);
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
    background-color: transparent;
  }

  &:hover::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.25)
  }

}

.message-records {
  height: 100%;
  width: 100%;
  position: relative;

  &__list {
    height: 100%;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: none;
    overflow-anchor: none;
    @include scroll-bar();
  }

  &__empty {
    height: 100%;
    width: 100%;
  }
}
</style>
