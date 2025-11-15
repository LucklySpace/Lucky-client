<template>
  <div
    :id="`message-${message.messageId}`"
    v-context-menu="getMenuConfig(message)"
    v-memo="[message, message.isOwner]"
    :class="['bubble', message.type, { owner: message.isOwner }]"
    class="message-bubble"
    @click="handleLinkClick"
  >
    <div v-dompurify="handleMessageProcess(message.messageBody?.text)" class="text" translate="yes"></div>
  </div>
  <!-- <Forward :visible="forwardVisible" :contacts="contacts"></Forward> -->
</template>

<script lang="ts" setup>
  import { urlToLink } from "@/utils/Strings";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import ClipboardManager from "@/utils/Clipboard";
  import { globalEventBus } from "@/hooks/useEventBus";
  import { MessageContentType } from "@/constants";
  import { storage } from "@/utils/Storage";

  defineProps({
    message: {
      type: Object,
      required: true,
      default: function() {
        return {};
      }
    }
  });

  /**
   * 处理文本消息
   * @param message 文本消息
   */
  const handleMessageProcess = (message: string) => {
    // 判断是否有 `url`
    return urlToLink(message);
  };

  // 判断当前用户是否为消息所有者（优先 isOwner 字段）
  function isOwnerOfMessage(item: any) {
    if (!item) return false;
    if (typeof item.isOwner === "boolean") return item.isOwner;
    const currentUserId = storage.get("userId");
    return String(item.fromId) === String(currentUserId);
  }

  /**
   * 判断传入时间戳是否在当前时间的两分钟内
   * @param timestamp 时间戳 (毫秒)
   * @returns true 表示在 2 分钟内, false 表示超过
   */
  function isWithinTwoMinutes(timestamp: number): boolean {
    const now = Date.now();
    const diff = Math.abs(now - timestamp); // 时间差，取绝对值，避免顺序问题
    return diff <= import.meta.env.VITE_MESSAGE_RECALL_TIME; // 2 分钟 = 120000 毫秒
  }

  /**
   * 拦截点击事件，使用 openUrl 打开 data-url 链接
   */
  const handleLinkClick = async (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName.toLowerCase() === "a" && target.dataset.url) {
      e.preventDefault();
      const url = target.dataset.url;
      try {
        await openSafeUrl(url!);
      } catch (err) {
        console.log("请求地址打开失败:", url);
      }
    }
  };

  /**
   * 构造右键菜单配置，只需要 item
   */
  const getMenuConfig = (item: any) => {
    const config = shallowReactive<any>({
      options: [],
      callback: async () => {
      }
    });
    // watchEffect 会监听 item.isTop/item.name 的改变，自动重建 options
    watchEffect(() => {
      const base = [
        // { label: "转发", value: "forward" },
        { label: "复制", value: "copy" },
        { label: "删除", value: "delete" }
      ];
      // 只有是本人消息时才显示撤回
      if (isOwnerOfMessage(item) && isWithinTwoMinutes(item.messageTime)) {
        base.splice(1, 0, { label: "撤回", value: "recall" }); // 插在删除前
      }
      config.options = base;
    });

    config.callback = async (action: any) => {
      try {
        if (action === "copy") {
          try {
            await ClipboardManager.clear();
            // 文本消息
            if (item.messageContentType == MessageContentType.TEXT.code) {
              ClipboardManager.writeText(item.messageBody?.text).then(() => {
                useLogger().prettySuccess("copy text success", item.messageBody?.text);
              });
            }
          } catch (err) {
            console.log(err);
          }
        }
        if (action === "delete") {
          await ElMessageBox.confirm(`确定删除与 ${item.name} 的会话?`, "删除会话", {
            distinguishCancelAndClose: true,
            confirmButtonText: "确认",
            cancelButtonText: "取消"
          });
        }
        if (action === "recall") {
          globalEventBus.emit("message:recall", item);
        }

        // if (action === "forward") {
        //   forwardVisible.value = true;
        // }
      } catch {
        /* cancel */
      }
    };

    return config;
  };

  /**
   * 安全地使用系统浏览器或默认应用打开一个 URL：
   * - 如果 raw 本身已包含协议（格式为 scheme://…），则直接尝试打开
   * - 否则依次为其添加常见协议前缀并尝试：
   *     1. https://
   *     2. http://
   *     3. ftp://
   *     4. ftps://
   * - 第一次成功就返回，所有候选都失败则抛出最后一次错误
   */
  async function openSafeUrl(raw: string): Promise<void> {
    const trimmed = raw.trim();

    // 如果包含“协议://”，直接尝试一次
    const hasScheme = /^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed);
    const candidates = hasScheme ? [trimmed] : ["https://", "http://", "ftp://", "ftps://"].map(p => p + trimmed);

    let lastErr: unknown;
    for (const url of candidates) {
      try {
        await openUrl(url);
        return;
      } catch (err) {
        lastErr = err;
        // 若失败，继续尝试下一个前缀
      }
    }
    throw lastErr;
  }
</script>

<style lang="scss" scoped>
  .message-bubble {
    display: inline-block;
    border-radius: 8px;
    //padding: 8px;
    font-size: 14px;
    color: #333;
    position: relative;
    //width: 80%;
    // max-width: 60%;
    word-wrap: break-word;
    // overflow: hidden;
    background-color: #e1f5fe;
    //color: #333;

    .text {
      padding: 10px;
      border-radius: 8px;
      background-color: #e1f5fe;
      white-space: break-spaces;
    }

    &.owner .text {
      background-color: #dcf8c6; // 自己的消息背景色
    }
  }

  .custom-link {
    text-decoration: none;
    color: #3eaf7c;
    cursor: pointer;
  }
</style>
