<template>
  <div class="emoji-picker-modern no-select">
    <!-- 顶部进度条 (可选) -->
    <div v-if="loading" class="loading-overlay">
      <div class="spinner"></div>
    </div>

    <div class="emoji-content">
      <!-- Unicode 表情面板 -->
      <div v-show="activeTab === 'default'" class="panel-scroll-view">
        <section v-if="historyEmojiList.length" class="emoji-section">
          <h3 class="section-title">最近使用</h3>
          <div class="emoji-grid unicode-grid">
            <button v-for="(emoji, idx) in historyEmojiList" :key="`recent-${idx}`" class="emoji-cell unicode-cell"
              @click="onSelectEmoji(emoji)">
              {{ emoji }}
            </button>
          </div>
        </section>

        <section class="emoji-section">
          <h3 class="section-title">所有表情</h3>
          <div class="emoji-grid-container">
            <RecycleScroller v-if="emojiRows.length" class="scroller" :items="emojiRows" :item-size="48" key-field="id"
              :buffer="100">
              <template #default="{ item }">
                <div class="emoji-row" :style="{ 'grid-template-columns': `repeat(${columns}, 1fr)` }">
                  <button v-for="emoji in item.emojis" :key="emoji" class="emoji-cell unicode-cell"
                    @click="onSelectEmoji(emoji)">
                    {{ emoji }}
                  </button>
                  <!-- 填充空白单元格 -->
                  <div v-for="n in (columns - item.emojis.length)" :key="`empty-${n}`" class="empty-cell"></div>
                </div>
              </template>
            </RecycleScroller>
          </div>
        </section>
      </div>

      <!-- 表情包面板 -->
      <div v-show="activeTab !== 'default'" class="panel-scroll-view">
        <div v-if="currentPackEmojis.length === 0 && !loading" class="empty-placeholder">
          <el-empty :image-size="60" description="暂无表情数据" />
        </div>

        <div class="emoji-grid sticker-grid">
          <div v-for="item in currentPackEmojis" :key="item.emojiId" class="emoji-cell sticker-cell" :title="item.name"
            @click="onSelectImageEmoji(item)">
            <el-image :src="item.url" fit="contain" lazy class="sticker-img">
              <template #placeholder>
                <div class="image-slot">
                  <el-icon>
                    <Picture />
                  </el-icon>
                </div>
              </template>
            </el-image>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部 Tab 导航 -->
    <nav class="emoji-navbar">
      <div class="tabs-wrapper">
        <div class="nav-tab-item" :class="{ active: activeTab === 'default' }" @click="switchTab('default')">
          <span class="default-icon">{{ defaultEmojiIcon }}</span>
        </div>

        <div v-for="pack in emojiPacks" :key="pack.packId" class="nav-tab-item"
          :class="{ active: activeTab === pack.packId }" @click="switchTab(pack.packId)">
          <el-image :src="pack.url || pack.cover" fit="cover" class="pack-cover" />
        </div>
      </div>
    </nav>
  </div>
</template>

<script lang="ts" setup>
import api from "@/api/index";
import emojiJson from "@/assets/json/emoji.json";
import { Emoji as EmojiModel } from "@/models";
import { useUserStore } from "@/store/modules/user";
import { Picture } from "@element-plus/icons-vue";
import { computed, onMounted, ref, watch } from 'vue';

// --- 类型定义 ---
type EmojiStr = string;
interface EmojiPack {
  packId: string;
  name: string;
  url?: string;
  cover?: string;
  emojiList?: EmojiModel[];
  emojis?: EmojiModel[];
}

