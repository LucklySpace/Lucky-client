<template>
  <div aria-label="视频列表" class="video-grid" role="list">
    <!-- 保持原 v-for 遍历顺序：participantIds -->
    <div
      v-for="userId in participantIds"
      :key="userId"
      :aria-label="`视频单元：${userDisplayName(userId)}`"
      class="video-cell"
      role="listitem"
    >
      <!-- video 元素：大小由 .video-window 控制（100% 宽度 + aspect） -->
      <video
        :ref="el => onVideoRef(el, userId)"
        :aria-label="`视频：${userDisplayName(userId)}`"
        :muted="userId === id"
        autoplay
        class="video-window"
        controlslist="nodownload noremoteplayback"
        playsinline
      ></video>

      <!-- 左下角静音徽章（不影响布局） -->
      <div v-if="isMuted(userId)" aria-hidden="true" class="mute-badge">
        <i aria-hidden="true" class="iconfont icon-mti-guanbijingyin"></i>
      </div>

      <!-- 右下角用户名徽章 -->
      <div :title="userDisplayName(userId)" aria-hidden="true" class="name-badge">
        {{ userDisplayName(userId) }}
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from "vue";
  import type { Participant } from "@/types/env";

  const props = defineProps<{
    participants: Map<string, Participant> | Participant[] | string[] | null | undefined;
    id?: string; // 当前用户 id（用于静音自己）
    setRef?: (el: HTMLVideoElement | null, id: string) => void;
  }>();

  /** 1) 规范化 participants -> id 列表（string[]） */
  const participantIds = computed<string[]>(() => {
    const p = props.participants as any;
    if (!p) return [];
    if (p instanceof Map) {
      return Array.from(p.keys());
    }
    if (Array.isArray(p)) {
      if (p.length === 0) return [];
      if (typeof p[0] === "string") return p as string[];
      // Participant[]
      return (p as Participant[]).map(item => item.userId ?? "");
    }
    return [];
  });

  /** 从 participants 获取 Participant 对象（防御型） */
  function getParticipant(userId: string): Participant | undefined {
    const p = props.participants as any;
    if (!p) return undefined;
    if (p instanceof Map) return p.get(userId);
    if (Array.isArray(p)) {
      if (typeof p[0] === "string") return undefined;
      return (p as Participant[]).find(item => (item.userId ?? "") === userId);
    }
    return undefined;
  }

  /**
   * onVideoRef - setRef 回调包装
   * - 会在 mount 时传入 HTMLVideoElement，unmount 时会被 vue 回调 null
   * - 同时，如果 participant 带有 MediaStream，会直接把 stream 绑定到 video（便于内部快速预览）
   */
  function onVideoRef(el: Element | null | any, userId: string) {
    const videoEl = el instanceof HTMLVideoElement ? (el as HTMLVideoElement) : null;

    // 若 participant 带有 stream，则优先绑定（safe try）
    const p = getParticipant(userId);
    if (videoEl && p && p.stream instanceof MediaStream) {
      try {
        // 注意：如果父组件也会设置 srcObject，这里会被覆盖（按使用方约定），但通常能加快显示
        if (videoEl.srcObject !== p.stream) {
          videoEl.srcObject = p.stream;
        }
        // 尝试播放（浏览器策略可能阻止）
        videoEl.play().catch(() => {
        });
      } catch {
        // ignore
      }
    }

    // 将 videoEl 或 null 回调给父组件（确保父组件能在 unmount 时清理）
    try {
      props.setRef?.(videoEl, userId);
    } catch (err) {
      // 防御性日志：避免在渲染流程抛出错误
      // eslint-disable-next-line no-console
      console.warn("VideoGrid.setRef 回调错误:", err);
    }
  }

  /* ========== 一些便捷函数 ========== */
  function userDisplayName(userId: string) {
    return getParticipant(userId)?.name ?? userId ?? "未知";
  }

  function isMuted(userId: string) {
    return !!getParticipant(userId)?.muted;
  }
</script>

<style lang="scss" scoped>
  .video-grid {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-content: center;
    gap: 10px;
    width: 96%;
    height: calc(100vh - 30px);
    padding: 8px;
    box-sizing: border-box;
    overflow: hidden;

    /* video-cell 保持与原来 video-window 相同的 flex 规则（以确保布局不变） */
    .video-cell {
      position: relative;
      display: block;
      flex: 1 1 calc(32% - 10px); /* 与你原来的一致但留出更稳的 gap */
      min-width: 32%;
      max-width: 96%;
      overflow: hidden; /* 防止 badge 溢出影响布局 */
      border-radius: 6px;
    }

    /* video-window 基本样式与原来保持一致 */
    .video-window {
      width: 100%;
      display: block;
      aspect-ratio: 16/9;
      border-radius: 6px;
      object-fit: cover;
      background-color: #444;
      color: #fff;
      font-size: 1.2em;
      border: none;
    }

    /* 左下角静音徽章（小而不抢镜） */
    .mute-badge {
      position: absolute;
      left: 10px;
      bottom: 10px;
      min-width: 30px;
      height: 30px;
      pointer-events: none;
      background: rgba(0, 0, 0, 0.56);
      color: #fff;
      padding: 6px 8px;
      border-radius: 8px;
      font-size: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 6px 14px rgba(0, 0, 0, 0.45);
      white-space: nowrap;
    }

    /* 右下角用户名徽章 */
    .name-badge {
      position: absolute;
      right: 10px;
      bottom: 10px;
      max-width: calc(100% - 100px); /* 防止超长名字遮挡视频主体 */
      pointer-events: none;
      background: linear-gradient(180deg, rgba(0, 0, 0, 0.48), rgba(0, 0, 0, 0.32));
      color: #fff;
      padding: 6px 10px;
      border-radius: 8px;
      font-size: 13px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 6px 14px rgba(0, 0, 0, 0.45);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      backdrop-filter: blur(6px);
    }

    /* 让两个徽章在同时出现时不会重叠（当容器宽度过小时会自动换行/遮截） */
    .video-cell {
      .mute-badge {
        left: 10px;
      }

      .name-badge {
        right: 10px;
      }
    }

    /* 响应式：窄屏时单列展示并调整徽章尺寸/位置 */
    @media (max-width: 720px) {
      .video-cell {
        flex-basis: 100%;
        min-width: 100%;
        max-width: 100%;
        border-radius: 4px;
      }

      .mute-badge {
        left: 8px;
        bottom: 8px;
        padding: 5px 7px;
        font-size: 13px;
      }

      .name-badge {
        right: 8px;
        bottom: 8px;
        padding: 5px 8px;
        font-size: 13px;
        max-width: calc(100% - 80px);
      }
    }
  }
</style>
