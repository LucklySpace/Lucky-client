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
      <div :title="$t('settings.general.label')" class="row-label">{{ $t("settings.general.label") }}</div>
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
      <div class="row-label">&nbsp;</div>
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

<style lang="scss" scoped></style>