interface EmojiRow {
  id: string;
  emojis: EmojiStr[];
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
const columns = ref<number>(8); // 每行显示的表情数量

// 性能优化：预处理并冻结数据
const emojiData = Object.freeze(emojiJson.data.split(","));
const defaultEmojiIcon = emojiData[0];

const historyEmojiList = ref<EmojiStr[]>(props.historyEmojiList || []);

// --- 计算属性 ---
// 将一维表情数组转换为二维行数组
const emojiRows = computed<EmojiRow[]>(() => {
  const rows: EmojiRow[] = [];
  for (let i = 0; i < emojiData.length; i += columns.value) {
    rows.push({
      id: `row-${i / columns.value}`,
      emojis: emojiData.slice(i, i + columns.value)
    });
  }
  return rows;
});

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

const loadEmojiPacks = async () => {
  const ids = userStore.emojiPackIds;
  if (!ids?.length) {
    emojiPacks.value = [];
    return;
  }

  loading.value = true;
  try {
    const promises = ids.map(id =>
      id ? api.GetEmojiPackInfo(id as string).catch(() => null) : null
    );

    const results = await Promise.all(promises);
    emojiPacks.value = results.filter((item): item is EmojiPack => !!item);
  } catch (error) {
    console.error("[Emoji] Failed to load packs:", error);
  } finally {
    loading.value = false;
  }
};

// --- 监听 ---
watch(() => props.historyEmojiList, (val) => {
  historyEmojiList.value = val || [];
});

watch(() => userStore.emojiPackIds, loadEmojiPacks, { immediate: true, deep: true });

// 监听窗口大小变化，动态调整列数
const updateColumns = () => {
  const width = window.innerWidth;
  if (width < 400) {
    columns.value = 6;
  } else if (width < 500) {
    columns.value = 7;
  } else {
    columns.value = 8;
  }
};

onMounted(() => {
  updateColumns();
  window.addEventListener('resize', updateColumns);
});
</script>

<style lang="scss" scoped>
.emoji-picker-modern {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 380px;
  /* 主流 IM 高度 */
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  font-family: var(--el-font-family);
}

/* 加载状态 */
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: rgba(64, 158, 255, 0.1);
  z-index: 10;

  &::after {
    content: "";
    display: block;
    height: 100%;
    width: 30%;
    background: #409eff;
    animation: loading-slide 1.5s infinite ease-in-out;
  }
}

@keyframes loading-slide {
  from {
    left: -30%;
  }

  to {
    left: 100%;
  }
}

/* 内容区域 */
.emoji-content {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.panel-scroll-view {
  height: 100%;
  overflow-y: auto;
  padding: 0 12px;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: #e5e6eb;
    border-radius: 4px;
  }
}

.emoji-section {
  margin-bottom: 16px;

  .section-title {
    font-size: 12px;
    color: #86909c;
    font-weight: normal;
    padding: 12px 4px 8px;
    position: sticky;
    top: 0;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(4px);
    z-index: 2;
  }
}

/* 最近使用的表情网格 */
.emoji-grid {
  display: grid;
  gap: 4px;
}

.unicode-grid {
  grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
}

/* 所有表情的虚拟滚动容器 */
.emoji-grid-container {
  height: calc(100% - 40px);
  /* 减去标题高度 */
  overflow: hidden;
}

.scroller {
  height: 100%;
}

/* 每一行的网格布局 */
.emoji-row {
  display: grid;
  gap: 4px;
  padding: 0 4px;
  margin-bottom: 4px;
}

.sticker-grid {
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: 12px;
  padding: 8px 4px;
}

/* 单个单元格样式 */
.emoji-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
  padding: 0;

  &:hover {
    background-color: #f2f3f5;
    transform: scale(1.15);
  }

  &:active {
    transform: scale(0.95);
  }
}

.unicode-cell {
  aspect-ratio: 1;
  height: 36px;
  font-size: 24px;
}

.sticker-cell {
  aspect-ratio: 1;
  padding: 4px;

  &:hover {
    background-color: #f2f3f5;
    transform: scale(1.05);
  }

  .sticker-img {
    width: 100%;
    height: 100%;

    .image-slot {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100%;
      height: 100%;
      background: #f5f7fa;
      color: #909399;
      font-size: 20px;
    }
  }
}

.empty-cell {
  height: 36px;
  aspect-ratio: 1;
  visibility: hidden;
}

.empty-placeholder {
  padding-top: 40px;
}

/* 底部导航栏 */
.emoji-navbar {
  height: 44px;
  background: #f7f8fa;
  border-top: 1px solid #e5e6eb;
  display: flex;
  align-items: center;
  padding: 0 8px;
  flex-shrink: 0;

  .tabs-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;
    /* Firefox */

    &::-webkit-scrollbar {
      display: none;
    }
  }

}

.nav-tab-item {
  width: 36px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;

  &:hover {
    background-color: rgba(0, 0, 0, 0.04);
  }

  &.active {
    background-color: #fff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
  }

  .default-icon {
    font-size: 20px;
  }

  .pack-cover {
    width: 24px;
    height: 24px;
    border-radius: 4px;
  }
}
</style>