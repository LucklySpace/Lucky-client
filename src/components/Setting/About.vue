<template>
  <div class="setting-container">
    <!-- 版本号 -->
    <div class="form-row">
      <div :title="$t('settings.about.version')" class="row-label">
        {{ $t("settings.about.version") }}
      </div>
      <div class="row-control">{{ version }}</div>
    </div>

    <!-- 检查更新按钮 -->
    <div class="form-row">
      <div class="row-label">&nbsp;</div>
      <div class="row-control">
        <el-button type="primary" @click="handleCheckUpdate">
          {{ $t("settings.about.update") }}
        </el-button>
      </div>
    </div>

    <!-- 查看帮助按钮 -->
    <div class="form-row">
      <div :title="$t('settings.about.help')" class="row-label">
        {{ $t("settings.about.help") }}
      </div>
      <div class="row-control">
        <el-button @click="handleViewHelp">
          {{ $t("settings.about.viewHelp") }}
        </el-button>
      </div>
    </div>

    <!-- 更新信息弹窗 -->
    <el-dialog
      :model-value="showUpdateDialog"
      :title="$t('settings.about.updateInfo')"
      width="450px"
      @close="showUpdateDialog = false"
    >
      <div v-if="updateInfo">
        <p>
          <strong>{{ $t("settings.about.newVersion") }}:</strong> {{ updateInfo.version }}
        </p>
        <p>
          <strong>{{ $t("settings.about.date") }}:</strong> {{ formatDate(new Date(updateInfo.date), "yyyy-MM-dd") }}
        </p>
        <p>
          <strong>{{ $t("settings.about.body") }}:</strong>
        </p>
        <p class="update-notes">{{ updateInfo.body }}</p>
      </div>
      <span slot="footer" class="dialog-footer">
        <el-button @click="showUpdateDialog = false">
          {{ $t("actions.cancel") }}
        </el-button>
        <el-button type="primary" @click="handleDownloadUpdate">
          {{ $t("settings.about.download") }}
        </el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
  import { ref } from "vue";
  import { ElMessage } from "element-plus";
  import { useUpdate } from "@/hooks/useUpdate";
  import { formatDate } from "@/utils/Date";
  import { getVersion } from "@tauri-apps/api/app";

  const appVersion = await getVersion();

  // 当前应用版本
  const version = ref(appVersion);
  // 从 hook 中获取检查、下载和更新信息
  const { checkForUpdates, downloadAndInstall, updateInfo } = useUpdate();

  // 控制弹窗显示
  const showUpdateDialog = ref(false);

  /**
   * 处理检查更新按钮点击
   */
  const handleCheckUpdate = async () => {
    ElMessage.info("检查更新中");
    const hasUpdate = await checkForUpdates();
    if (hasUpdate && updateInfo.value) {
      // 有可用更新，打开弹窗
      showUpdateDialog.value = true;
    } else {
      ElMessage.success("没有更新");
    }
  };

  /**
   * 处理下载更新并重启
   */
  const handleDownloadUpdate = async () => {
    if (!updateInfo.value) return;
    ElMessage.info("下载更新中");
    await downloadAndInstall(true);
  };

  /**
   * 查看帮助
   */
  const handleViewHelp = () => {
    window.open("https://help.wechat.com", "_blank");
  };
</script>

<style lang="scss" scoped>
  .setting-container {
    border-radius: 8px;
    padding: 8px 20px;
    max-width: 400px;
    margin: 20px auto;
  }
  .form-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 0;

    &.footer-row {
      border-bottom: none;
      justify-content: space-between;
      padding-bottom: 8px;
    }
  }
  .update-notes {
    white-space: pre-wrap;
    line-height: 1.6;
  }
</style>
