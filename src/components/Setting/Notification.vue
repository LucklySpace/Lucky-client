<template>
  <div class="notification-container">
    <el-form label-width="0">
      <!-- 通知声音提示 -->
      <el-form-item class="label-item">
        <span class="notification-label">{{ $t("settings.notification.label") }}</span>
      </el-form-item>

      <!-- 新消息通知声音 -->
      <el-form-item class="switch-item">
        <div class="switch-label">{{ $t("settings.notification.newMsg") }}</div>
        <el-switch v-model="message" />
      </el-form-item>

      <!-- 语音/视频通话通知声音 -->
      <el-form-item class="switch-item">
        <div class="switch-label">{{ $t("settings.notification.call") }}</div>
        <el-switch v-model="media" />
      </el-form-item>
    </el-form>
  </div>
</template>

<script lang="ts" setup>
  import { useSettingStore } from "@/store/modules/setting";

  const { notification } = useSettingStore();

  // 直接映射到 Store 的 notification 段
  const message = computed({
    get: () => notification.message,
    set: v => (notification.message = v)
  });
  const media = computed({
    get: () => notification.media,
    set: v => (notification.media = v)
  });

</script>

<style lang="scss" scoped>
  .notification-container {
    padding: 0 20px;

    .notification-label {
      color: #888;
      font-size: 13px;
      display: inline-block;
      margin-bottom: 8px;
    }

    .label-item {
      margin-left: 0 !important;

      :deep(.el-form-item__content) {
        margin-left: 0 !important;
      }
    }

    .switch-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0;

      .switch-label {
        flex: 1;
        font-size: 14px;
        color: #606266;
      }
    }

    :deep(.el-form-item) {
      margin-bottom: 5px;
    }
  }
</style>
