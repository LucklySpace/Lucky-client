<template>
  <div class="avatar-container" :class="[
    `avatar--${shape}`,
    `avatar--${sizeType}`,
    { 'avatar--loading': isLoading }
  ]" :style="containerStyle">
    <el-image v-if="avatarSrc" :src="avatarSrc" :alt="altText" class="avatar-image" :fit="fit" loading="lazy"
      @load="handleImageLoad" @error="handleImageError">
      <template #placeholder>
        <avatar-fallback :name="name" :size="computedSize" :shape="shape" :color="color"
          :background-color="backgroundColor" />
      </template>
      <template #error>
        <avatar-fallback :name="name" :size="computedSize" :shape="shape" :color="color"
          :background-color="backgroundColor" />
      </template>
    </el-image>

    <!-- 无图片时显示占位符 -->
    <avatar-fallback v-else :name="name" :size="computedSize" :shape="shape" :color="color"
      :background-color="backgroundColor" />
  </div>
</template>

<script lang="ts" setup>
import { useAvatar } from "@/hooks/useImageCache";
import { computed, ref, watch } from "vue";

// 修复：直接自定义 ImageFit 类型（兼容所有 Element Plus 版本）
type ImageFit = 'fill' | 'contain' | 'cover' | 'none' | 'scale-down';

// 定义组件 Props 接口
interface AvatarProps {
  /** 头像图片地址 */
  avatar?: string;
  /** 显示名称（用于生成首字母占位符） */
  name?: string;
  /** 图片加载失败时显示的替代文本 */
  alt?: string;
  /** 头像大小，支持数字(px)或预设值(small/medium/large) */
  size?: number | 'small' | 'medium' | 'large';
  /** 头像形状 */
  shape?: 'circle' | 'square' | 'rounded';
  /** 宽度（优先级高于size） */
  width?: number;
  /** 圆角大小（仅对square/rounded形状生效） */
  borderRadius?: number;
  /** 文字颜色 */
  color?: string;
  /** 背景颜色 */
  backgroundColor?: string;
  /** 图片适应方式 */
  fit?: ImageFit;
  /** 是否显示加载状态 */
  showLoading?: boolean;
}

// 定义默认Props
const props = withDefaults(defineProps<AvatarProps>(), {
  size: 'medium',
  shape: 'rounded',
  width: 0,
  borderRadius: 8,
  color: '#ffffff',
  backgroundColor: '#409eff',
  fit: 'cover',
  showLoading: true,
  alt: 'user avatar'
});

// 定义组件Emits
const emit = defineEmits<{
  /** 图片加载成功回调 */
  load: [evt: Event];
  /** 图片加载失败回调 */
  error: [evt: Event];
  /** 头像加载完成（成功/失败）回调 */
  ready: [];
}>();

// 响应式状态
const isLoading = ref(false);
const hasError = ref(false);

// 头像缓存逻辑
const { avatarSrc, onAvatarLoad } = useAvatar(() => props.avatar);

// 计算头像尺寸
const computedSize = computed(() => {
  // 如果设置了width，优先使用width
  if (props.width) return props.width;

  // 根据size预设值转换为像素
  const sizeMap = {
    small: 28,
    medium: 36,
    large: 48
  };

  return typeof props.size === 'number'
    ? props.size
    : sizeMap[props.size];
});

// 尺寸类型（用于样式类名）
const sizeType = computed(() => {
  return typeof props.size === 'string'
    ? props.size
    : 'custom';
});

// 替代文本
const altText = computed(() => {
  return props.alt || props.name || 'user avatar';
});

// 容器样式
const containerStyle = computed(() => ({
  width: `${computedSize.value}px`,
  height: `${computedSize.value}px`,
  borderRadius: props.shape === 'circle'
    ? '50%'
    : props.shape === 'rounded'
      ? `${props.borderRadius}px`
      : '0',
}));

// 图片加载处理
const handleImageLoad = (evt: Event) => {
  isLoading.value = false;
  hasError.value = false;
  onAvatarLoad();
  emit('load', evt);
  emit('ready');
};

// 图片错误处理
const handleImageError = (evt: Event) => {
  isLoading.value = false;
  hasError.value = true;
  emit('error', evt);
  emit('ready');

  // 可选：获取详细错误信息
  const errorEvent = evt as ErrorEvent;
  console.error('Avatar image load failed:', errorEvent.message);
};

// 监听头像地址变化
watch(() => props.avatar, () => {
  if (props.avatar && props.showLoading) {
    isLoading.value = true;
  }
}, { immediate: true });

// 占位符组件
const AvatarFallback = defineComponent({
  props: {
    name: {
      type: String,
      default: ''
    },
    size: {
      type: Number,
      required: true
    },
    shape: {
      type: String,
      required: true
    },
    color: {
      type: String,
      required: true
    },
    backgroundColor: {
      type: String,
      required: true
    }
  },
  setup(props) {
    // 生成首字母
    const initial = computed(() => {
      const name = props.name?.trim();
      if (!name) return '?';

      // 支持中英文首字母
      const firstChar = name.charAt(0);
      return /[A-Za-z]/.test(firstChar)
        ? firstChar.toUpperCase()
        : firstChar;
    });

    // 占位符样式
    const fallbackStyle = computed(() => ({
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: props.backgroundColor,
      color: props.color,
      borderRadius: props.shape === 'circle' ? '50%' : 'inherit',
      fontSize: `${props.size * 0.4}px`,
      fontWeight: 500
    }));

    return { initial, fallbackStyle };
  },
  template: `
    <span class="avatar-fallback" :style="fallbackStyle">
      {{ initial }}
    </span>
  `
});
</script>

<style lang="scss" scoped>
.avatar-container {
  display: inline-flex;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
  background-color: #e6e6e6;
  border: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  flex-shrink: 0;
  transition: all 0.2s ease;

  // 尺寸预设
  &.avatar--small {
    width: 28px;
    height: 28px;
  }

  &.avatar--medium {
    width: 36px;
    height: 36px;
  }

  &.avatar--large {
    width: 48px;
    height: 48px;
  }

  // 形状样式
  &.avatar--circle {
    border-radius: 50%;
  }

  &.avatar--rounded {
    border-radius: 8px;
  }

  &.avatar--square {
    border-radius: 0;
  }

  // 加载状态
  &.avatar--loading {
    opacity: 0.7;
  }
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-fallback {
  user-select: none;
  line-height: 1;
  text-align: center;
}

// 加载动画（可选）
:deep(.el-image__placeholder) {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
