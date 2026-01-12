<template>
  <div :class="{ 'badge-status': status, 'font-size': `${fontSize}px` }" class="m-badge">
    <template v-if="status || color">
      <span :class="[`status-${status || color}`, { 'dot-ripple': ripple }]" :style="[customStyle, offsetStyle]"
        class="u-status-dot"></span>
      <span class="u-status-text">
        <slot>{{ text }}</slot>
      </span>
    </template>
    <template v-else>
      <span v-if="showContent">
        <slot></slot>
      </span>
      <span v-if="showCount" :class="{ 'only-number': !showContent }" class="m-count">
        <slot name="count"></slot>
      </span>
      <Transition v-else name="zoom">
        <div v-show="showZero || count !== 0 || dot"
          :class="{ 'small-num': count < 10, 'only-number': !showContent, 'only-dot': dot && !showZero }"
          :style="[countStyle, offsetStyle]" :title="title || String(count)" class="m-badge-count">
          <span v-if="!dot" class="m-number" style="transition: none 0s ease 0s">
            <span v-if="max > 0" class="u-number">{{ count > max ? max + "+" : count }}</span>
            <span v-else class="u-number">{{ count }}</span>
          </span>
        </div>
      </Transition>
    </template>
  </div>
</template>

<script lang="ts" setup>
/**
 * 参考地址：https://blog.csdn.net/Dandrose/article/details/132077553
 */

import type { CSSProperties } from "vue";
import { computed, useSlots } from "vue";

enum Status {
  success = "success",
  process = "processing",
  default = "default",
  error = "error",
  warning = "warning"
}

interface Props {
  fontSize?: number; // 字体大小
  color?: string; // 自定义小圆点的颜色
  count?: number; // 展示的数字，大于 max 时显示为 max+，为 0 时隐藏；number | slot
  max?: number; // 展示封顶的数字值
  showZero?: boolean; // 当数值为 0 时，是否展示 Badge
  dot?: boolean; // 不展示数字，只有一个小红点
  status?: Status; // 设置 Badge 为状态点
  text?: string; // 在设置了 status 的前提下有效，设置状态点的文本 string | slot
  countStyle?: CSSProperties; // 设置状态点的样式
  title?: string; // 设置鼠标放在状态点上时显示的文字
  ripple?: boolean; // 是否开启涟漪动画效果
  offset?: [number, number]; // 圆点/角标的 x/y 偏移 (px)
}

const props = withDefaults(defineProps<Props>(), {
  fontSize: 14,
  color: "",
  count: 0,
  max: 0,
  showZero: false,
  dot: false,
  status: undefined,
  text: "",
  countStyle: () => ({}),
  title: "",
  ripple: true,
  offset: () => [0, 0] as [number, number]
});

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
const customStyle = computed(() => {
  if (props.color && !presetColor.includes(props.color)) {
    return {
      color: props.color,
      backgroundColor: props.color
    };
  }
});

/** 位置偏移样式，通过 props.offset 调整圆点/角标坐标 */
const offsetStyle = computed<CSSProperties>(() => {
  const [x, y] = props.offset!;
  return {
    transform: `translate(${x}px, ${y}px)`
  };
});

const slots = useSlots();

/** 文字或插槽是否存在 */
const showContent = computed(() => {
  if (!props.status && !props.color) {
    const defaultSlots = slots.default?.();
    if (defaultSlots) {
      return Boolean(defaultSlots[0].children !== "v-if" && defaultSlots?.length);
    }
  }
  return false;
});

/** count 插槽是否存在 */
const showCount = computed(() => {
  if (!props.status && !props.color) {
    const countSlots = slots.count?.();
    return Boolean(countSlots?.length);
  }
  return false;
});
</script>

<style lang="scss" scoped>
.zoom-enter-active {
  animation: zoomBadgeIn 0.3s cubic-bezier(0.12, 0.4, 0.29, 1.46);
  animation-fill-mode: both;
}

