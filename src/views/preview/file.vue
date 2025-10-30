<template>
  <div class="media-previewer-head" data-tauri-drag-region>
    <el-row style="height: 30px">
      <el-col :span="20" data-tauri-drag-region>
        <div class="file-name no-select" data-tauri-drag-region>
          {{ previewName }}
        </div>
      </el-col>
      <el-col :span="4">
        <System about-visible @handleClose="handleClose" />
      </el-col>
    </el-row>
  </div>
  <div class="preview-container">
    <component
      :is="currentComponent"
      v-if="currentComponent"
      :src="previewUrl"
      class="preview-viewer"
      v-bind="componentProps"
      @error="errorHandler"
      @rendered="renderedHandler"
    />
    <div v-else class="preview-placeholder">{{ $t("file.unsupported", { ext }) }}</div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onBeforeUnmount, onMounted, ref } from "vue";
  import System from "@/components/System/index.vue";
  import VueOfficePdf from "@vue-office/pdf";
  import VueOfficeDocx from "@vue-office/docx";
  import VueOfficeExcel from "@vue-office/excel";
  import MarkdownPreviw from "@/components/Markdown/index.vue";
  import { emit, listen } from "@tauri-apps/api/event";
  import { useGlobalShortcut } from "@/hooks/useGlobalShortcut";
  import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
  import "@vue-office/docx/lib/index.css";
  import "@vue-office/excel/lib/index.css";

  const { addShortcut } = useGlobalShortcut();
  //import { StoresEnum } from "@/constants";

  // 预览地址
  const previewUrl = ref("");
  const previewName = ref("");

  // 根据文件后缀自动匹配组件
  const ext = computed(() => {
    const match = previewUrl.value.match(/\.([^.?#]+)(?:[?#]|$)/);
    return match ? match[1].toLowerCase() : "";
  });

  const componentMap: Record<string, any> = {
    pdf: VueOfficePdf,
    docx: VueOfficeDocx,
    doc: VueOfficeDocx,
    xlsx: VueOfficeExcel,
    xls: VueOfficeExcel,
    md: MarkdownPreviw
  };
  const currentComponent = computed(() => componentMap[ext.value]);

  // 生成组件参数，包括 Excel 的滚动样式
  const componentProps = computed(() => {
    const baseStyle = { height: "100%", width: "100%" };
    if (ext.value === "xlsx" || ext.value === "xls") {
      return {
        options: {
          xls: ext.value === "xls",
          minColLength: 0,
          minRowLength: 0,
          widthOffset: 10,
          heightOffset: 10,
          beforeTransformData: (data: any) => data,
          transformData: (data: any) => data
        },
        style: baseStyle,
        class: "excel-scrollable"
      };
    }
    return { style: baseStyle };
  });

  // 渲染完成/错误回调
  const renderedHandler = () => console.log("渲染完成");
  const errorHandler = () => console.log("渲染失败");

  // 监听 Tauri 事件更新 URL
  const init = async () => {
    const unlisten = await listen("preview-file-load", (event: any) => {
      useLogger().prettyInfo("preview load", event.payload);
      previewUrl.value = event.payload.url;
      previewName.value = event.payload.name;
    });

    onBeforeUnmount(() => unlisten());

    // 确认页面创建完成
    emit("preview-file-create", {});

    addShortcut({
      name: "esc",
      combination: "Esc",
      handler: () => {
        if (useWindowFocus()) {
          getCurrentWebviewWindow().hide();
          console.log("关闭预览弹窗");
        }
      }
    });
  };

  const handleClose = () => {};

  onMounted(init);
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

  .preview-container {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: calc(100vh - 30px);
    background-color: #f9f9f9;
    overflow: auto;
    padding: 30px 0px;
    /* 或者 pan-x, pan-left, pan-right，视你的滚动方向而定 */
    /* 允许滚动查看全部内容 */
    @include scroll-bar();
    /* overflow: hidden; */
  }

  /* .preview-viewer {
  flex: 1;
  overflow: auto;
} */

  /* 特定 Excel 内容滚动 */
  .excel-scrollable {
    overflow: auto;
  }

  .preview-placeholder {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    color: #999;
    font-size: 1rem;
  }

  .file-name {
    margin-left: 10px;
    line-height: 30px;
  }
</style>
