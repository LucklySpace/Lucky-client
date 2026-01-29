<template>
  <transition name="bar-fade">
    <div v-if="files.length" class="file-bar" :class="{ 'is-expanded': isHover }" @mouseenter="isHover = true"
      @mouseleave="isHover = false">
      <transition-group name="item-pop" tag="div" class="file-list">
        <div v-for="(item, index) in displayFiles" :key="item.id" class="file-card">
          <!-- 图片 -->
          <template v-if="item.isImage">
            <div class="card-image">
              <img :src="item.preview" :alt="item.name" />
            </div>
          </template>
          <!-- 文件 -->
          <template v-else>
            <div class="card-file">
              <svg class="card-icon" aria-hidden="true">
                <use :xlink:href="item.icon"></use>
              </svg>
              <div class="card-info">
                <span class="card-name" :title="item.name">{{ item.displayName }}</span>
                <span class="card-size">{{ item.sizeText }}</span>
              </div>
            </div>
          </template>
          <!-- 关闭 -->
          <button class="card-close" @click.stop="handleRemove(index)">
            <el-icon :size="12">
              <Close />
            </el-icon>
          </button>
        </div>
      </transition-group>
    </div>
  </transition>
</template>

<script lang="ts" setup>
import { fileIcon, formatFileSize } from "@/hooks/useFile";
import { Close } from "@element-plus/icons-vue";
import { computed, ref } from "vue";

export interface FileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  preview?: string;
}

const props = defineProps<{ files: FileItem[] }>();
const emit = defineEmits<{ remove: [index: number] }>();

const isHover = ref(false);
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"];

const displayFiles = computed(() =>
  props.files.map((item) => {
    const ext = item.name.split(".").pop()?.toLowerCase() || "";
    const isImage = IMAGE_TYPES.includes(item.type) || ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);
    return {
      ...item,
      ext,
      isImage,
      icon: fileIcon(ext),
      sizeText: formatFileSize(item.size),
      displayName: truncate(item.name, 18),
    };
  })
);

function truncate(name: string, max: number): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf(".");
  if (dot === -1) return name.slice(0, max - 1) + "…";
  const ext = name.slice(dot);
  const keep = max - ext.length - 1;
  return keep > 0 ? name.slice(0, keep) + "…" + ext : name.slice(0, max - 1) + "…";
}

function handleRemove(index: number) {
  emit("remove", index);
}
</script>

<style lang="scss" scoped>
.file-bar {
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(16px);
  height: 28px;
  overflow: hidden;
  transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.3s ease;
  display: flex;
  align-items: center;
  border-top: 1px solid var(--el-border-color-extra-light, rgba(0, 0, 0, 0.03));
  position: relative;
  z-index: 10;
  will-change: height;

  &.is-expanded {
    height: 84px;
    padding: 0 12px; // 保持 padding 一致，防止抖动
    background: rgba(255, 255, 255, 0.95);
  }
}

.file-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  width: 100%;
  height: 100%;
  align-items: center; // 确保垂直居中
}

.file-card {
  position: relative;
  border-radius: 8px;
  background: var(--el-bg-color, #fff);
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  height: 60px;
  display: flex;
  align-items: center;
  box-shadow: 0 2px 8px 0 rgba(0, 0, 0, 0.04);
  flex-shrink: 0;

  // 收缩状态下的样式
  .file-bar:not(.is-expanded) & {
    height: 20px;
    border: none;
    background: rgba(0, 0, 0, 0.05);
    border-radius: 4px;
    box-shadow: none;
    padding: 0 8px;
    margin-right: 4px;
    max-width: 140px;
    transition: none; // 收缩态切换时不使用动画，防止布局抖动

    .card-size, .card-close {
      display: none;
    }

    .card-info {
      display: flex;
      margin-left: 6px;
    }

    .card-name {
      font-size: 11px;
      color: var(--el-text-color-regular, #606266);
      font-weight: normal;
    }

    .card-image, .card-icon {
      width: 14px;
      height: 14px;
      border-radius: 2px;
    }
  }

  &:hover {
    border-color: var(--el-color-primary, #409eff);
    box-shadow: 0 4px 12px 0 rgba(0, 0, 0, 0.1);
    .card-close { opacity: 1; transform: scale(1); }
  }
}

// 图片卡片
.card-image {
  width: 60px;
  height: 60px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}

// 文件卡片
.card-file {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 8px;
  min-width: 150px;
  max-width: 220px;
  height: 100%;

  .file-bar:not(.is-expanded) & {
    padding: 0;
    min-width: 0;
  }
}

.card-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  fill: currentColor;
}

.card-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.card-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary, #303133);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

.card-size {
  font-size: 11px;
  color: var(--el-text-color-placeholder, #909399);
}

// 关闭按钮
.card-close {
  position: absolute;
  top: -8px;
  right: -8px;
  z-index: 20;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid var(--el-bg-color, #fff);
  background: #f56c6c;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transform: scale(0.5);
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);

  &:hover {
    background: #f89898;
    transform: scale(1.15);
  }

  :deep(.el-icon) {
    font-weight: bold;
  }
}

// 动画
.bar-fade-enter-active,
.bar-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.bar-fade-enter-from,
.bar-fade-leave-to {
  opacity: 0;
  transform: translateY(5px);
}

.item-pop-enter-active,
.item-pop-leave-active {
  transition: all 0.3s ease;
}
.item-pop-enter-from {
  opacity: 0;
  transform: scale(0.9) translateY(5px);
}
.item-pop-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
.item-pop-move {
  transition: transform 0.3s ease;
}
</style>
