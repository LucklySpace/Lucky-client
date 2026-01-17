<template>
  <el-image :src="avatarSrc" :alt="name || 'avatar'" class="avatar" :style="avatarStyle" fit="cover" loading="lazy"
    @load="onAvatarLoad">
    <template #placeholder>
      <span class="avatar__fallback" :style="fallbackStyle">{{ initial }}</span>
    </template>
    <template #error>
      <span class="avatar__fallback" :style="fallbackStyle">{{ initial }}</span>
    </template>
  </el-image>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { useAvatar } from "@/hooks/useImageCache";

const props = withDefaults(
  defineProps<{
    avatar?: string;
    name?: string;
    width?: number;
    borderRadius?: number;
    color?: string;
    backgroundColor?: string;
  }>(),
  {
    width: 36,
    borderRadius: 3,
    color: "white",
    backgroundColor: "#409eff"
  }
);

// 头像缓存
const { avatarSrc, onAvatarLoad } = useAvatar(() => props.avatar);

// 首字母
const initial = computed(() => {
  const n = props.name?.trim();
  if (!n) return "?";
  const first = n[0];
  return /[A-Za-z]/.test(first) ? first.toUpperCase() : first;
});

// 样式
const avatarStyle = computed(() => ({
  width: `${props.width}px`,
  height: `${props.width}px`,
  borderRadius: `${props.borderRadius}px`
}));

const fallbackStyle = computed(() => ({
  ...avatarStyle.value,
  color: props.color,
  backgroundColor: props.backgroundColor,
  fontSize: `${props.width * 0.4}px`
}));
</script>

<style lang="scss" scoped>
.avatar {
  display: block;
  box-sizing: border-box;
  object-fit: cover;
  background-color: #e6e6e6;
  border: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  flex-shrink: 0;

  &__fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    line-height: 1;
    font-weight: 500;
    user-select: none;
    box-sizing: border-box;
  }
}
</style>
