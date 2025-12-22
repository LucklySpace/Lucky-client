<template>
  <!-- 列表项整体：可聚焦、可通过回车/空格触发 click 事件 -->
  <div
    :aria-label="`与 ${data.name || '未知'} 的聊天，${unreadLabel}`"
    :title="data.name"
    class="chat-item"
    role="button"
    tabindex="0"
    @click="$emit('click')"
    @keydown.enter.prevent="$emit('click')"
    @keydown.space.prevent="$emit('click')"
  >
    <!-- 头像区域（带角标） -->
    <div class="chat-item__avatar">
      <el-badge
        :badge-style="{ 'font-size': `12px` }"
        :hidden="data.unread == 0"
        :is-dot="data.isMute === 1"
        :max="99"
        :offset="[-1, 1]"
        :value="data.unread"
        class="chat-item__badge"
        color="#ff4d4f"
      >
        <Avatar
          :avatar="data.avatar || ' '"
          :name="data.groupName ?? data.name"
          :width="40"
          :borderRadius="4"
          :backgroundColor="isGroup ? '#ffb36b' : undefined"
        />
      </el-badge>
    </div>

    <!-- 信息主体 -->
    <div class="chat-item__body">
      <div class="chat-item__head">
        <span :title="data.name" class="chat-item__name">{{ data.name || "未知用户" }}</span>
        <span v-if="hasTime" class="chat-item__time">{{ friendlyTime }}</span>
      </div>

      <!-- 消息区域：有 message 则渲染（支持简单 HTML），否则显示占位空格 -->
      <div
        v-if="displayMessageHtml"
        v-dompurify="displayMessageHtml"
        :title="plainTextMessage"
        aria-live="polite"
        class="chat-item__message"
      />
      <div v-else aria-hidden="false" class="chat-item__message chat-item__message--placeholder">
        &nbsp;&ensp;&emsp;&thinsp;&zwnj;&zwj;
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  /**
   * 优化点（摘要）：
   *  - 增加键盘可操作性（tab + Enter/Space）
   *  - 头像加载错误回退
   *  - 对 data.message 为空做占位
   *  - 简易 HTML 清理函数（非完全安全，请在生产中考虑 DOMPurify）
   */

  import { computed } from "vue";
  import { useTimeFormat } from "@/hooks/useTimeFormat";
  import { IMessageType } from "@/constants";
  import Avatar from "@/components/Avatar/index.vue";

  const { useFriendlyTime } = useTimeFormat();

  /* -------------------- 类型定义 -------------------- */
  interface ChatData {
    groupName?: string;
    name?: string;
    avatar?: string;
    message?: string; // 可能为空
    messageTime?: number | "";
    unread?: number;
    isMute?: 0 | 1;
  }

  /* -------------------- props / emits -------------------- */
  const props = defineProps<{
    data: Partial<ChatData>;
  }>();

  const emit = defineEmits<{
    (e: "click"): void;
  }>();

  /* -------------------- 计算属性 -------------------- */

  // 是否显示时间
  const hasTime = computed(() => props.data.messageTime !== "" && !!props.data.messageTime);

  // 友好时间显示（钩子）
  const friendlyTime = computed(() =>
    props.data.messageTime && hasTime.value ? useFriendlyTime(props.data.messageTime as number, "MM/dd", false) : ""
  );

  // 无障碍提示（未读）
  const unreadLabel = computed(() =>
    props.data.unread && props.data.unread > 0 ? `${props.data.unread} 条未读` : "无未读"
  );

  // 是否群聊（用于统一群聊头像占位色）
  const isGroup = computed(() => (props.data as any)?.chatType === IMessageType.GROUP_MESSAGE.code || !!(props.data as any)?.groupName);

  // 将 message 转为纯文本（用于 title / aria）
  const plainTextMessage = computed(() => {
    const raw = props.data.message || "";
    // 去掉标签，转义空格
    return raw ? stripHtml(raw).replace(/\s+/g, " ").trim() : "";
  });

  /* -------------------- 简易 HTML 清理（注意：不是完全安全的 sanitizer） -------------------- */
  /**
   * 说明：
   *  - 此函数会解析 HTML、移除 script/style 节点、移除所有 on* 事件属性、移除 javascript: 协议
   *  - 生产环境请使用成熟库（如 DOMPurify）以防范所有 XSS 向量
   */
  function sanitizeHTML(input: string): string {
    if (!input) return "";

    // 如果环境中支持 DOMParser（浏览器），利用它解析并清理
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(input, "text/html");

      // 删除 script / style 等不安全节点
      doc.querySelectorAll("script,style,iframe,object,embed").forEach(n => n.remove());

      // 移除所有以 on 开头的属性 (onclick, onerror...)
      const allElements = doc.querySelectorAll("*");
      allElements.forEach(el => {
        // 复制属性以安全迭代
        Array.from(el.attributes).forEach(attr => {
          const name = attr.name.toLowerCase();
          const val = attr.value || "";
          if (name.startsWith("on")) {
            el.removeAttribute(attr.name);
          } else if (["href", "src"].includes(name) && val.trim().toLowerCase().startsWith("javascript:")) {
            // 移除 javascript: 协议
            el.removeAttribute(attr.name);
          } else {
            // 允许的属性保留（如 class, title 等）
          }
        });
      });

      // 返回清理后的 innerHTML
      return doc.body.innerHTML || "";
    } catch (e) {
      // 任何失败都退回为纯文本（转义）
      return escapeHtml(input);
    }
  }

  // 将 HTML 转为纯文本的辅助（用于 title / aria）
  function stripHtml(html = ""): string {
    try {
      const tmp = document.createElement("div");
      tmp.innerHTML = html;
      return tmp.textContent || tmp.innerText || "";
    } catch {
      const re: RegExp = new RegExp("<\/?[^>]+(>|$)", "g");
      // return html.replace(/<\/?[^>]+(>|$)/g, "");
      return html.replace(re, "");
    }
  }

  // 简单转义（在 sanitize 失败时回退）
  function escapeHtml(str = ""): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* -------------------- 展示内容（HTML / placeholder） -------------------- */
  const displayMessageHtml = computed(() => {
    const raw = props.data.message || "";
    if (!raw || raw.trim() === "") return ""; // 空 -> 占位
    // sanitize 并返回
    return sanitizeHTML(raw);
  });

  /* -------------------- 图片错误回退 -------------------- */
  // Avatar 组件已处理占位/错误，无需本地 onError
