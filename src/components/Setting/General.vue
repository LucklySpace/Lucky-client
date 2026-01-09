<template>
  <div class="setting-container">
    <!-- 语言选择行 -->
    <div class="form-row">
      <div :title="$t('settings.general.language.label')" class="row-label">{{ $t("settings.general.language.label") }}</div>
      <div class="row-control">
        <el-select 
          v-model="locale" 
          :placeholder="$t('settings.general.select')" 
          @change="onChangeLocale(locale)"
        >
          <el-option 
            v-for="item in languageOptions" 
            :key="item.locale" 
            :label="item.name" 
            :value="item.locale" 
          />
        </el-select>
        <el-button 
          type="primary" 
          :icon="Download" 
          circle 
          @click="handleOpenLanguageDownload"
          :title="$t('settings.general.language.downloadMore')"
        />
      </div>
    </div>

    <!-- 清空聊天记录行 -->
    <div class="form-row">
      <div :title="$t('settings.general.ChatLog')" class="row-label">{{ $t("settings.general.ChatLog") }}</div>
      <div class="row-control">
        <el-button type="danger" @click="handleClearChat">
          <el-icon>
            <delete />
          </el-icon>
          {{ $t("settings.general.clearChat") }}
        </el-button>
      </div>
    </div>

    <!-- 存储管理行 -->
    <div class="form-row">
      <!-- 如果这一行 label 需要留空，也可直接用 &nbsp; 占位 -->
      <div class="row-label">{{ $t("settings.general.storage.details") }}</div>
      <div class="row-control">
        <el-button type="primary" @click="handleStorageManage">
          <el-icon>
            <folder />
          </el-icon>
          {{ $t("settings.general.storage.label") }}
        </el-button>
      </div>
    </div>

    <StorageManageDialog ref="storageDialogRef" />
    <LanguageDownload ref="languageDownloadRef" />
  </div>
</template>

<script lang="ts" setup>
  import { ref, onMounted } from "vue";
  import { Delete, Folder, Download } from "@element-plus/icons-vue";
  import { ElMessageBox } from "element-plus";
  import { useI18n } from "@/i18n";
  import { useI18n as vueI18n } from "vue-i18n";
  import StorageManageDialog from "./StorageManageDialog.vue";
  import LanguageDownload from "./LanguageDownload.vue";

  // 引入 Hook
  const { locale, languageOptions, setLocale, loadLocaleOptions } = useI18n();
  const { t } = vueI18n();

  const storageDialogRef = ref();
  const languageDownloadRef = ref();

  /**
   * 切换语言
   */
  async function onChangeLocale(lang: string) {
    await setLocale(lang);
  }

  /**
   * 打开语言下载对话框
   */
  function handleOpenLanguageDownload() {
    languageDownloadRef.value?.showDialog();
  }

  /**
   * 清空聊天记录
   */
  const handleClearChat = () => {
    ElMessageBox.confirm(t("dialog.confirmClearChat"), t("dialog.warning"), {
      confirmButtonText: t("dialog.confirm"),
      cancelButtonText: t("dialog.cancel"),
      type: "warning"
    })
      .then(() => {
        // 这里添加清空聊天记录的逻辑
        console.log(t("dialog.clearChatLog"));
      })
      .catch(() => {
        // 取消操作
      });
  };

  /**
   * 存储空间管理
   */
  const handleStorageManage = () => {
    storageDialogRef.value?.showDialog();
  };

  onMounted(() => {
    loadLocaleOptions();
  });
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
    align-items: center;
    padding: 10px 0;
    justify-content: space-between;

    &.footer-row {
      border-bottom: none;
      padding-bottom: 8px;
    }
  }
  .row-label {
    font-size: 14px;
    color: #333333;
    font-weight: 500;
  }

  .row-control {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    flex-grow: 1;
  }

  .row-control ::v-deep(.el-select) {
    width: 200px;
  }

  .row-control .el-button.is-circle {
    width: 32px;
    height: 32px;
    padding: 0;
  }
</style>
