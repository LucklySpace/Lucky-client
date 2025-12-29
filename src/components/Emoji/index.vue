<template>
  <div class="emoji-picker-container">
    <div v-if="loading" class="loading-bar"></div>

    <div class="emoji-body">
      <div v-show="activeTab === 'default'" class="emoji-scroll-area">
        <div v-if="historyEmojiList.length" class="emoji-group">
          <div class="group-title">最近使用</div>
          <div class="emoji-grid unicode-grid">
            <div v-for="(emoji, idx) in historyEmojiList" :key="`recent-${idx}`" class="emoji-item unicode-item"
              @click="onSelectEmoji(emoji)">
              {{ emoji }}
            </div>
          </div>
        </div>

        <div class="emoji-group">
          <div class="group-title">所有表情</div>
          <div class="emoji-grid unicode-grid">
            <div v-for="(emoji, idx) in emojiData" :key="`all-${idx}`" class="emoji-item unicode-item"
              @click="onSelectEmoji(emoji)">
              {{ emoji }}
            </div>
          </div>
        </div>
      </div>

      <div v-show="activeTab !== 'default'" class="emoji-scroll-area">
        <div v-if="currentPackEmojis.length === 0 && !loading" class="empty-state">
          <span>暂无表情数据</span>
        </div>

        <div class="emoji-grid image-grid">
          <div v-for="item in currentPackEmojis" :key="item.emojiId" class="emoji-item image-item" :title="item.name"
            @click="onSelectImageEmoji(item)">
            <img :src="item.url" :alt="item.name" loading="lazy" />
          </div>
        </div>
      </div>
    </div>

    <div class="emoji-footer">
      <div class="tab-scroll-container">
        <div class="tab-item" :class="{ 'is-active': activeTab === 'default' }" @click="switchTab('default')"
          title="系统表情">
          <span class="tab-icon">{{ defaultEmojiIcon }}</span>
        </div>

        <div v-for="pack in emojiPacks" :key="pack.packId" class="tab-item"
          :class="{ 'is-active': activeTab === pack.packId }" @click="switchTab(pack.packId)" :title="pack.name">
          <img :src="pack.url || pack.cover" :alt="pack.name" class="tab-img" />
        </div>
      </div>
    </div>
  </div>
  
</template>

<script lang="ts" setup>
import { ref, computed, watch, onMounted } from 'vue';
import emojiJson from "@/assets/json/emoji.json";
import { useUserStore } from "@/store/modules/user";
import api from "@/api/index";
import { Emoji as EmojiModel } from "@/models"; // 确保这里有定义

// --- 类型定义 ---
type EmojiStr = string;
interface EmojiPack {
  packId: string;
  name: string;
  url?: string; // Tab 图标
  cover?: string; // 兼容字段
  emojiList?: EmojiModel[];
  emojis?: EmojiModel[];
}

// --- Props & Emits ---
const props = defineProps<{
  historyEmojiList: EmojiStr[];
}>();

const emit = defineEmits<{
  (e: "handleChooseEmoji", emoji: EmojiStr | EmojiModel): void;
  (e: "handleChooseImageEmoji", item: EmojiModel): void;
}>();

// --- 状态管理 ---
const userStore = useUserStore();
const activeTab = ref<string>('default');
const emojiPacks = ref<EmojiPack[]>([]);
const loading = ref(false);

// Unicode 数据预处理 (Object.freeze 提升大数据量的性能)
const emojiData = Object.freeze(emojiJson.data.split(","));
const defaultEmojiIcon = emojiData[0];

// 本地最近使用列表
const historyEmojiList = ref<EmojiStr[]>(props.historyEmojiList || []);

// --- 计算属性 ---
const currentPackEmojis = computed(() => {
  if (activeTab.value === 'default') return [];
  const pack = emojiPacks.value.find(p => p.packId === activeTab.value);
  return pack?.emojiList || pack?.emojis || [];
});

// --- 方法 ---
const switchTab = (tab: string) => {
  activeTab.value = tab;
};

const onSelectEmoji = (emoji: EmojiStr) => {
  emit("handleChooseEmoji", emoji);
};

const onSelectImageEmoji = (item: EmojiModel) => {
  emit("handleChooseImageEmoji", item);
};

