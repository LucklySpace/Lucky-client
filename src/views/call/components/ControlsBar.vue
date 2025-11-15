<template>
  <div
    aria-label="call controls"
    class="bottom-controls"
    role="region"
    @mouseenter="$emit('mouseenter')"
    @mouseleave="$emit('mouseleave')"
  >
    <!-- 静音按钮：isMuted 为 true 时为 active；为 false 时显示斜线 -->
    <button
      :aria-pressed="isMuted"
      :class="{ active: isMuted, 'with-slash': isMuted }"
      aria-label="toggle mute"
      class="control-btn"
      type="button"
      @click="$emit('toggle-mute')"
    >
      <i aria-hidden="true" class="iconfont icon-maikefeng"></i>
    </button>

    <!-- 视频按钮：isVideoOff 为 true 时为 active（表示摄像头关闭），为 false 时显示斜线 -->
    <button
      :aria-pressed="isVideoOff"
      :class="{ active: isVideoOff, 'with-slash': isVideoOff }"
      aria-label="toggle video"
      class="control-btn"
      type="button"
      @click="$emit('toggle-video')"
    >
      <i aria-hidden="true" class="iconfont icon-shexiangtou_shiti"></i>
    </button>

    <!-- 挂断 -->
    <button aria-label="hang up" class="control-btn hangup" type="button" @click="$emit('hang-up')">
      <i aria-hidden="true" class="iconfont icon-guaduan"></i>
    </button>

    <!-- 折叠聊天 -->
    <button
      :class="{ active: isChatCollapsed, 'with-slash': isChatCollapsed }"
      aria-label="toggle chat"
      class="control-btn"
      type="button"
      @click="$emit('toggle-chat')"
    >
      <i aria-hidden="true" class="iconfont icon-liaotian"></i>
    </button>
  </div>
</template>

<script lang="ts" setup>
  /**
   * ControlsBar.vue
   * - 改动：为静音/视频按钮在 prop 为 false 情况下添加斜线（class 名：with-slash）
   * - 实现：通过 :class 动态绑定，并用 CSS 伪元素 ::after 绘制斜线（不会阻止点击）
   */

  import { defineProps } from "vue";

  const props = defineProps<{
    isMuted: boolean;
    isVideoOff: boolean;
    isChatCollapsed: boolean;
  }>();

  // 说明：模板中直接使用 props（绑定 class）
</script>

<style lang="scss" scoped>
  .bottom-controls {
    position: fixed;
    left: 50%;
    bottom: 18px;
    transform: translateX(-50%);
    display: flex;
    gap: 30px;
    align-items: center;
    z-index: 1200;
    padding: 8px 14px;
    border-radius: 999px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
    background: rgba(12, 18, 30, 0.72);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);

    .control-btn {
      /* 必须 relative，以便伪元素定位于按钮之上 */
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      border-radius: 50%;
      border: none;
      background: #f1eded;
      color: #635858;
      box-shadow: 0 6px 18px rgba(3, 8, 15, 0.45);
      cursor: pointer;
      font-size: 30px;
      transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
      overflow: visible; /* 允许伪元素溢出显示 */

      i {
        font-size: 25px;
        transform: translateY(-1px);
        pointer-events: none; /* 确保斜线不会阻断图标交互 */
      }

      &:hover {
        transform: translateY(-3px) scale(1.02);
        background: rgba(255, 255, 255, 0.09);
      }

      &.active {
        background: rgba(255, 255, 255, 0.06);
        color: #fff;
      }

      /* 挂断按钮样式 */
      &.hangup {
        background-color: #e05b5b;

        i {
          color: #fff;
          font-size: 10px;
        }
      }

      /* 聊天切换按钮样式 */
      &.chat-toggle {
        background: rgba(255, 255, 255, 0.03);
        color: #d9e6ff;
        box-shadow: none;
        width: 56px;
        height: 56px;
      }

      /* ========== 斜线样式（当 with-slash class 存在时显示） ========== */
      &.with-slash::after {
        /* 用伪元素绘制一条穿过图标的斜线 */
        content: "";
        position: absolute;
        left: 50%;
        top: 50%;
        /* 线的长度、粗细可调整；这里使用长度为 90% 的对角线 */
        width: 2px;
        height: 50%;
        /* 旋转成斜线（-45deg 或 45deg 可选） */
        transform: translate(-50%, -50%) rotate(30deg);
        transform-origin: center;
        /* 颜色与透明度（可按主题调整） */
        background: rgba(255, 255, 255, 0.9);
        /* 不影响点击事件 */
        pointer-events: none;
        border-radius: 2px;
        box-shadow: 0 1px 0 rgba(0, 0, 0, 0.15);
        /* 轻微内缩避免挤边 */
        margin: 0 2px;
      }

      /* 如果图标颜色较浅，可以用暗色斜线替代（在浅背景下更清晰） */
      /* &.with-slash::after { background: rgba(0,0,0,0.85); } */
    }
  }

  /* 小屏时保持按钮尺寸合适 */
  @media (max-width: 520px) {
    .bottom-controls .control-btn {
      width: 48px;
      height: 48px;
    }
  }
</style>
