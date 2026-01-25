<template>
  <div class="file-container">
    <!-- 文件自动下载 -->
    <div class="form-row">
      <div :title="$t('pages.settings.file.settings')" class="row-label">{{ $t("pages.settings.file.settings") }}</div>
      <div class="row-control">
        <el-checkbox v-model="autoDownload">
          {{ $t("pages.settings.file.autoDownload") }}
        </el-checkbox>
      </div>
    </div>

    <!-- 保存路径 -->
    <div class="form-row">
      <div :title="$t('pages.settings.file.title')" class="row-label">{{ $t("pages.settings.file.title") }}</div>
      <div class="row-control">
        <el-input v-model="savePath" :title="savePath" readonly resize="none" type="textarea" />
      </div>
    </div>

    <!-- 单独提示行 -->
    <div class="form-row hint-row">
      <div class="row-label">&nbsp;</div>
      <div class="row-control">
        <span class="hint-text">
          {{ $t("pages.settings.file.saveLocation") }}
        </span>
      </div>
    </div>

    <!-- 按钮组 -->
    <div class="form-row">
      <div class="row-label">&nbsp;</div>
      <div class="row-control">
        <el-button type="primary" @click="handleChangePath">
          {{ $t("common.actions.change") }}
        </el-button>
        <el-button @click="handleOpenFolder">
          <el-icon>
            <Folder />
          </el-icon>
          {{ $t("pages.settings.file.openFolder") }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { useFile } from "@/hooks/useFile";
import { useSettingStore } from "@/store/modules/setting";
import ObjectUtils from "@/utils/ObjectUtils";
import { Folder } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { computed } from "vue";

  const { file } = useSettingStore();
  const { openLocalPath, selectFolder } = useFile();

  // 直接映射到 Store 的 file 段
  const autoDownload = computed({
    get: () => file.enable,
    set: v => (file.enable = v)
  });
  //   const readOnly = computed({
  //     get: () => file.readonly,
  //     set: v => (file.readonly = v)
  //   });
  const savePath = computed({
    get: () => file.path,
    set: v => (file.path = v)
  });

  /**
   * 更改默认下载目录
   */
  async function handleChangePath() {
    try {
      const path: any = await selectFolder();
      if (ObjectUtils.isNotEmpty(path)) {
        savePath.value = path;
      }
    } catch (err: any) {
      console.error("选择目录失败：", err);
      ElMessage.error("更改目录失败");
    }
  }

  /**
   * 打开当前默认下载目录
   */
  async function handleOpenFolder() {
    if (!savePath.value) {
      ElMessage.info("请先设置默认保存目录");
      return;
    }
    try {
      // 调用系统打开文件夹（Tauri）
      await openLocalPath(savePath.value);
    } catch (err: any) {
      console.error("打开文件夹失败：", err);
      ElMessage.error("无法打开该目录");
    }
  }
</script>

<style lang="scss" scoped>
  .file-container {
    border-radius: 8px;
    padding: 8px 20px;
    max-width: 400px;
    margin: 20px auto;
  }
  .form-row {
    display: flex;
    justify-content: space-between;
    align-items: center;

    &.footer-row {
      border-bottom: none;
      justify-content: space-between;
      padding-bottom: 8px;
    }
  }
</style>
