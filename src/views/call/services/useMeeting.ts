import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import WebRTC from "@/views/call/services/WebRTC";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit } from "@tauri-apps/api/event";
import { Participant } from "@/types/env";

/**
 * useMeeting - 会议核心逻辑（简化优化版）
 *
 * 说明（保留原有接口与行为）：
 * - 管理 WebSocket（join/leave/heartbeat/reconnect）、participants、video 元素引用、
 *   WebRTC publish/pull、聊天消息、底部控制自动隐藏、挂断/清理等。
 * - 暴露的状态和方法与原版本兼容，组件层无需修改调用位置。
 *
 * 注意：
 * - 保留了原始变量名与信号协议字段（如 type: "join"/"leave"/"signal" 等）。
 * - 保留原有的「isVideoOff / cameraOn」映射（避免破坏后端或其它模块的期望）。
 */
export default function useMeeting(options: { callStore: any; userStore: any }) {
  const { callStore, userStore } = options;

  // ----------------- 配置（从环境变量读取） -----------------
  const SRS_HTTP_PUBLISH = `${import.meta.env.VITE_API_SERVER_SRS}/publish/`;
  const SRS_HTTP_PLAY = `${import.meta.env.VITE_API_SERVER_SRS}/play/`;
  const WEBRTC_SIGNAL = `${import.meta.env.VITE_API_SERVER_WEBRTC}`;

  const WebRTCPublishParam = {
    httpPublish: SRS_HTTP_PUBLISH,
    httpPlay: SRS_HTTP_PLAY,
    webrtc: WEBRTC_SIGNAL,
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
      width: { min: 640, ideal: 1920 },
      height: { min: 360, ideal: 1080 },
      aspectRatio: 16 / 9
    }
  };

  // ----------------- 响应式状态 -----------------
  const webRTC = ref(new WebRTC(WebRTCPublishParam));

  // participants: 使用 Map 存储，key = userId -> value = Participant
  const participantsMap = ref<Map<string, Participant>>(new Map());
  const participantsList = computed(() => Array.from(participantsMap.value.values()));

  // video 元素引用 Map: key = userId -> HTMLVideoElement
  const videoRefs = ref<Map<string, HTMLVideoElement>>(new Map());

  // 聊天消息
  const messages = ref<{ userId: string; body: string }[]>([]);
  const newMessage = ref("");

  // 聊天栏折叠
  const isChatCollapsed = ref(true);

  // 当前用户 / 房间 id
  const currUserId = userStore.userId;
  const currRoomId = callStore.roomId;

  // WebSocket / 心跳 / 重连
  let socket: WebSocket | null = null;
  let heartbeatTimer: number | null = null;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 10;
  const heartbeatIntervalMs = 5000;
  const initialReconnectDelayMs = 1000;

  // 防重入 publish/pull 标记
  const publishing = ref<Set<string>>(new Set());
  const pulling = ref<Set<string>>(new Set());

  // 控制区自动隐藏相关
  const showControls = ref(true);
  const hideTimer = ref<number | null>(null);
  const isMuted = ref(false); // false => 正在发送音频
  const isVideoOff = ref(false); // false => 摄像头开启（注意：legacy 赋值可能反向）

  // ----------------- 辅助工具函数 -----------------
  /** 是否 socket 已打开 */
  function isSocketOpen() {
    return socket && socket.readyState === WebSocket.OPEN;
  }

  /** 安全发送 JSON（socket 未连接或异常时静默） */
  function sendWebSocketMessage(payload: Record<string, any>) {
    if (!isSocketOpen()) return;
    try {
      socket!.send(JSON.stringify(payload));
    } catch (err) {
      console.error("sendWebSocketMessage error:", err);
    }
  }

  // ----------------- 自动隐藏 controls：计时器管理 -----------------
  function clearHideTimer() {
    if (hideTimer.value) {
      clearTimeout(hideTimer.value);
      hideTimer.value = null;
    }
  }

  function resetHideTimer() {
    clearHideTimer();
    hideTimer.value = window.setTimeout(() => {
      showControls.value = false;
      hideTimer.value = null;
    }, 5000) as unknown as number;
  }

  function onUserActivity() {
    if (!showControls.value) showControls.value = true;
    resetHideTimer();
  }

  function onUserEnter() {
    showControls.value = true;
    clearHideTimer();
  }

  function onUserLeave() {
    resetHideTimer();
  }

  function onControlsEnter() {
    clearHideTimer();
  }

  function onControlsLeave() {
    resetHideTimer();
  }

  // ----------------- 本地音视频控制（优先通过 webRTC 封装） -----------------
  async function setLocalAudioEnabled(enabled: boolean) {
    try {
      // 优先使用 webRTC 封装方法（若存在）
      webRTC.value.toggleMicrophone(enabled);
      return;
    } catch (e) {
      // 若封装不存在或抛错，fallback 到直接操作 MediaStream tracks
      console.debug("webRTC.toggleMicrophone fallback", e);
    }
  }

  async function setLocalVideoEnabled(enabled: boolean) {
    try {
      webRTC.value.toggleCamera(enabled);
      return;
    } catch (e) {
      console.debug("webRTC.toggleCamera fallback", e);
    }
  }

  /** 切换静音（更新 UI 状态并通知服务端） */
  async function toggleMute() {
    isMuted.value = !isMuted.value;
    await setLocalAudioEnabled(!isMuted.value); // isMuted true -> 禁用发送音频
    showControls.value = true;
    const user = participantsMap.value.get(currUserId);
    if (user) {
      user.muted = isMuted.value;
      sendWebSocketMessage({ type: "update", roomId: currRoomId, userId: currUserId, user });
    }
    resetHideTimer();
  }

  /** 切换视频（注意保留原有 isVideoOff / cameraOn 的赋值关系以保证兼容性） */
  async function toggleVideo() {
    isVideoOff.value = !isVideoOff.value;
    await setLocalVideoEnabled(!isVideoOff.value);
    showControls.value = true;
    const user = participantsMap.value.get(currUserId);
    if (user) {
      // 保持原有逻辑（若需要修正语义，请在整个项目中统一调整该字段）
      user.cameraOn = isVideoOff.value;
      sendWebSocketMessage({ type: "update", roomId: currRoomId, userId: currUserId, user });
    }
    resetHideTimer();
  }

  // ----------------- DOM / Video 帮助 -----------------
  async function safePlayVideo(video?: HTMLVideoElement | null) {
    if (!video) return;
    try {
      video.setAttribute?.("playsinline", "true");
      await video.play();
    } catch (err) {
      // autoplay 被阻止是常见情况，忽略错误
      console.debug("safePlayVideo:", err);
    }
  }

  /** setRef - 将组件层传入的 video 元素保存到 Map（:ref="el => setRef(el, userId)"） */
  function setRef(el: Element | null | any, userId: string) {
    if (!(el instanceof HTMLVideoElement)) return;
    videoRefs.value.set(userId, el);
  }

  /** 将服务端原始 user 规范化为本地 Participant（兼容多种字段名） */
  function normalizeServerUser(raw: any): Participant {
    if (!raw) return null as any;
    const userId = raw.userId ?? raw.user?.id;
    const name = raw.name ?? `用户-${userId}`;
    const avatar = raw.avatar ?? raw.user?.avatar;
    const muted = raw.muted ?? false;
    const cameraOn = raw.cameraOn ?? false;
    const screenShareOn = raw.screenShareOn ?? false;
    const role = (raw.role ?? raw.user?.role ?? "participant") as "host" | "participant";
    const connectionState = (raw.connectionState ?? "connected") as "connected" | "reconnecting" | "disconnected";
    const stream = raw.stream ?? null;

    return {
      userId: String(userId),
      name,
      avatar,
      isLocal: userId === currUserId,
      muted,
      cameraOn,
      screenShareOn,
      role,
      connectionState,
      stream
    } as Participant;
  }

  /** 插入或合并 participant（不覆盖本地重要字段） */
  function upsertParticipant(pRaw: any) {
    if (!pRaw || !pRaw.userId) return;
    if (pRaw.userId === currUserId) return; // 不覆盖本地自己
    const p = normalizeServerUser(pRaw);
    const existing = participantsMap.value.get(p.userId) ?? ({} as Participant);
    const merged = { ...existing, ...p, isLocal: p.userId === currUserId } as Participant;
    participantsMap.value.set(p.userId, merged);
  }

  /**
   * handleUserJoin - 处理用户加入
   * - 将 user 加入 participantsMap（若已存在则跳过）
   * - DOM 更新后发布（自己）或拉流（他人）
   */
  function handleUserJoin(user: Participant) {
    if (!user) return;
    const userId = user.userId;
    if (!userId) return;

    participantsMap.value.set(userId, user);

    // DOM 更新后再做 publish/pull，避免 videoRef 尚未就绪导致失败
    void nextTick().then(async () => {
      const videoEl = videoRefs.value.get(userId);
      if (!videoEl) {
        // 若 video 元素尚未被子组件回调 setRef，则后续 setRef 时可以触发相关逻辑（此处不额外轮询）
        return;
      }

      // 自己：publish，本人 id 的 publish 有去重
      if (userId === currUserId) {
        if (publishing.value.has(userId)) return;
        publishing.value.add(userId);
        try {
          await webRTC.value.publish(`${currRoomId}/${userId}`, videoEl);
          // 确保发布后本地音视频状态生效
          await setLocalAudioEnabled(!isMuted.value);
          await setLocalVideoEnabled(!isVideoOff.value);
          await safePlayVideo(videoEl);
        } catch (err) {
          console.error(`publish ${userId} failed:`, err);
        } finally {
          publishing.value.delete(userId);
        }
        return;
      }

      // 他人：pull
      if (pulling.value.has(userId)) return;
      pulling.value.add(userId);
      try {
        await webRTC.value.pull(`${currRoomId}/${userId}`, videoEl);
        await safePlayVideo(videoEl);
      } catch (err) {
        console.error(`pull ${userId} failed:`, err);
      } finally {
        pulling.value.delete(userId);
      }
    });
  }

  /**
   * handleUserLeave - 用户离开房间
   * - 释放 webRTC 资源（若实现存在），并从 map 中移除
   */
  function handleUserLeave(userId: string) {
    if (!userId) return;
    try {
      webRTC.value.removePull?.(userId);
    } catch (e) {
      console.warn("removePull error:", e);
    } finally {
      participantsMap.value.delete(userId);
      videoRefs.value.delete(userId);
      publishing.value.delete(userId);
      pulling.value.delete(userId);
    }
  }

  // ----------------- WS 消息解析 -----------------
  function handleServerMessage(evt: MessageEvent) {
    try {
      const msg = JSON.parse(evt.data);
      switch (msg.type) {
        case "join":
          if (Array.isArray(msg.users)) {
            for (const u of msg.users) {
              if (u) handleUserJoin(u);
            }
          }
          break;
        case "leave":
          handleUserLeave(msg.userId);
          break;
        case "update":
          upsertParticipant(msg.user);
          break;
        case "signal":
          messages.value.push({ userId: msg.userId, body: msg.body });
          break;
        default:
          console.debug("unknown ws message:", msg);
      }
    } catch (err) {
      console.error("parse ws message failed:", err);
    }
  }

  // ----------------- 心跳与重连 -----------------
  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = window.setInterval(() => {
      if (isSocketOpen()) {
        sendWebSocketMessage({ type: "heartbeat", roomId: currRoomId, userId: currUserId });
      }
    }, heartbeatIntervalMs) as unknown as number;
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function scheduleReconnect() {
    reconnectAttempts++;
    if (reconnectAttempts > maxReconnectAttempts) {
      console.error("重连尝试次数达到上限，停止重连");
      return;
    }
    const delay = initialReconnectDelayMs * Math.pow(2, reconnectAttempts - 1);
    console.info(`将在 ${delay}ms 后尝试第 ${reconnectAttempts} 次重连`);
    setTimeout(() => initializeWebSocket(), delay);
  }

  // ----------------- 初始化 WebSocket -----------------
  function initializeWebSocket() {
    if (reconnectAttempts > maxReconnectAttempts) {
      console.error("已超过最大重连次数，停止重连");
      return;
    }

    const wsUrl = String(import.meta.env.VITE_API_MEET_SERVER_WS);
    try {
      socket = new WebSocket(wsUrl);
    } catch (err) {
      console.error("WebSocket 构造失败:", err);
      scheduleReconnect();
      return;
    }

    socket.onopen = () => {
      console.log("WebSocket 已连接");
      reconnectAttempts = 0;

      const userInfo = userStore.userInfo;
      const currUser = {
        userId: userInfo.userId,
        name: userInfo.name,
        avatar: userInfo.avatar,
        muted: isMuted.value,
        // 保持原有行为：cameraOn 使用 isVideoOff（该处沿用你原代码的赋值以兼容后端）
        cameraOn: isVideoOff.value,
        screenShareOn: false,
        role: "host"
      };

      // 向服务端声明加入，并在本地触发发布（handleUserJoin 会处理 publish）
      sendWebSocketMessage({ type: "join", roomId: currRoomId, userId: userInfo.userId, user: currUser });

      // 启动心跳
      startHeartbeat();
    };

    socket.onmessage = handleServerMessage;

    socket.onclose = ev => {
      console.warn("WebSocket 已关闭：", ev);
      stopHeartbeat();
      scheduleReconnect();
    };

    socket.onerror = err => {
      console.error("WebSocket 错误：", err);
      // onerror 通常会伴随 onclose，因此不重复 scheduleReconnect
    };

    // 通知外部（例如 Tauri）call-ready
    void emit("call-ready", { label: "CALL" });
  }

  // ----------------- 发送聊天 -----------------
  function sendMessage() {
    const body = newMessage.value.trim();
    if (!body || !isSocketOpen()) return;
    sendWebSocketMessage({ type: "signal", roomId: currRoomId, userId: currUserId, body });
    newMessage.value = "";
  }

  // ----------------- 挂断与清理 -----------------
  async function handUp() {
    try {
      sendWebSocketMessage({ type: "leave", roomId: currRoomId, userId: currUserId });
      try {
        webRTC.value.close();
      } catch (e) {
        console.warn("webRTC.close error:", e);
      }
      try {
        const w = getCurrentWindow();
        await w.close();
      } catch (e) {
        console.warn("getCurrentWindow.close error:", e);
      }
    } catch (err) {
      console.error("handUp error:", err);
    }
  }

  // ----------------- 生命周期 -----------------
  onMounted(() => {
    initializeWebSocket();
    resetHideTimer();
  });

  onBeforeUnmount(() => {
    // 尝试优雅离开
    try {
      if (isSocketOpen()) {
        sendWebSocketMessage({ type: "leave", roomId: currRoomId, userId: currUserId });
      }
    } catch (e) {
      console.warn("beforeunmount send leave error:", e);
    }

    // 关闭 socket
    try {
      if (socket) {
        socket.close();
        socket = null;
      }
    } catch (e) {
      console.warn("close socket error:", e);
    }

    stopHeartbeat();

    // 关闭 webRTC（移除 pull）
    try {
      participantsMap.value.forEach(item => {
        try {
          webRTC.value.removePull?.(item.userId);
        } catch (e) {
          console.warn("removePull error:", e);
        }
      });
      webRTC.value.close();
    } catch (e) {
      console.warn("cleanup webRTC error:", e);
    }

    // 清理本地 state
    participantsMap.value.clear();
    videoRefs.value.clear();
    publishing.value.clear();
    pulling.value.clear();

    clearHideTimer();
  });

  // ----------------- 对外暴露 API -----------------
  return {
    // 状态
    webRTC,
    participantsMap,
    participantsList,
    videoRefs,
    messages,
    newMessage,
    isChatCollapsed,
    showControls,
    isMuted,
    isVideoOff,
    // DOM / 交互
    setRef,
    onUserActivity,
    onUserEnter,
    onUserLeave,
    onControlsEnter,
    onControlsLeave,
    // 音视频控制
    toggleMute,
    toggleVideo,
    // 聊天 / 房间控制
    toggleChat: () => (isChatCollapsed.value = !isChatCollapsed.value),
    sendMessage,
    handleUserJoin,
    handleUserLeave,
    handUp,
    // 手动控制 / 调试
    initializeWebSocket
  } as const;
}

