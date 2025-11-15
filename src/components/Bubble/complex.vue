<template>
  <div
    :id="`message-${message.messageId}`"
    v-memo="[message, message.isOwner, parsed.parts?.length]"
    :class="['mixed-bubble', { 'mixed-bubble--owner': message.isOwner }]"
    class="mixed-bubble"
    role="group"
    @contextmenu.prevent.stop="onContextmenu($event, null)"
  >
    <div :aria-label="ariaLabel" class="mixed-bubble__inner" tabindex="0">
      <!-- 头像（可选） -->
      <div v-if="showAvatar" aria-hidden="true" class="mixed-bubble__avatar-wrap">
        <img :alt="message.name || message.chatId || 'avatar'" :src="avatarUrl" class="mixed-bubble__avatar" />
      </div>

      <!-- 内容：按 parts 顺序渲染 -->
      <div class="mixed-bubble__content">
        <template v-for="(part, idx) in parsed.parts">
          <!-- 文本部分：支持简单 html（已转义）和 @ 提示高亮 -->
          <div
            v-if="part.type === 'text'"
            :key="`p-text-${idx}`"
            class="mixed-bubble__part mixed-bubble__part--text"
            v-html="renderTextPart(part)"
            @contextmenu.prevent.stop="onContextmenu($event, { type: 'text', part, idx })"
          ></div>

          <!-- @ 提示单独渲染（如果你把 at 单独作为 part） -->
          <div
            v-else-if="part.type === 'at'"
            :key="`p-at-${idx}`"
            class="mixed-bubble__part mixed-bubble__part--at"
            @contextmenu.prevent.stop="onContextmenu($event, { type: 'at', part, idx })"
          >
            <span :data-mention-id="part.id" class="mixed-bubble__mention">@{{ part.name || part.id }}</span>
          </div>

          <!-- 图片：缩略图 + 点击预览 -->
          <div
            v-else-if="part.type === 'image'"
            :key="`p-img-${idx}`"
            class="mixed-bubble__part mixed-bubble__part--media"
            @contextmenu.prevent.stop="onContextmenu($event, { type: 'image', part, idx })"
          >
            <!-- 使用 el-image 可自动支持预览功能 -->
            <!-- <el-image
              :src="part.content?.path || part.content?.url || part.content"
              class="mixed-bubble__image"
              fit="cover"
              preview-src-list="[part.content?.path || part.content?.url || part.content]"
              @click.native.stop="openImage(part)"
            /> -->
          </div>

          <!-- 视频：内联 video 控件 -->
          <div
            v-else-if="part.type === 'video'"
            :key="`p-video-${idx}`"
            class="mixed-bubble__part mixed-bubble__part--media"
            @contextmenu.prevent.stop="onContextmenu($event, { type: 'video', part, idx })"
          >
            <video
              :src="part.content?.path || part.content?.url || part.content"
              class="mixed-bubble__video"
              controls
              preload="metadata"
              @click.stop
            />
          </div>

          <!-- 文件：图标 + 文件名 + 下载按钮 -->
          <div
            v-else-if="part.type === 'file'"
            :key="`p-file-${idx}`"
            class="mixed-bubble__part mixed-bubble__part--file"
            @contextmenu.prevent.stop="onContextmenu($event, { type: 'file', part, idx })"
          >
            <div class="mixed-bubble__file-left">
              <svg aria-hidden="true" class="mixed-bubble__file-icon" viewBox="0 0 24 24">
                <path d="M6 2h7l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
              </svg>
            </div>
            <div class="mixed-bubble__file-body">
              <div :title="part.content?.name || part.content" class="mixed-bubble__file-name">
                {{ part.content?.name || part.content }}
              </div>
              <div class="mixed-bubble__file-meta">
                <span class="mixed-bubble__file-size">{{ formatSize(part.content?.size) }}</span>
                <span v-if="part.content?.suffix" class="mixed-bubble__file-ext"> · {{ part.content.suffix }}</span>
              </div>
            </div>
            <div class="mixed-bubble__file-actions">
              <el-button :aria-label="t('mixed.download')" size="small" @click.stop="downloadFile(part)">{{
                  t("mixed.download")
                }}
              </el-button>
            </div>
          </div>

          <!-- 位置：标题 + 地址 -->
          <div
            v-else-if="part.type === 'location'"
            :key="`p-loc-${idx}`"
            class="mixed-bubble__part mixed-bubble__part--location"
            role="button"
            tabindex="0"
            @click.stop="openLocation(part)"
            @contextmenu.prevent.stop="onContextmenu($event, { type: 'location', part, idx })"
          >
            <div class="mixed-bubble__loc-title">{{ part.content?.title || t("mixed.location") }}</div>
            <div class="mixed-bubble__loc-addr">{{ part.content?.address || "" }}</div>
          </div>

          <!-- 回退：未知类型展示占位 -->
          <div
            v-else
            :key="`p-unknown-${idx}`"
            class="mixed-bubble__part mixed-bubble__part--unknown"
            @contextmenu.prevent.stop="onContextmenu($event, { type: 'unknown', part, idx })"
          >
            [{{ t("mixed.unknown") }}]
          </div>
        </template>
      </div>
    </div>

    <!-- 自定义右键菜单（最简单实现） -->
    <div
      v-if="menu.visible"
      :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
      class="mixed-bubble__context-menu"
      role="menu"
      @click.stop
    >
      <ul class="mixed-bubble__menu-list" role="list">
        <li
          v-for="(opt, i) in menu.options"
          :key="i"
          class="mixed-bubble__menu-item"
          role="menuitem"
          @click="onMenuClick(opt)"
        >
          {{ opt.label }}
        </li>
      </ul>
    </div>
  </div>