.zoom-leave-active {
  animation: zoomBadgeOut 0.3s cubic-bezier(0.12, 0.4, 0.29, 1.46);
  animation-fill-mode: both;
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
  font-size: 14px;
  color: rgba(0, 0, 0, 0.88);
  line-height: 1;
  position: relative;
  display: inline-block;
  width: fit-content;

  .u-status-dot {
    position: relative;
    top: -1px;
    display: inline-block;
    width: 6px;
    height: 6px;
    vertical-align: middle;
    border-radius: 50%;
  }

  .dot-ripple {
    &::after {
      box-sizing: border-box;
      position: absolute;
      top: 0;
      inset-inline-start: 0;
      width: 100%;
      height: 100%;
      border-width: 1px;
      border-style: solid;
      border-color: inherit;
      border-radius: 50%;
      animation-name: dotRipple;
      animation-duration: 1.2s;
      animation-iteration-count: infinite;
      animation-timing-function: ease-in-out;
      content: "";
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
  }

  .status-success {
    color: #52c41a;
    background-color: #52c41a;
  }

  .status-error {
    color: #ff4d4f;
    background-color: #ff4d4f;
  }

  .status-default {
    color: rgba(0, 0, 0, 0.25);
    background-color: rgba(0, 0, 0, 0.25);
  }

  //.status-processing {
  //color: @themeColor;
  // background-color: @themeColor;
  //}

  .status-warning {
    color: #faad14;
    background-color: #faad14;
  }

  .status-pink {
    color: #eb2f96;
    background-color: #eb2f96;
  }

  .status-red {
    color: #f5222d;
    background-color: #f5222d;
  }

  .status-yellow {
    color: #fadb14;
    background-color: #fadb14;
  }

  .status-orange {
    color: #fa8c16;
    background-color: #fa8c16;
  }

  .status-cyan {
    color: #13c2c2;
    background-color: #13c2c2;
  }

  .status-green {
    color: #52c41a;
    background-color: #52c41a;
  }

  //.status-blue {
  // color: @themeColor;
  // background-color: @themeColor;
  //}

  .status-purple {
    color: #722ed1;
    background-color: #722ed1;
  }

  .status-geekblue {
    color: #2f54eb;
    background-color: #2f54eb;
  }

  .status-magenta {
    color: #eb2f96;
    background-color: #eb2f96;
  }

  .status-volcano {
    color: #fa541c;
    background-color: #fa541c;
  }

  .status-gold {
    color: #faad14;
    background-color: #faad14;
  }

  .status-lime {
    color: #a0d911;
    background-color: #a0d911;
  }

  .u-status-text {
    margin-inline-start: 8px;
    color: rgba(0, 0, 0, 0.88);
    font-size: 14px;
  }

  .m-count {
    position: absolute;
    top: 0;
    inset-inline-end: 0;
    transform: translate(50%, -50%);
    transform-origin: 100% 0%;
  }

  .m-badge-count {
    position: absolute;
    top: 2px;
    right: 0px;
    background-color: #ff4d4f;
    color: white;
    border-radius: 9px;
    min-width: 16px;
    // display: flex;
    // justify-content: center;
    // align-items: center;
    text-align: center;
    font-size: 12px;
    font-weight: 100;
    height: 16px;
    padding: 0px 2px 0px 2px;
    line-height: 16px;
    //box-shadow: 0 0 0 1px #ffffff;
    transition: 0.2s;

    .m-number {
      position: relative;
      display: inline-block;
      height: 16px;
      transition: all 0.3s cubic-bezier(0.12, 0.4, 0.29, 1.46);
      transform-style: preserve-3d;
      -webkit-transform-style: preserve-3d; // 设置元素的子元素是位于 3D 空间中还是平面中 flat | preserve-3d
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden; // 当元素背面朝向观察者时是否可见 hidden | visible

      .u-number {
        display: inline-block;
        height: 16px;
        margin: 0;
        transform-style: preserve-3d;
        -webkit-transform-style: preserve-3d;
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
      }
    }
  }

  .small-num {
    padding: 0;
  }

  .only-number {
    position: relative;
    top: auto;
    display: block;
    transform-origin: 50% 50%;
    transform: none;
  }

  .only-dot {
    z-index: auto;
    width: 10px;
    min-width: 10px;
    height: 10px;
    background: #ff4d4f;
    border-radius: 100%;
    // box-shadow: 0 0 0 1px #ffffff;
    padding: 0;
    transition: 0.3s;
  }
}

.badge-status {
  line-height: inherit;
  vertical-align: baseline;
}
</style>
