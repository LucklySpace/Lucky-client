<template>
  <div class="setting-container">
    <!-- 语言选择行 -->
    <div class="form-row">
      <div :title="$t('settings.general.language')" class="row-label">{{ $t("settings.general.language") }}</div>
      <div class="row-control">
        <el-select v-model="locale" :placeholder="$t('settings.general.select')" @change="onChangeLocale(locale)">
          <el-option v-for="item in languageOptions" :key="item.locale" :label="item.name" :value="item.locale" />
        </el-select>
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
  </div>
</template>

<script lang="ts" setup>
  import { Delete, Folder } from "@element-plus/icons-vue";
  import { ElMessageBox } from "element-plus";
  import { useI18n } from "@/i18n";
  import { useI18n as vueI18n } from "vue-i18n";
  import StorageManageDialog from "./StorageManageDialog.vue";
  // 引入 Hook
  const { locale, languageOptions, setLocale, loadLocaleOptions } = useI18n();
  const { t } = vueI18n();

  // 切换语言时调用 Hook 方法
  async function onChangeLocale(lang: string) {
    await setLocale(lang);
  }

  const storageDialogRef = ref();

  // 清空聊天记录
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

  // 存储空间管理
  const handleStorageManage = () => {
    storageDialogRef.value.showDialog();
  };

  onMounted(() => {
    loadLocaleOptions();
  });
</script>

<style lang="scss" scoped>
  .setting-container {
    background-color: #ffffff;
    border-radius: 8px;
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
    padding: 8px 20px;
    max-width: 400px;
    margin: 20px auto;
    border: 1px solid #ebeef5;
  }

  .form-row {
    display: flex;
    align-items: center;
    padding: 16px 0;
    border-bottom: 1px solid #f2f2f2;

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
    justify-content: space-between;
  }
</style>
