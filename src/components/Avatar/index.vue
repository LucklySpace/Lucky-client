<template>
  <el-image :src="safeAvatar" :alt="(name || 'avatar') + ''" :class="['chat-item__avatar-img', 'lazy-img']" :style="{
    width: width + 'px',
    height: width + 'px',
    borderRadius: borderRadius + 'px'
  }" fit="cover" loading="lazy">
    <template #placeholder>
      <span class="default" :style="{
        width: width + 'px',
        height: width + 'px',
        color: color,
        backgroundColor: backgroundColor,
        borderRadius: borderRadius + 'px',
        fontSize: (width * 0.4) + 'px'
      }">
        {{ defaultName(name || '未') }}
      </span>
    </template>
    <template #error>
      <span class="default" :style="{
        width: width + 'px',
        height: width + 'px',
        color: color,
        backgroundColor: backgroundColor,
        borderRadius: borderRadius + 'px',
        fontSize: (width * 0.4) + 'px'
      }">
        {{ defaultName(name || '未') }}
      </span>
    </template>
  </el-image>
</template>

<script lang="ts" setup>

const props = withDefaults(defineProps<{
  avatar?: string,
  name?: string,
  width?: number,
  borderRadius?: number,
  color?: string,
  backgroundColor?: string,
}>(), {
  width: 36,
  borderRadius: 3,
  color: 'white',
  backgroundColor: '#409eff'
});
const safeAvatar = computed(() => (props.avatar || '').trim());

const defaultName = (name: string) => {
  if (!name) return '无'
  const n = name?.trim() ?? "";
  if (!n) return "?";
  const first = n[0];
  return /[A-Za-z]/.test(first) ? first.toUpperCase() : first;
}


</script>

<style lang="scss" scoped>
/* 不需要在这里定义未使用的变量，保持整洁 */

.chat-item__avatar-img {
  /* 1. 关键修复：防止边框撑大尺寸 */
  box-sizing: border-box;

  /* 2. 布局修复 */
  display: block;
  /* 消除 inline 元素的间隙 */
  width: 100%;
  height: 100%;

  /* 3. 视觉样式 */
  object-fit: cover;
  background-color: #e6e6e6;
  border: 1px solid rgba(0, 0, 0, 0.05);
  /* 稍微加深一点边框可见度 */
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);

  /* 4. 防止被挤压 */
  flex-shrink: 0;
}

.default {
  /* 确保占位符填满容器 */
  width: 100%;
  height: 100%;

  display: flex;
  align-items: center;
  justify-content: center;

  /* 5. 字体对齐修复 */
  line-height: 1;
  /* 防止文字受行高影响偏移 */
  font-weight: 500;
  // cursor: default;
  user-select: none;

  /* 确保占位符也有盒模型保护 */
  box-sizing: border-box;
}
</style>
