<template>
  <div ref="boxRef" class="vl-box" @scroll="handleScroll">
    <div :style="{ height: boxHeight + 'px' }">
      <!-- 虚拟列表项，携带绝对索引 absIndex -->
      <div v-for="({ item, absIndex }, idx) in offsetData" :key="item.chatId"
        :style="{ height: rowHeight + 'px', top: absIndex * rowHeight + 'px' }" class="vl-box-item">
        <div v-context-menu="getMenuConfig(item)" :class="{ pinned: item.isTop == 1, active: isActive(item) }"
          class="item" @click="handleChooseChat(item)">
          <ItemView :data="{ ...item, isMute: item.isMute === 1 ? 1 : 0 }" />
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="!chatMessageStore.loading && totalCount === 0" class="vl-empty">
      <el-empty />
    </div>
  </div>
</template>

<script lang="ts" setup>
import type Chats from "@/database/entity/Chats";
import { useChatStore } from "@/store/modules/chat";
import { useMediaCacheStore } from "@/store/modules/media";
import { useWindowSize } from "@vueuse/core";
import { ElMessageBox } from "element-plus";
import { computed, ref } from "vue";
import ItemView from "./ItemView/index.vue";

const chatMessageStore = useChatStore();
const mediaStore = useMediaCacheStore();

const { height: windowHeight } = useWindowSize();
const boxRef = ref<HTMLElement | null>(null);
const selectedId = ref<string | number | null>((chatMessageStore as any).currentChat?.chatId ?? null);

const rowHeight = 60;
const offset = ref(0);
const offsetIndex = ref(0);
let rafId: number | null = null;

const totalCount = computed(() => chatMessageStore.chatList.length ?? 0);
const boxHeight = computed(() => (chatMessageStore.chatList.length ?? 0) * rowHeight);

// 注意：保持 item 的引用不被 clone，slice 返回的仍是原始对象引用，子组件可以响应更新
const offsetData = computed(() => {
  const data = chatMessageStore.chatList || [];
  if (!data.length) return [] as { item: Chats; absIndex: number }[];
  const visibleCount = Math.ceil(windowHeight.value / rowHeight) + 1;
  const startIndex = Math.floor(offset.value / rowHeight);
  offsetIndex.value = startIndex;
  return data.slice(startIndex, startIndex + visibleCount).map((item, i) => ({ item, absIndex: startIndex + i }));
});

const handleScroll = () => {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    if (boxRef.value) offset.value = boxRef.value.scrollTop;
    rafId = null;
  });
};

const handleChooseChat = async (item: Chats) => {
  selectedId.value = item.chatId;
  chatMessageStore.handleResetMessage();
  await mediaStore.initStorage(item.toId);
  await chatMessageStore.handleChangeCurrentChat(item);
  await chatMessageStore.handleGetMessageList(item);
  await chatMessageStore.handleUpdateReadStatus(item);
};

const isActive = (item: Chats) => {
  if (!item) return false;
  const storeCur = (chatMessageStore as any).currentChat?.chatId ?? null;
  if (storeCur != null) return item.chatId === storeCur;
  return item.chatId === selectedId.value;
};

// 改造的 getMenuConfig：使用 computed 跟踪 item.isTop，并通过 getter 暴露 options（保持外部使用不变）
const getMenuConfig = (item: Chats) => {
  // 获取当前item
  const currentItem =
    computed(() => chatMessageStore.getChatById(item.chatId) ?? item);

  const options = computed(() => [
    { label: currentItem.value?.isTop === 1 ? "取消置顶" : "置顶会话", value: "pin" },
    { label: currentItem.value?.isMute === 1 ? "取消免打扰" : "消息免打扰", value: "mute" },
    { label: "删除会话", value: "delete" }
  ]);

  const callback = async (action: string) => {
    try {
      if (action === "delete") {
        await ElMessageBox.confirm(`确定删除与 ${currentItem.value?.name ?? item.name} 的会话?`, "删除会话", {
          distinguishCancelAndClose: true,
          confirmButtonText: "确认",
          cancelButtonText: "取消"
        });
        await chatMessageStore.handleDeleteChat(currentItem.value ?? item);
      }
      if (action === "pin") {
        await chatMessageStore.handlePinChat(currentItem.value ?? item);
      }
      if (action === "mute") {
        await chatMessageStore.handleMuteChat(currentItem.value ?? item);
      }
    } catch {
    }
  };

  return {
    get options() {
      return options.value;
    },
    callback
  };
};
</script>

<style lang="scss" scoped>
@use "@/assets/style/scss/index.scss" as *;

.vl-box {
  border-right: 1px solid var(--side-border-right-color);
  overflow-y: auto;
  height: 100%;
  @include scroll-bar();
}

.vl-box::-webkit-scrollbar-button:decrement {
  display: none;
}

.vl-box>div {
  position: relative;
  overflow: hidden;
}

.vl-box-item {
  position: absolute;
  width: 100%;
  box-sizing: border-box;
}

.item {
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;

  /* 置顶样式保持原来语义 */
  &.pinned {
    background-color: var(--side-active-bg-color);
    color: var(--side-active-color);
  }

  &:hover {
    background-color: rgba(0, 0, 0, 0.06);
  }

  &.active {
    background-color: rgba(0, 0, 0, 0.06);
  }
}

.vl-empty {
  position: absolute;
  left: 0;
  right: 0;
  top: 15%;
  // transform: translateY(-50%);
  // text-align: center;
  color: var(--muted-color);
  font-size: 14px;
}
</style>