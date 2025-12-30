<template>
  <div class="call-request-window no-select" data-tauri-drag-region>
    <!-- 上行：用户信息 -->
    <div class="user-info">
      <!-- 用户头像 -->
      <div class="user-avatar-container">
        <Avatar :avatar="callStore.friendInfo.avatar || ' '" :name="callStore.friendInfo.name" :width="50"
          :borderRadius="4" />
      </div>
      <!-- 用户名和邀请信息 -->
      <div class="text-info">
        <div class="username">
          {{ callStore.friendInfo.name }}
        </div>
        <div class="invitation">邀请您进行视频通话</div>
      </div>
    </div>
    <!-- 下行：按钮组 -->
    <div class="button-group">
      <!-- 放大按钮 -->

      <!-- <button class="button enlarge-button" style="display: none;">
                <i class="iconfont icon-fangda"></i>
            </button> -->

      <!-- 同意和拒绝按钮 -->
      <div class="action-buttons">
        <!-- 同意按钮 -->
        <button class="button agree-button" title="同意" @click="handleAccept">
          <i class="iconfont icon-shipintonghua"></i>
        </button>
        <!-- 拒绝按钮 -->
        <button class="button reject-button" title="拒绝" @click="handleReject">
          <i class="iconfont icon-guaduan"></i>
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { useCallStore } from "@/store/modules/call";
import { AudioEnum, useAudioPlayer } from "@/hooks/useAudioPlayer";
import { useSettingStore } from "@/store/modules/setting";
import Avatar from "@/components/Avatar/index.vue";
// 声音
const { playLoop, stopLoop } = useAudioPlayer();

// 视频通话store
const callStore = useCallStore();
const settingStore = useSettingStore();

onMounted(() => {
  init();
});

/**
 * 页面初始化播放提示音
 */
const init = () => {
  if (settingStore.notification.media) {
    // 播放提示音
    playLoop(AudioEnum.CALL_ALERT);
  }
};

/**
 * 同意通话请求
 */
const handleAccept = async () => {
  // 停止提示音
  stopLoop(AudioEnum.CALL_ALERT);
  // 处理同意按钮点击事件
  callStore.handleShowCallWindow();
};

/**
 * 拒绝通话并关闭通话请求窗口
 */
const handleReject = async () => {
  // 停止提示音
  stopLoop(AudioEnum.CALL_ALERT);
  // 关闭通话请求窗口
  callStore.handleCloseCallWindow();
  // 处理拒绝按钮点击事件
  console.log("Reject button clicked");
};
</script>

<style scoped>
.call-request-window {
  display: flex;
  flex-direction: column;
  /* align-items: center; */
  justify-content: center;
  width: 250px;
  height: 80px;
  background-color: #555;
  border-radius: 3px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  padding: 20px;
}

.user-info {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin-bottom: 10px;
}

.user-avatar-container {
  border: #fff 1px solid;
  margin-right: 10px;
  width: 50px;
  height: 50px;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
}

.user-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.text-info {
  display: flex;
  flex-direction: column;
}

.username {
  font-size: 15px;
  margin-bottom: 5px;
  color: #fff;
  font-weight: bolder;
}

.invitation {
  font-size: 12px;
  color: #ddd;
}

.button-group {
  display: flex;
  justify-content: space-around;
  width: 100%;
  margin-bottom: 3px;
}

.action-buttons {
  display: flex;
}

.button {
  width: 35px;
  height: 35px;
  border: none;
  border-radius: 50%;
  background-color: #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  outline: none;
  color: white;
}

.button:hover {
  background-color: #e0e0e0;
}

.enlarge-button {
  width: 28px;
  height: 28px;
  margin-top: 6px;
  background-color: #999;
  /* 不伸缩 */
  margin-right: auto;
  /* 向右对齐 */
}

.agree-button {
  background-color: #0c9b3c;
  margin-right: 18px;
}

.reject-button {
  background-color: #e95440;
}

.icon-fangda {
  font-size: 15px;
}

.icon-guaduan {
  font-size: 8px;
}

.icon-shipintonghua {
  font-size: 11px;
}
</style>
