<template>
  <div class="emoji-picker">
    <!-- 最近使用分组 -->
    <div v-if="historyEmojiList.length" class="emoji-section">
      <h4 class="emoji-section-title">最近使用</h4>
      <ul :style="{ backgroundColor: recentEmojiBackground }" class="emoji-list emoji-list--recent">
        <li v-for="(emoji, idx) in historyEmojiList" :key="`recent-${idx}`" class="emoji-list-item"
            @click="onSelectEmoji(emoji)">
          {{ emoji }}
        </li>
      </ul>
    </div>

    <!-- 全部表情 -->
    <div class="emoji-section">
      <h4 class="emoji-section-title">全部表情</h4>
      <ul ref="allListRef" class="emoji-list emoji-list--all" @scroll.passive="handleScroll">
        <li v-for="(emoji, idx) in emojiData" :key="`all-${idx}`" class="emoji-list-item"
            @click="onSelectEmoji(emoji)">
          {{ emoji }}
        </li>
      </ul>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import emojiJson from "@/assets/json/emoji.json";

  type Emoji = string;

  // 定义 props：外部可传入最近使用列表
  const props = defineProps<{
    historyEmojiList: Emoji[];
  }>();

  // 定义事件：选中 Emoji 时向外发射
  const emit = defineEmits<{
    (e: "handleChooseEmoji", emoji: Emoji): void;
  }>();

  // 全部 Emoji 数据，单次拆分成数组
  const emojiData = ref<Emoji[]>(emojiJson.data.split(","));

  // 本地维护的“最近使用”列表，可与 props 保持同步
  const historyEmojiList = ref<Emoji[]>(props.historyEmojiList || []);

  // 背景颜色，随着滚动动态调整透明度
  const recentEmojiBackground = ref<string>("transparent");

  // 滚动容器引用，用于后续可能的操作
  const allListRef = ref<HTMLElement | null>(null);

  /**
   * 点击选中一个 Emoji
   */
  function onSelectEmoji(emoji: Emoji) {
    emit("handleChooseEmoji", emoji);
  }

  /**
   * 滚动时动态改变“最近使用”背景透明度
   */
  function handleScroll(event: Event) {
    const target = event.target as HTMLElement;
    const scrollTop = target.scrollTop;
    const maxScroll = target.scrollHeight - target.clientHeight;
    const opacity = maxScroll > 0 ? scrollTop / maxScroll : 0;
    recentEmojiBackground.value = `rgba(211, 211, 211, ${opacity})`;
  }

  // 监听父组件传入的 historyEmojiList 改变
  watch(
    () => props.historyEmojiList,
    (newList) => {
      historyEmojiList.value = newList || [];
    },
    { deep: true }
  );

  // 初次挂载可做额外逻辑（如聚焦、虚拟滚动优化等）
  onMounted(() => {
    // allListRef.value?.scrollTop = 0;
  });
</script>

<style lang="scss" scoped>
  /* 整体容器 */
  .emoji-picker {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: #ffffff;
  }

  /* 每个分区 */
  .emoji-section + .emoji-section {
    margin-top: 16px;
  }

  /* 分区标题 */
  .emoji-section-title {
    margin: 4px 0;
    font-size: 14px;
    color: #666;
  }

  /* 通用列表样式 */
  .emoji-list {
    display: flex;
    flex-wrap: wrap;
    list-style: none;
    padding: 4px;
    margin: 0;
    border-radius: 4px;
    background: #f9f9f9;
  }

  /* 最近使用区，一行自动换行，无滚动 */
  .emoji-list--recent {
    max-height: 80px;
    overflow: hidden;
  }

  /* 全部表情区，固定高度可滚动 */
  .emoji-list--all {
    flex: 1;
    overflow-y: auto;
    height: 200px;

    /* 或根据容器自适应 */
    // 滚动条样式
    &::-webkit-scrollbar {
      width: 6px;
      background: transparent;
    }

    &::-webkit-scrollbar-thumb {
      background-color: rgba(0, 0, 0, 0.2);
      border-radius: 3px;
    }
  }

  /* 单个 Emoji 样式 */
  .emoji-list-item {
    width: 32px;
    height: 32px;
    margin: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.2s;

    &:hover {
      background-color: #e6f7ff;
    }
  }
</style>