</template>

<script lang="ts" setup>
  /**
   * MixedBubble.vue
   * - 支持 parts 顺序渲染：text/image/video/file/location/at 等
   * - 右键上下文菜单（简单实现）
   * - 样式采用 BEM（mixed-bubble__*）
   *
   * 备注：该组件只负责渲染与交互事件（openImage/openLocation/download 等通过 emit 暴露）
   */

  import { computed, reactive } from "vue";
  import { useI18n } from "vue-i18n";
  import { ElMessage } from "element-plus";

  // props：message 必须包含 messageBody（string 或 object），并可能包含 isOwner/name/avatar 等
  const props = defineProps<{
    message: any;
    showAvatar?: boolean;
    avatarUrl?: string | null;
  }>();

  const emits = defineEmits<{
    (e: "open-image", payload: { src: string; part: any }): void;
    (e: "open-video", payload: { src: string; part: any }): void;
    (e: "download-file", payload: { part: any }): void;
    (e: "open-location", payload: { part: any }): void;
    (e: "copy-text", payload: { text: string }): void;
  }>();

  const { t } = useI18n();

  // --- 本地状态：解析后的 body / right-click 菜单 ---
  /** 解析 messageBody（兼容 string 或 object），并保证 parts 数组存在 */
  function parseBody(raw: any) {
    if (!raw) return { parts: [] as any[] };
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.parts)) return parsed;
        // 若历史格式存在 images/videos 则转换为 parts
        const parts: any[] = [];
        if (parsed.text) parts.push({ type: "text", content: { text: parsed.text } });
        if (Array.isArray(parsed.images) && parsed.images.length)
          parsed.images.forEach((im: any) => parts.push({ type: "image", content: im }));
        if (Array.isArray(parsed.videos) && parsed.videos.length)
          parsed.videos.forEach((v: any) => parts.push({ type: "video", content: v }));
        if (parsed.location) parts.push({ type: "location", content: parsed.location });
        return { ...parsed, parts };
      } catch (e) {
        // 非 JSON 字符串：把全部当作 text
        return { parts: [{ type: "text", content: { text: String(raw) } }] };
      }
    }
    // 是对象：确保 parts 存在
    const obj = { ...raw };
    if (!Array.isArray(obj.parts)) {
      const parts: any[] = [];
      if (obj.text) parts.push({ type: "text", content: { text: obj.text } });
      if (Array.isArray(obj.images)) obj.images.forEach((im: any) => parts.push({ type: "image", content: im }));
      if (Array.isArray(obj.videos)) obj.videos.forEach((v: any) => parts.push({ type: "video", content: v }));
      if (obj.location) parts.push({ type: "location", content: obj.location });
      obj.parts = parts;
    }
    return obj;
  }

  const parsed = computed(() => parseBody(props.message?.messageBody));

  // 简单 ariaLabel
  const ariaLabel = computed(() => {
    const name = props.message?.name || props.message?.chatId || "";
    return `${t("mixed.ariaPrefix")} ${name}`;
  });

  // avatar 控制
  const showAvatar = computed(() => props.showAvatar ?? Boolean(props.avatarUrl ?? props.message?.avatar));
  const avatarUrl = computed(() => props.avatarUrl ?? props.message?.avatar ?? "");

  // --- 右键菜单实现（最简单） ---
  const menu = reactive({
    visible: false,
    x: 0,
    y: 0,
    // current part 被点击（null 表示整体气泡）
    target: null as any,
    options: [] as { label: string; action: string }[]
  });

  // 生成菜单选项（根据 target.type）
  function buildMenuOptions(target: any) {
    if (!target) {
      return [{ label: t("mixed.copyAll"), action: "copyAll" }];
    }
    const type = target.type;
    switch (type) {
      case "text":
        return [{ label: t("mixed.copyText"), action: "copyText" }];
      case "image":
        return [
          { label: t("mixed.openImage"), action: "openImage" },
          { label: t("mixed.download"), action: "download" }
        ];
      case "video":
        return [
          { label: t("mixed.openVideo"), action: "openVideo" },
          { label: t("mixed.download"), action: "download" }
        ];
      case "file":
        return [{ label: t("mixed.download"), action: "download" }];
      case "location":
        return [{ label: t("mixed.openLocation"), action: "openLocation" }];
      default:
        return [{ label: t("mixed.copyAll"), action: "copyAll" }];
    }
  }

  /** 在指定位置打开菜单 */
  function openMenuAt(x: number, y: number, target: any) {
    menu.target = target;
    menu.options = buildMenuOptions(target);
    menu.x = x;
    menu.y = y;
    menu.visible = true;
    // 点击其它区域隐藏
    setTimeout(() => {
      window.addEventListener("click", onWindowClick);
    }, 0);
  }

  /** 隐藏菜单 */
  function hideMenu() {
    menu.visible = false;
    menu.target = null;
    menu.options = [];
    window.removeEventListener("click", onWindowClick);
  }

  function onWindowClick() {
    hideMenu();
  }

  /** 鼠标右键事件处理器：partInfo 可为 null 或 {type, part, idx} */
  function onContextmenu(ev: MouseEvent, partInfo: any | null) {
    ev.preventDefault();
    ev.stopPropagation();
    const rect = (ev.target as HTMLElement).getBoundingClientRect();
    // 优先使用鼠标位置
    openMenuAt(ev.clientX + 4, ev.clientY + 4, partInfo);
  }

  // 菜单项点击
  function onMenuClick(opt: { label: string; action: string }) {
    const t = menu.target;
    if (opt.action === "copyText") {
      if (t?.part?.content?.text) {
        copyToClipboard(String(t.part.content.text));
        ElMessage.success(t("mixed.copied"));
        emits("copy-text", { text: String(t.part.content.text) });
      }
    } else if (opt.action === "copyAll") {
      const all = buildPlainTextFromParts(parsed.value.parts);
      copyToClipboard(all);
      ElMessage.success(t("mixed.copied"));
      emits("copy-text", { text: all });
    } else if (opt.action === "openImage") {
      if (t?.part) openImage(t.part);
    } else if (opt.action === "openVideo") {
      if (t?.part) openVideo(t.part);
    } else if (opt.action === "download") {
      if (t?.part) downloadFile(t.part);
    } else if (opt.action === "openLocation") {
      if (t?.part) openLocation(t.part);
    }
    hideMenu();
  }

  // --- 主要交互：打开/下载/复制/位置 ---
  function openImage(part: any) {
    const src = part?.content?.path || part?.content?.url || part?.content;
    if (!src) return;
    emits("open-image", { src, part });
    // 也可以使用 el-image preview（这里示例：同时触发事件）
  }

  function openVideo(part: any) {
    const src = part?.content?.path || part?.content?.url || part?.content;
    if (!src) return;
    emits("open-video", { src, part });
  }

  function downloadFile(part: any) {
    emits("download-file", { part });
    ElMessage.info(t("mixed.downloading"));
  }

  function openLocation(part: any) {
    emits("open-location", { part });
  }

  // --- 文本渲染与工具函数 ---
  /** 安全转义 */
  function escapeHtml(s?: string) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** 将 parts 按顺序拼成 plain text（用于 copyAll） */
  function buildPlainTextFromParts(parts: any[]) {
    if (!Array.isArray(parts) || !parts.length) return "";
    const arr: string[] = [];
    for (const p of parts) {
      if (!p) continue;
      if (p.type === "text") arr.push(String(p.content?.text ?? ""));
      else if (p.type === "image") arr.push("[图片]");
      else if (p.type === "video") arr.push("[视频]");
      else if (p.type === "file") arr.push(`[文件] ${p.content?.name ?? ""}`);
      else if (p.type === "location") arr.push(`[位置] ${p.content?.title ?? ""} ${p.content?.address ?? ""}`);
      else arr.push("[附件]");
    }
    return arr.join(" ");
  }

  /** 渲染 text part 为 HTML（这里做简单转义 + 保留换行） */
  function renderTextPart(part: any) {
    const raw = String(part?.content?.text ?? "");
    const escaped = escapeHtml(raw).replace(/\n/g, "<br/>");
    // 如果存在 mentions （数组），可以在这里把 @name 用特殊 span 包裹（示例略）
    return escaped;
  }

  /** 复制到剪贴板 */
  function copyToClipboard(text: string) {
    try {
      navigator.clipboard?.writeText(text);
    } catch (e) {
      // 退回到兼容方案
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-10000px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }

  /** 格式化文件大小（简单实现） */
  function formatSize(size?: number) {
    if (!size && size !== 0) return "";
    const n = Number(size);
    if (isNaN(n)) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  // 国际化快捷函数（t 已从 useI18n 解构）
</script>

<style lang="scss" scoped>
  /* BEM 风格：mixed-bubble__* */
  .mixed-bubble {
    display: flex;
    align-items: flex-start;
    margin: 8px 0;
    max-width: 720px;

    &--owner {
      justify-content: flex-end;
    }

    &__inner {
      display: flex;
      gap: 12px;
      background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
      border: 1px solid rgba(20, 33, 64, 0.06);
      box-shadow: 0 6px 18px rgba(16, 24, 40, 0.04);
      padding: 12px;
      border-radius: 12px;
      transition: box-shadow 0.12s ease, transform 0.12s ease;
      width: 100%;
    }

    &__avatar-wrap {
      flex: 0 0 44px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    &__avatar {
      width: 44px;
      height: 44px;
      border-radius: 8px;
      object-fit: cover;
      border: 1px solid rgba(0, 0, 0, 0.04);
    }

    &__content {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    &__part {
      &--text {
        color: #0f1724;
        font-size: 14px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
      }

      &--at {
        color: #0f1724;
        font-weight: 600;

        .mixed-bubble__mention {
          background: #fff7cc;
          padding: 2px 6px;
          border-radius: 6px;
        }
      }

      &--media {
        display: flex;
        align-items: center;
      }

      &--file {
        display: flex;
        align-items: center;
        gap: 10px;
        background: #f8f9fb;
        border-radius: 8px;
        padding: 8px;
      }

      &--location {
        cursor: pointer;
        background: linear-gradient(90deg, #f8fbff, #fff);
        padding: 8px;
        border-radius: 8px;

        .mixed-bubble__loc-title {
          font-weight: 600;
          color: #0f1724;
        }

        .mixed-bubble__loc-addr {
          color: #6b7280;
          font-size: 13px;
        }
      }

      &--unknown {
        color: #6b7280;
      }
    }

    /* 图片样式 */
    .mixed-bubble__image {
      width: 220px;
      height: 140px;
      border-radius: 8px;
      object-fit: cover;
      cursor: pointer;
      border: 1px solid rgba(0, 0, 0, 0.04);
    }

    /* 视频样式 */
    .mixed-bubble__video {
      width: 320px;
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      background: #000;
      border: 1px solid rgba(0, 0, 0, 0.04);
    }

    /* 文件样式 */
    .mixed-bubble__file-left {
      flex: 0 0 36px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .mixed-bubble__file-icon {
      width: 28px;
      height: 28px;
      fill: #4b5563;
      opacity: 0.9;
    }

    .mixed-bubble__file-body {
      flex: 1 1 auto;
      min-width: 0;
    }

    .mixed-bubble__file-name {
      font-weight: 600;
      color: #0f1724;
      font-size: 14px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .mixed-bubble__file-meta {
      color: #6b7280;
      font-size: 12px;
      margin-top: 4px;
    }

    .mixed-bubble__file-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* 右键菜单 */
    .mixed-bubble__context-menu {
      position: fixed;
      z-index: 1500;
      min-width: 160px;
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
      overflow: hidden;
    }

    .mixed-bubble__menu-list {
      list-style: none;
      margin: 0;
      padding: 8px 0;
    }

    .mixed-bubble__menu-item {
      padding: 8px 14px;
      cursor: pointer;
      white-space: nowrap;
      color: #0f1724;
      font-size: 14px;
    }

    .mixed-bubble__menu-item:hover {
      background: #f5f7fb;
    }

    &:hover .mixed-bubble__inner {
      box-shadow: 0 10px 30px rgba(16, 24, 40, 0.06);
      transform: translateY(-2px);
    }

    /* small screens */
    @media (max-width: 520px) {
      .mixed-bubble__image {
        width: 160px;
        height: 110px;
      }
      .mixed-bubble__video {
        width: 100%;
      }
    }
  }
</style>
