<template>
  <el-dialog
    v-model="dialogVisible"
    :close-on-click-modal="false"
    style="height: 480px"
    title="存储空间"
    width="500px"
    @close="handleClose"
  >
    <div class="storage-container no-select">
      <!-- 存储空间概览 -->
      <div class="storage-overview">
        <div class="storage-title">{{ $t("settings.general.storage.used") }}</div>
        <div class="storage-size">{{ formatBytes(info.used) }}</div>
        <div class="storage-desc">
          {{ $t("settings.general.storage.desc", { percent: info.usedPercent.toFixed(1) }) }}
        </div>

        <!-- 存储空间进度条 -->
        <div class="storage-progress">
          <div class="progress-bar">
            <div :style="`width: ${info.usedPercent.toFixed(1)}%`" class="used-space"></div>
            <div class="free-space"></div>
          </div>
          <div class="progress-legend">
            <div class="legend-item">
              <span class="legend-color used"></span>
              <span>{{ $t("settings.general.storage.diskUsed") }}</span>
            </div>
            <div class="legend-item">
              <span class="legend-color free"></span>
              <span>{{ $t("settings.general.storage.diskFree") }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 存储明细 -->
      <div class="storage-details">
        <div class="details-title">{{ $t("settings.general.storage.details") }}</div>

        <!-- 聊天数据 -->
        <div class="detail-item">
          <div class="item-header">
            <div class="item-info">
              <div class="item-title">{{ $t("settings.general.storage.chat") }}</div>
              <div class="item-size">{{ info.details.data.formatted }}</div>
            </div>
            <el-button size="small" type="primary" @click="handleManageChat"
            >{{ $t("settings.general.storage.manage") }}
            </el-button>
          </div>
          <div class="item-desc">{{ $t("settings.general.storage.chatDataDesc") }}</div>
        </div>

        <!-- 缓存 -->
        <div class="detail-item">
          <div class="item-header">
            <div class="item-info">
              <div class="item-title">{{ $t("settings.general.storage.diskFree") }}</div>
              <div class="item-size">{{ info.details.cache.formatted }}</div>
            </div>
            <el-button size="small" @click="handleClearCache"> {{ $t("settings.general.storage.clean") }}</el-button>
          </div>
          <div class="item-desc">{{ $t("settings.general.storage.cacheDesc") }}</div>
        </div>

        <!-- 其他 -->
        <div class="detail-item">
          <div class="item-header">
            <div class="item-info">
              <div class="item-title">{{ $t("settings.general.storage.other") }}</div>
              <div class="item-size">{{ info.details.other.formatted }}</div>
            </div>
          </div>
          <div class="item-desc">{{ $t("settings.general.storage.otherDesc") }}</div>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { useStorageSpace } from "@/hooks/useStorageSpace";
  import { ElMessage } from "element-plus";

  const { info, refresh, formatBytes } = useStorageSpace();

  const dialogVisible = ref(false);

  const handleClose = () => {
    dialogVisible.value = false;
  };

  const handleManageChat = () => {
    ElMessage.info("管理聊天数据");
  };

  const handleClearCache = () => {
    ElMessage.success("清理缓存成功");
  };

  // 打开对话框的方法
  const showDialog = () => {
    dialogVisible.value = true;
  };

  // 暴露方法给父组件
  defineExpose({
    showDialog
  });
</script>

<style lang="scss" scoped>
  ::v-deep(.el-dialog__body) {
    flex: 1;
    overflow-y: hidden !important;
    padding: 20px 0;
  }

  .storage-container {
    padding: 0px;
    padding-left: 20px;
    padding-right: 20px;
    

    .storage-overview {
      margin-bottom: 30px;

      .storage-title {
        font-size: 14px;
        color: #606266;
        margin-bottom: 10px;
      }

      .storage-size {
        font-size: 24px;
        color: #303133;
        margin-bottom: 5px;
      }

      .storage-desc {
        font-size: 12px;
        color: #909399;
        margin-bottom: 15px;
      }

      .storage-progress {
        .progress-bar {
          height: 20px;
          background-color: #f5f7fa;
          border-radius: 10px;
          overflow: hidden;
          display: flex;

          .used-space {
            background-color: #409eff;
            height: 100%;
          }

          .free-space {
            flex: 1;
            background-color: #e4e7ed;
          }
        }

        .progress-legend {
          display: flex;
          margin-top: 10px;
          font-size: 12px;
          color: #909399;

          .legend-item {
            display: flex;
            align-items: center;
            margin-right: 20px;

            .legend-color {
              width: 12px;
              height: 12px;
              margin-right: 5px;
              border-radius: 2px;

              &.used {
                background-color: #409eff;
              }

              &.free {
                background-color: #e4e7ed;
              }
            }
          }
        }
      }
    }

    .storage-details {
      .details-title {
        font-size: 14px;
        color: #606266;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 1px solid #ebeef5;
      }

      .detail-item {
        margin-bottom: 20px;

        .item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 5px;

          .item-info {
            display: flex;
            align-items: center;
            gap: 10px;

            .item-title {
              font-size: 14px;
              color: #303133;
            }

            .item-size {
              font-size: 14px;
              color: #606266;
            }
          }
        }

        .item-desc {
          font-size: 12px;
          color: #909399;
          line-height: 1.4;
        }
      }
    }
  }
</style>