</script>

<style lang="scss" scoped>
  /* 统一样式变量（方便后续调整或抽到全局） */
  $avatar-size: 40px;
  $gap: 8px;
  $item-margin: 8px;
  $time-color: var(--content-message-font-color);
  $message-color: var(--content-message-font-color);
  $name-color: var(--side-font-color);
  $time-message-font-size: 12px;
  $placeholder-color: #9b9b9b;
  $height: 60px;
  $zero: 0px;

  /* 主容器 */
  .chat-item {
    display: flex;
    align-items: center;
    margin: $zero $item-margin $item-margin $item-margin;
    height: $height;
    gap: $gap;
    cursor: pointer;
    //border-radius: 6px;
    transition: background-color 0.18s ease, transform 0.08s ease;
    user-select: none;
    outline: none;

    // &:hover {
    //   background-color: var(--side-active-bg-color, rgba(0, 0, 0, 0.04));
    // }
    // &:active {
    //   background-color: rgba(0, 0, 0, 0.06);
    // }
    // &:focus {
    //   box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.12);
    // }

    /* 头像区域 */
    &__avatar {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 4px;

      .chat-item__avatar-img {
        width: $avatar-size;
        height: $avatar-size;
        border-radius: 8px;
        object-fit: cover;
        background-color: var(--side-border-right-color);
        display: block;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
        border: 1px solid rgba(0, 0, 0, 0.02);
      }
    }

    &__badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    /* 主体：名称/时间 + 消息 */
    &__body {
      flex: 1 1 auto;
      min-width: 0; // 允许内容正确截断
      display: flex;
      flex-direction: column;
    }

    &__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;

      .chat-item__name {
        font-size: 14px;
        // font-weight: 600;
        color: $name-color;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 60%;
      }

      .chat-item__time {
        font-size: $time-message-font-size;
        color: $time-color;
        flex: 0 0 auto;
        white-space: nowrap;
      }
    }

    /* 消息预览 - 支持两行截断 */
    &__message {
      font-size: $time-message-font-size;
      color: $message-color;
      line-height: 1.2;
      // display: -webkit-box;
      -webkit-box-orient: vertical;
      // -webkit-line-clamp: 2; /* 两行显示 */
      // overflow: hidden;
      // text-overflow: ellipsis;
      word-break: break-word;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      // min-height: 1.6em;
    }

    /* 消息为空时的占位样式 */
    &__message--placeholder {
      color: $placeholder-color;
      opacity: 0.9;
      font-style: italic;
    }
  }

  /* 小屏适配 */
  @media (max-width: 480px) {
    .chat-item {
      padding: 6px;

      &__avatar .chat-item__avatar-img {
        width: 40px;
        height: 40px;
      }

      &__head .chat-item__name {
        max-width: 55%;
        font-size: 13px;
      }

      &__message {
        font-size: 12px;
        -webkit-line-clamp: 2;
      }
    }
  }
</style>
