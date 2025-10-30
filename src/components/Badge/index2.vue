<template>
  <div :class="{ 'badge-status': status }" class="m-badge">
    <!-- 状态点 / 自定义 color 圆点 -->
    <template v-if="status || color">
      <span
        :class="[`status-${status || color}`, { 'dot-ripple': ripple }]"
        :style="[customDotStyle, offsetStyle]"
        class="u-status-dot"
      ></span>
      <span class="u-status-text">
        <slot>{{ text }}</slot>
      </span>
    </template>

    <!-- 普通文字或数字角标 -->
    <template v-else>
      <!-- 自定义内容插槽 -->
      <span v-if="showContent">
        <slot></slot>
      </span>

      <!-- 自定义 count 插槽 -->
      <span v-if="showCount" :class="{ 'only-number': !showContent }" class="m-count">
        <slot name="count"></slot>
      </span>

      <!-- 默认数字角标 / 小红点 -->
      <Transition name="zoom">
        <div
          v-show="showZero || count !== 0 || dot"
          :class="[{ 'small-num': count < 10, 'only-number': !showContent, 'only-dot': dot && !showZero }]"
          :style="[countStyle, offsetStyle]"
          :title="title || String(count)"
          class="m-badge-count"
        >
          <span v-if="!dot" class="m-number" style="transition: none">
            <span v-if="max > 0" class="u-number">
              {{ count > max ? max + "+" : count }}
            </span>
            <span v-else class="u-number">{{ count }}</span>
          </span>
        </div>
      </Transition>
    </template>
  </div>
</template>

<script lang="ts" setup>
  import { computed, CSSProperties, useSlots } from "vue";

  enum Status {
    success = "success",
    processing = "processing",
    default = "default",
    error = "error",
    warning = "warning"
  }

  interface Props {
    color?: string; // 自定义小圆点颜色
    count?: number; // 数字角标
    max?: number; // 数字封顶值
    showZero?: boolean; // count 为 0 时是否展示
    dot?: boolean; // 仅展示小圆点
    status?: Status; // 内置状态点
    text?: string; // 状态点文本
    ripple?: boolean; // 圆点涟漪动画
    title?: string; // 悬浮提示
    offset?: [number, number]; // 圆点/角标的 x/y 偏移 (px)
  }

  const props = withDefaults(defineProps<Props>(), {
    color: "",
    count: 0,
    max: 0,
    showZero: false,
    dot: false,
    status: undefined,
    text: "",
    ripple: true,
    title: "",
    offset: () => [0, 0] as [number, number]
  });

  const slots = useSlots();

  // 预设的内置颜色
  const presetColor = [
    "pink",
    "red",
    "yellow",
    "orange",
    "cyan",
    "green",
    "blue",
    "purple",
    "geekblue",
    "magenta",
    "volcano",
    "gold",
    "lime"
  ];

  /** 当使用自定义 color 且不在预设色里时，应用到圆点背景和文字 */
  const customDotStyle = computed<CSSProperties>(() => {
    if (props.color && !presetColor.includes(props.color)) {
      return {
        backgroundColor: props.color,
        color: props.color
      };
    }
    return {};
  });

  /** 位置偏移样式，通过 props.offset 调整圆点/角标坐标 */
  const offsetStyle = computed<CSSProperties>(() => {
    const [x, y] = props.offset!;
    return {
      transform: `translate(${x}px, ${y}px)`
    };
  });

  /** 文字或插槽是否存在 */
  const showContent = computed(() => {
    if (!props.status && !props.color) {
      const d = slots.default?.();
      return !!(d && d.length && d[0].children !== "v-if");
    }
    return false;
  });

  /** count 插槽是否存在 */
  const showCount = computed(() => {
    if (!props.status && !props.color) {
      const c = slots.count?.();
      return !!(c && c.length);
    }
    return false;
  });

  /** 数字角标样式 */
  const countStyle = computed<CSSProperties>(() => ({
    // 可以在这里做更多定制
  }));
</script>

<style lang="scss" scoped>
  .zoom-enter-active {
    animation: zoomBadgeIn 0.3s cubic-bezier(0.12, 0.4, 0.29, 1.46) both;
  }

  .zoom-leave-active {
    animation: zoomBadgeOut 0.3s cubic-bezier(0.12, 0.4, 0.29, 1.46) both;
  }

  @keyframes zoomBadgeIn {
    0% {
      transform: scale(0) translate(10%, -10%);
      opacity: 0;
    }
    100% {
      transform: scale(1) translate(10%, -10%);
    }
  }

  @keyframes zoomBadgeOut {
    0% {
      transform: scale(1) translate(10%, -10%);
    }
    100% {
      transform: scale(0) translate(10%, -10%);
      opacity: 0;
    }
  }

  .m-badge {
    position: relative;
    display: inline-block;
    font-size: 14px;
    line-height: 1;

    .u-status-dot {
      position: relative;
      top: -1px;
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }

    .dot-ripple::after {
      /* 涟漪伪元素 */
      content: "";
      position: absolute;
      inset: 0;
      border: 1px solid currentColor;
      border-radius: 50%;
      animation: dotRipple 1.2s infinite ease-in-out;
    }

    @keyframes dotRipple {
      0% {
        transform: scale(0.8);
        opacity: 0.5;
      }
      100% {
        transform: scale(2.4);
        opacity: 0;
      }
    }

    .u-status-text {
      margin-left: 8px;
    }

    .m-badge-count {
      position: absolute;
      top: 0;
      right: 0;
      transform-origin: 100% 0%;
      background: #ff4d4f;
      color: #fff;
      border-radius: 9px;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      font-size: 12px;
      text-align: center;
      transition: 0.2s;

      &.small-num {
        padding: 0 2px;
      }

      &.only-dot {
        width: 8px;
        height: 8px;
        padding: 0;
      }

      &.only-number {
        display: block;
        transform: none;
      }
    }
  }

  .badge-status {
    vertical-align: baseline;
  }
</style>
