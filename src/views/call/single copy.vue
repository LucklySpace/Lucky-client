<template>
  <div class="video-call-header" data-tauri-drag-region>
    <el-row style="height: 30px">
      <el-col :span="20" data-tauri-drag-region></el-col>
      <el-col :span="4">
        <System about-visible @handleClose="handUp" />
      </el-col>
    </el-row>
  </div>

  <div class="video-call-container no-select" @mouseenter="showControls" @mouseleave="startHideControlsTimer">
    <!-- 主窗口视频画面 -->
    <div class="video-main">
      <video ref="mainVideoRef" autoplay></video>
    </div>

    <!-- 小窗口 -->
    <div class="video-small" @click="handleSwapVideos">
      <!-- 小窗口显示用户头像  -->
      <div v-if="!callEstablished" class="video-background">
        <img :src="callStore.getFriendAvatar" class="background-image lazy-img" />
        <img :src="callStore.getFriendAvatar" class="user-avatar lazy-img" />
        <div class="blur-layer"></div>
      </div>
      <video ref="smallVideoRef" autoplay muted></video>
    </div>

    <!-- 通话时间显示 -->
    <div class="call-timer">{{ formattedTime }}</div>

    <!-- 控制按钮 -->
    <div :class="{ hidden: !controlsVisible }" class="controls">
      <div class="button-group">
        <!-- 麦克风 -->
        <button
          id="microphone"
          :class="{ disabled: !microphoneEnabled }"
          class="control-button"
          @click="toggleMicrophone"
        >
          <i class="iconfont icon-maikefeng"></i>
        </button>
        <!-- 声音 -->
        <button id="speaker" :class="{ disabled: !speakerEnabled }" class="control-button" @click="toggleSpeaker">
          <i class="iconfont icon-yangshengqi"></i>
        </button>
        <!-- 视频 -->
        <button id="camera" :class="{ disabled: !cameraEnabled }" class="control-button" @click="toggleCamera">
          <i class="iconfont icon-shexiangtou_shiti"></i>
        </button>
      </div>
      <div class="hang-up-button">
        <!-- 挂断 -->
        <button id="hang-up" class="control-button hang-up" @click="handUp">
          <i class="iconfont icon-guaduan"></i>
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
  import System from "@/components/System/index.vue";
  import { ConnectionStatus, StoresEnum, WebRTCType } from "@/constants";
  import { emit, listen, UnlistenFn } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import WebRTC from "@/views/call/services/WebRTC";
  import api from "@/api/index";
  import { useCallStore } from "@/store/modules/call";
  import { useUserStore } from "@/store/modules/user";

  const callStore = useCallStore();
  const userStore = useUserStore();

  /** 配置：与页面保持一致 */
  const WebRTCPublishParam = {
    httpPublish: `${import.meta.env.VITE_API_SERVER_SRS}/publish/`,
    httpPlay: `${import.meta.env.VITE_API_SERVER_SRS}/play/`,
    webrtc: `${import.meta.env.VITE_API_SERVER_WEBRTC}`,
    audio: {
      echoCancellationType: "system",
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
      sampleRate: 24000,
      sampleSize: 16,
      channelCount: 2,
      volume: 0.5
    },
    video: {
      frameRate: { min: 30 },
      width: { min: 640, ideal: 1080 },
      height: { min: 360, ideal: 720 },
      aspectRatio: 16 / 9
    }
  };

  /** refs & state */
  const webRTC = ref<WebRTC>(new WebRTC(WebRTCPublishParam));
  const smallVideoRef = ref<HTMLVideoElement | null>(null);
  const mainVideoRef = ref<HTMLVideoElement | null>(null);

  const isMainSmallSwapped = ref(false);
  const callEstablished = ref(false);

  const microphoneEnabled = ref(true);
  const speakerEnabled = ref(true);
  const cameraEnabled = ref(true);

  const controlsVisible = ref(true);
  let hideControlsTimer: number | null = null;
  const hideTime = 3000;

  /** timer */
  const callTime = ref(0);
  let timer: number | null = null;

  /** listener cleanup */
  let unlistenCallLoadeds: UnlistenFn | null = null;
  let unlistenCallLoaded: UnlistenFn | null = null;

  /** 防重入 / 状态锁 */
  let isPublishingLocal = false;
  let isPullingRemote = false;
  let hasStartedTimer = false;

  /** util: 安全调用 video.play() 防止浏览器阻塞 */
  async function safePlayVideo(v?: HTMLVideoElement | null) {
    if (!v) return;
    try {
      // ensure playsinline for mobile / embedded
      v.setAttribute?.("playsinline", "true");
      await v.play();
    } catch (err) {
      // autoplay 可能被阻止，忽略错误
      // console.debug("safePlayVideo error:", err);
    }
  }

  /** util: 开始/停止计时器 */
  function startTimer() {
    if (hasStartedTimer) return;
    stopTimer();
    callTime.value = 0;
    timer = window.setInterval(() => (callTime.value += 1), 1000);
    hasStartedTimer = true;
  }

  function stopTimer() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    hasStartedTimer = false;
  }

  /** 格式化时间 */
  const formattedTime = computed(() => {
    const mins = Math.floor(callTime.value / 60)
      .toString()
      .padStart(2, "0");
    const secs = (callTime.value % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  });

  /** 显示/隐藏控制区 */
  function showControls() {
    controlsVisible.value = true;
    if (hideControlsTimer) {
      clearTimeout(hideControlsTimer);
      hideControlsTimer = null;
    }
  }

  function startHideControlsTimer() {
    if (hideControlsTimer) clearTimeout(hideControlsTimer as number);
    hideControlsTimer = window.setTimeout(() => {
      controlsVisible.value = false;
    }, hideTime);
  }

  /** 交换主/辅画面（只是切换 element.srcObject） */
  function handleSwapVideos() {
    if (!callEstablished.value || !mainVideoRef.value || !smallVideoRef.value) return;
    const mainStream = mainVideoRef.value.srcObject;
    mainVideoRef.value.srcObject = smallVideoRef.value.srcObject;
    smallVideoRef.value.srcObject = mainStream;
    isMainSmallSwapped.value = !isMainSmallSwapped.value;
  }

  /** 发送消息封装（保证 await） */
  async function sendCallMessage(payload: any) {
    try {
      await api.SendCallMessage(payload);
    } catch (err) {
      console.error("sendCallMessage error:", err);
    }
  }

  /** 发起（A -> B） */
  async function call() {
    const payload = {
      fromId: userStore.userId,
      toId: callStore.friendInfo.id,
      url: WebRTCPublishParam.httpPublish,
      type: WebRTCType.RTC_CALL.code
    };
    await sendCallMessage(payload);
  }

  /** 接受（B -> A） */
  async function accept() {
    const payload = {
      fromId: userStore.userId,
      toId: callStore.friendInfo.id,
      url: WebRTCPublishParam.httpPublish,
      type: WebRTCType.RTC_ACCEPT.code
    };
    await sendCallMessage(payload);
  }

  /** 拒绝 / 失败 / 挂断 等 */
  async function replyReject() {
    const payload = {
      fromId: userStore.userId,
      toId: callStore.friendInfo.id,
      type: WebRTCType.RTC_REJECT.code
    };
    await sendCallMessage(payload);
  }

  async function replyFailed() {
    const payload = {
      fromId: userStore.userId,
      toId: callStore.friendInfo.id,
      type: WebRTCType.RTC_FAILED.code
    };
    await sendCallMessage(payload);
  }

  async function replyCancelOrHangUp(isHangup = false) { 
    const type = isHangup ? WebRTCType.RTC_HANDUP.code : WebRTCType.RTC_CANCEL.code;
    const payload = {
      fromId: userStore.userId,
      toId: callStore.friendInfo.id,
      type
    };
    await sendCallMessage(payload);
  }

  /** 关闭本地资源并退出窗口 */
  async function closeCallWindow() {
    callStore.state = ConnectionStatus.CANCELLED.code;
    try {
      webRTC.value?.close();
    } catch (err) {
      console.warn("webRTC.close error", err);
    }
    stopTimer();
    try {
      const w = await getCurrentWindow();
      await w.close();
    } catch (err) {
      console.warn("getCurrentWindow.close error", err);
    }
  }

  /** 挂断按钮 */
  async function handUp() {
    try {
      if (callStore.state === ConnectionStatus.CONNECTED.code) {
        await replyCancelOrHangUp(true); // HANDUP
      } else if (callStore.state === ConnectionStatus.CONNECTING.code) {
        await replyCancelOrHangUp(false); // CANCEL
      }
    } finally {
      await closeCallWindow();
    }
  }

  /** 拒绝按钮 */
  async function rejectCall() {
    await replyReject();
    await closeCallWindow();
  }

  /** 失败处理 */
  async function failed() {
    await replyFailed();
    await closeCallWindow();
  }

  /** 处理收到的 call-loaded 事件 payload */
  async function handleMessage(videoMessage: any) {
    if (!videoMessage || typeof videoMessage.type !== "number") return;
    switch (videoMessage.type) {
      case WebRTCType.RTC_CALL.code: {
        // B 收到 A 的通话请求
        callStore.friendInfo.id = videoMessage.data.fromId ?? callStore.friendInfo.id;

        // B 推送本地流（小窗口）
        if (!isPublishingLocal && smallVideoRef.value) {
          try {
            isPublishingLocal = true;
            await webRTC.value.publish(userStore.userId, smallVideoRef.value);
            await safePlayVideo(smallVideoRef.value);
          } catch (err) {
            console.error("publish local (B) failed:", err);
            isPublishingLocal = false;
          }
        }

        // B 同意
        await accept();

        // B 拉取 A 的流（主窗口）
        if (!isPullingRemote && mainVideoRef.value) {
          try {
            isPullingRemote = true;
            callStore.state = ConnectionStatus.CONNECTED.code;
            await webRTC.value.pull(callStore.friendInfo.id, mainVideoRef.value);
            await safePlayVideo(mainVideoRef.value);
          } catch (err) {
            console.error("pull remote (B) failed:", err);
            isPullingRemote = false;
          }
        }

        callEstablished.value = true;
        startTimer();
        break;
      }

      case WebRTCType.RTC_ACCEPT.code: {
        // A 收到 B 的接受，开始拉取 B 的流
        callStore.friendInfo.id = videoMessage.data.fromId ?? callStore.friendInfo.id;

        if (!isPullingRemote && mainVideoRef.value && smallVideoRef.value) {
          try {
            isPullingRemote = true;
            callStore.state = ConnectionStatus.CONNECTED.code;

            // 将 A 的本地流从主窗口移动到小窗口（保持推流）
            try {
              const mainStream = mainVideoRef.value.srcObject;
              smallVideoRef.value.srcObject = mainStream ?? null;
              // 保持 mainVideoRef 用于显示远端
              mainVideoRef.value.srcObject = null;
            } catch (e) {
              console.warn("swap local stream to small failed", e);
            }

            await webRTC.value.pull(callStore.friendInfo.id, mainVideoRef.value);
            await safePlayVideo(mainVideoRef.value);
          } catch (err) {
            console.error("pull remote (A) failed:", err);
            isPullingRemote = false;
          }
        }

        callEstablished.value = true;
        startTimer();
        break;
      }

      case WebRTCType.RTC_REJECT.code: {
        callStore.state = ConnectionStatus.CONNECTION_REFUSED.code;
        await rejectCall();
        break;
      }

      case WebRTCType.RTC_FAILED.code: {
        callStore.state = ConnectionStatus.ERROR.code;
        await failed();
        break;
      }

      case WebRTCType.RTC_CANCEL.code: {
        callStore.state = ConnectionStatus.CANCELLED.code;
        await closeCallWindow();
        break;
      }

      case WebRTCType.RTC_HANDUP.code: {
        callStore.state = ConnectionStatus.CONNECTION_LOST.code;
        await closeCallWindow();
        break;
      }

      default:
        // ignore others like RTC_CANDIDATE handled by lower layer
        break;
    }
  }

  /** 控制摄像头 听筒 麦克风  */
  function toggleCamera() {
    cameraEnabled.value = !cameraEnabled.value;
    try {
      webRTC.value.toggleCamera(cameraEnabled.value);
    } catch (err) {
      console.warn("toggleCamera error", err);
    }
  }

  function toggleMicrophone() {
    microphoneEnabled.value = !microphoneEnabled.value;
    try {
      webRTC.value.toggleMicrophone(microphoneEnabled.value);
    } catch (err) {
      console.warn("toggleMicrophone error", err);
    }
  }

  function toggleSpeaker() {
    speakerEnabled.value = !speakerEnabled.value;
    try {
      webRTC.value.toggleSpeaker(speakerEnabled.value, callStore.friendInfo.id);
    } catch (err) {
      console.warn("toggleSpeaker error", err);
    }
  }

  /** init: 注册监听并发送 call-ready */
  onMounted(async () => {
    // 注册两个监听（call-loadeds 由主窗口发起用来触发推流并发送 call 请求）
    try {
      unlistenCallLoadeds = await listen("call-loadeds", async e => {
        // 进入连接流程（A 发起）
        callStore.state = ConnectionStatus.CONNECTING.code;

        // 发布本地流到主视频（如果主容器存在）
        if (!isPublishingLocal && mainVideoRef.value) {
          try {
            isPublishingLocal = true;
            await webRTC.value.publish(userStore.userId, mainVideoRef.value);
            await safePlayVideo(mainVideoRef.value);
          } catch (err) {
            console.error("publish local (A) failed:", err);
            isPublishingLocal = false;
          }
        }

        // 向对端发送通话请求
        await call();
      });

      unlistenCallLoaded = await listen("call-loaded", async e => {
        // 处理接收消息
        await handleMessage(e.payload);
      });

      // 标记窗口已准备好（主窗口会等待这个事件）
      // 使用 nextTick 确保 DOM 元素已挂载
      await nextTick();

      emit("call-ready", { label: StoresEnum.CALL });
    } catch (err) {
      console.error("onMounted listen error:", err);
    }
  });

  /** 清理监听与资源 */
  onBeforeUnmount(async () => {
    try {
      if (unlistenCallLoadeds) {
        await unlistenCallLoadeds();
        unlistenCallLoadeds = null;
      }
      if (unlistenCallLoaded) {
        await unlistenCallLoaded();
        unlistenCallLoaded = null;
      }
    } catch (err) {
      console.warn("unlisten error:", err);
    }

    // 停止计时器并关闭 webRTC
    stopTimer();
    try {
      webRTC.value?.close();
    } catch (err) {
      /* noop */
    }
  });
</script>

<style lang="scss" scoped>
  @mixin button-styles {
    appearance: none;
    outline: none;
    border: none;
    background-color: #4caf50; // 默认按钮背景色
    color: white;
    font-size: 16px;
    border-radius: 50%;
    width: 50px;
    height: 50px;
    margin: 0 25px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;

    &.disabled {
      background-color: #ccc; // 禁用状态背景色
    }
  }

  .video-call-header {
    background-color: #f2f2f2;
  }

  .video-call-container {
    width: 100%;
    height: 100%;
    position: relative;
    background-color: #f2f2f2;

    .video-main {
      width: 100%;
      height: 100%;
      overflow: hidden;

      video {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }

    .call-timer {
      position: absolute;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      color: #fff;
      font-size: 15px;
    }

    .control-button {
      @include button-styles; // 引用按钮样式
    }

    .video-background {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;

      .background-image {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        filter: blur(5px); // 添加模糊效果
      }

      .blur-layer {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(170, 158, 158, 0.384);
      }

      .user-avatar {
        width: 60px;
        height: 60px;
        border-radius: 5px;
        border: 2px solid #fff;
        z-index: 1; // 确保头像在最上面
      }
    }

    .video-small {
      position: absolute;
      top: 10px;
      right: 10px;
      width: 240px;
      height: 160px;
      background-color: #fff;
      border: 2px solid #ccc;
      overflow: hidden;
      cursor: pointer;

      video {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }

    .controls {
      position: absolute;
      bottom: 45px;
      left: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      opacity: 1;
      transform: translateX(-50%);
      transition: opacity 1s ease, transform 1s ease;

      &.hidden {
        opacity: 0;
        pointer-events: none; // 隐藏后禁用点击事件
      }
    }

    .button-group {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      margin-bottom: 5px;

      i {
        font-size: 25px;
      }
    }

    .hang-up-button {
      margin-top: 10px;

      button {
        background-color: #e05b5b; // 红色背景
        border: none; // 移除边框
        color: white; // 文字颜色
        cursor: pointer; // 鼠标悬停手型
        border-radius: 50%; // 圆形按钮
        width: 50px; // 按钮宽度
        height: 50px; // 按钮高度
      }

      i {
        font-size: 10px; // 按钮图标大小
      }
    }
  }
</style>