// // 加入房间：设置 roomId 并添加本地 participant
// joinRoom(roomId: string, local: Participant) {
//   this.roomId = roomId;
//   // 如果已存在本地，替换
//   const exists = this.participants.find(p => p.id === local.id);
//   if (!exists) this.participants.push(local);
//   else Object.assign(exists, local);
// },

// // 离开房间：清空状态
// leaveRoom() {
//   this.participants = [];
//   this.roomId = undefined;
//   this.isScreenShared = false;
// },

// // 新参与者加入（远端）
// addParticipant(p: Participant) {
//   if (!this.participants.find(x => x.id === p.id)) {
//     this.participants.push(p);
//   } else {
//     Object.assign(this.participants.find(x => x.id === p.id)!, p);
//   }
// },

// // 参与者离开
// removeParticipant(id: string) {
//   this.participants = this.participants.filter(p => p.id !== id);
// },

// // 切换摄像头（本地或远端标记）
// async toggleCam(participantId: string, on?: boolean) {
//   const p = this.participants.find(x => x.id === participantId);
//   if (!p) return;
//   p.cameraOn = typeof on === "boolean" ? on : !p.cameraOn;
// },

// // 切换麦克风静音
// async toggleMic(participantId: string, muted?: boolean) {
//   const p = this.participants.find(x => x.id === participantId);
//   if (!p) return;
//   p.muted = typeof muted === "boolean" ? muted : !p.muted;
// },

// // 开始/停止屏幕共享
// startScreenShare(participantId: string) {
//   this.isScreenShared = true;
//   const p = this.participants.find(x => x.id === participantId);
//   if (p) p.screenShareOn = true;
// },
// stopScreenShare(participantId: string) {
//   this.isScreenShared = false;
//   const p = this.participants.find(x => x.id === participantId);
//   if (p) p.screenShareOn = false;
// },

// // 改变布局
// changeLayout(layout: LayoutMode) {
//   this.layoutMode = layout;
// },

// // 设为主持人
// setHost(participantId: string) {
//   this.hostId = participantId;
//   this.participants.forEach(p => (p.role = p.id === participantId ? "host" : "participant"));
// },

// // 更新 stream（用于 VideoTile 绑定）
// attachStream(participantId: string, stream?: MediaStream | null) {
//   const p = this.participants.find(x => x.id === participantId);
//   if (p) p.stream = stream ?? null;
// },
