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
    background-color: #ffffff;
    border-radius: 8px;
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
    padding: 8px 20px;
    max-width: 400px;
    margin: 20px auto;
    border: 1px solid #ebeef5;

    .notification-label {
      color: #888;
      font-size: 13px;
      display: inline-block;
      margin-bottom: 8px;
    }

    .label-item {
      margin-left: 0 !important;
      border-bottom: 1px solid #f2f2f2;

      :deep(.el-form-item__content) {
        margin-left: 0 !important;
      }
    }

    .switch-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #f2f2f2;

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
