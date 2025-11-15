<template>
  <div class="markdown-preview-container">
    <v-md-preview :text="markdownText"></v-md-preview>
    <!-- <v-md-editor v-model="markdownText" height="400px"></v-md-editor> -->
    <!-- <div v-dompurify="renderMarkdown" class="markdown-body preview"></div> -->
  </div>
</template>

<script lang="ts" setup>
  // import { markdownIt, initClipboard } from "./md";
  // import MarkdownIt from "markdown-it";
  //  import "github-markdown-css";

  // 接收外部 Markdown 文件 URL
  const props = defineProps<{ src?: string }>();
  // 定义渲染完成、错误事件
  const emit = defineEmits<{
    (e: "rendered"): void;
    (e: "error", err: unknown): void;
  }>();

  // 实时渲染 HTML
  // 添加渲染函数
  // const renderMarkdown = computed(() => {
  //   if (!markdownText.value) return "";
  //   try {
  //     return markdownIt.render(markdownText.value);
  //   } catch (e) {
  //     console.error("Markdown 渲染错误:", e);
  //     return markdownText.value;
  //   }
  // });

  // 文本内容
  const markdownText = ref<string>("");

  // 监听 src 变更，fetch Markdown
  async function loadFromUrl(url: string) {
    try {
      const res = await fetch(url);
      markdownText.value = await res.text();
    } catch (e) {
      markdownText.value = "";
      emit("error", e);
    }
  }

  // 初始化
  onMounted(() => {
    if (props.src) {
      loadFromUrl(props.src).catch(err => emit("error", err));
    }
  });
</script>

<style lang="scss" scoped>
  /* 滚动条样式 */
  @mixin scroll-bar($width: 5px) {
    &::-webkit-scrollbar-track {
      border-radius: 10px;
      background-color: transparent;
    }

    &::-webkit-scrollbar {
      width: $width;
      height: 10px;
      background-color: transparent;
      transition: opacity 0.3s ease;
    }

    &::-webkit-scrollbar-thumb {
      border-radius: 10px;
      background-color: rgba(0, 0, 0, 0.2);
    }
  }

  .markdown-preview-container {
    display: flex;
    height: 100vh;
    overflow-y: auto;
    @include scroll-bar();
  }

  .preview {
    width: 100%;
    height: 100%;
    padding: 16px;
    background-color: #f1efef;
  }
</style>