// --- 数据加载优化 ---
const loadEmojiPacks = async () => {
  const ids = userStore.userEmojiPackIds;
  if (!ids?.length) {
    emojiPacks.value = [];
    return;
  }

  loading.value = true;
  try {
    // 优化：使用 Promise.all 并发请求，而不是 for循环 await
    const promises = ids.map(id =>
      id ? api.GetEmojiPackInfo(id as string).catch(() => null) : null
    );

    const results = await Promise.all(promises);
    // 过滤掉失败请求(null)
    emojiPacks.value = results.filter((item): item is EmojiPack => !!item);
  } catch (error) {
    console.error("加载表情包异常", error);
  } finally {
    loading.value = false;
  }
};

// --- 监听 ---
watch(() => props.historyEmojiList, (val) => {
  historyEmojiList.value = val || [];
});

watch(() => userStore.userEmojiPackIds, loadEmojiPacks, { immediate: true, deep: true });
</script>

<style lang="scss" scoped>
/* 设计风格：
  - 简洁：去除多余线条，使用间距区分
  - 配色：背景纯白，Hover 浅灰，选中态深色/高亮
  - 布局：Flex + Grid
*/

$bg-color: (--content-bg-color);
$hover-bg: (--content-active-bg-color);
$border-color: (--content-drag-line-color);
$active-bg: (--content-active-bg-color);
$text-sub: (--content-message-font-color);

.emoji-picker-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 410px;
  /* 稍微调低一点高度，适配性更好 */
  background: $bg-color;
  border-radius: 8px;
  /* 圆角 */
  // box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  /* 增加阴影提升质感 */
  overflow: hidden;
  position: relative;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

/* 顶部加载条 */
.loading-bar {
  height: 2px;
  background: linear-gradient(90deg, #409eff, #69c0ff);
  animation: loading 1.5s infinite;
  width: 100%;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10;
}

@keyframes loading {
  0% {
    transform: translateX(-100%);
  }

  100% {
    transform: translateX(100%);
  }
}

/* 主体滚动区 */
.emoji-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 10px 10px 6px 12px;

  /* 隐藏默认滚动条但保留功能 (Chrome/Safari) */
  &::-webkit-scrollbar {
    width: 5px;
  }

  &::-webkit-scrollbar-thumb {
    background: #dcdfe6;
    border-radius: 4px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }
}

.emoji-scroll-area {
  min-height: 100%;
}

/* 分组标题 */
.group-title {
  font-size: 12px;
  color: $text-sub;
  margin: 8px 0 8px 4px;
  font-weight: 500;
  position: sticky;
  /* 粘性标题 */
  top: -12px;
  /* 抵消 padding */
  background: $border-color;
  backdrop-filter: blur(5px);
  padding: 8px 4px;
  z-index: 1;
}

/* Grid 布局通用设置 */
.emoji-grid {
  display: grid;
  justify-content: start;
  gap: 4px;
}

/* Unicode 密集网格 */
.unicode-grid {
  /* 自动填充，每列最小 34px */
  grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
}

/* Unicode 单项 */
.emoji-item {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s ease;
  user-select: none;

  &:hover {
    background-color: $hover-bg;
    transform: scale(1.1);
  }

  &:active {
    transform: scale(0.95);
  }
}

.unicode-item {
  height: 36px;
  font-size: 24px;
}

/* 图片表情网格 */
.image-grid {
  grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
  gap: 12px;
  padding-top: 8px;
}

/* 图片单项 */
.image-item {
  height: 70px;
  padding: 6px;
  border: 1px solid transparent;

  &:hover {
    background-color: $hover-bg;
    border-color: rgba(0, 0, 0, 0.05);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
}

/* 空状态 */
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: $text-sub;
  font-size: 14px;
}

/* 底部 Tab 栏 */
.emoji-footer {
  height: 46px;
  // background: #f7f8fa;
  border-top: 1px solid $border-color;
  display: flex;
  align-items: center;
  padding: 4 1 0 1px;
  margin-top: 1px;
  flex-shrink: 0;
}

.tab-scroll-container {
  display: flex;
  align-items: center;
  overflow-x: auto;
  width: 100%;
  height: 100%;

  &::-webkit-scrollbar {
    display: none;
    /* 底部 Tab 隐藏滚动条 */
  }
}

.tab-item {
  width: 40px;
  height: 36px;
  margin: 0 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;

  &:hover {
    background-color: rgba(17, 14, 14, 0.05);
  }

  &.is-active {
    background-color: rgba(0, 0, 0, 0.05);

    .tab-icon {
      transform: scale(1.1);
    }
  }

  .tab-icon {
    font-size: 24px;
    transition: transform 0.2s;
  }

  .tab-img {
    width: 26px;
    height: 26px;
    object-fit: cover;
    border-radius: 4px;
  }
}
</style>