// webrtc.worker.ts

/**
 * @file WebRTC Worker 线程
 * @description 该 Worker 负责所有与 RTCPeerConnection 相关的繁重任务，
 * 包括创建连接、SDP 信令交换、ICE Candidate 处理等，以避免阻塞主线程。
 * 它通过 postMessage 与主线程通信。
 */

// --- 状态管理 ---
let peer: RTCPeerConnection | null = null; // 推流 PeerConnection
let remotePeers: { [key: string]: RTCPeerConnection } = {}; // 拉流 PeerConnection Map
let localStream: MediaStream | null = null; // 从主线程传来的本地流

// --- 配置 (可以由主线程初始化时传入) ---
let rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};
let webRTCPublishParam: any = {}; // 推/拉流的 URL 等参数

/**
 * 统一的日志处理器，将日志信息发送回主线程进行打印
 * @param level 日志级别
 * @param args 日志内容
 */
function log(level: "info" | "warn" | "error" | "trace", ...args: any[]) {
  self.postMessage({
    type: "log",
    payload: {
      level,
      message: args.map(arg => (typeof arg === "object" ? JSON.stringify(arg) : arg)).join(" ")
    }
  });
}

/**
 * 执行 SDP 交换的 fetch 请求
 * @param url 信令服务器 URL
 * @param data 请求体数据
 * @returns {Promise<any>}
 */
async function exchangeSDP(
  url: string,
  data: { api: string; streamurl: string; sdp: string | undefined }
): Promise<any> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    log("error", `SDP exchange failed for ${url}:`, error);
    throw error;
  }
}

/**
 * 处理推流逻辑
 * @param key 推流的 key
 * @param stream 本地媒体流
 */
async function handlePublish(key: string, stream: MediaStream) {
  if (peer) {
    log("warn", "Publishing is already in progress.");
    return;
  }

  localStream = stream; // 保存本地流引用

  const httpURL = webRTCPublishParam.httpPublish;
  const webrtcURL = `${webRTCPublishParam.webrtc}${key}`;

  peer = new RTCPeerConnection(rtcConfig);

  // 监听状态变化并通知主线程
  peer.onconnectionstatechange = () => log("info", `Publisher peer connectionState: ${peer?.connectionState}`);
  peer.oniceconnectionstatechange = () => log("info", `Publisher peer iceConnectionState: ${peer?.iceConnectionState}`);
  peer.onicecandidate = ev => {
    if (ev.candidate) log("trace", `Publisher onicecandidate:`, ev.candidate);
  };

  // 将本地流的轨道添加到 peer connection
  localStream.getTracks().forEach(track => {
    peer!.addTrack(track, localStream!);
  });

  // （可选）为了兼容某些老的 WebRTC 服务端，需要添加 recvonly 的 transceiver
  peer.addTransceiver("audio", { direction: "recvonly" });
  peer.addTransceiver("video", { direction: "recvonly" });

  try {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    const answerData = await exchangeSDP(httpURL, { api: httpURL, streamurl: webrtcURL, sdp: offer.sdp });
    await peer.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: answerData.sdp }));

    log("info", `Publish successful for key: ${key}`);
    self.postMessage({ type: "publishSuccess" });
  } catch (error) {
    log("error", "Publishing process failed:", error);
    self.postMessage({ type: "publishError", payload: { error: (error as Error).message } });
    if (peer) {
      peer.close();
      peer = null;
    }
  }
}

/**
 * 处理拉流逻辑
 * @param key 拉流的 key
 */
async function handlePull(key: string) {
  if (remotePeers[key]) {
    log("warn", `Pulling for key ${key} already exists. Closing previous one.`);
    handleRemovePull(key);
  }

  const httpURL = webRTCPublishParam.httpPlay;
  const webrtcURL = `${webRTCPublishParam.webrtc}${key}`;

  const pc = new RTCPeerConnection(rtcConfig);
  remotePeers[key] = pc;

  pc.onconnectionstatechange = () => log("info", `Remote peer[${key}] connectionState: ${pc.connectionState}`);
  pc.oniceconnectionstatechange = () => log("info", `Remote peer[${key}] iceState: ${pc.iceConnectionState}`);

  // 核心逻辑：当接收到远程轨道时，创建一个新的 MediaStream 并发送回主线程
  pc.ontrack = (event: RTCTrackEvent) => {
    log("info", `Received remote track (kind: ${event.track.kind}) for key: ${key}`);
    const remoteStream = event.streams[0];
    // 将整个 MediaStream 对象传输回主线程
    // 第二个参数 [remoteStream] 标记该对象为可转移对象，以提升性能
    self.postMessage(
      {
        type: "remoteStreamReady",
        payload: { key, stream: remoteStream }
      },
      [remoteStream] as any
    );
  };

  pc.addTransceiver("audio", { direction: "recvonly" });
  pc.addTransceiver("video", { direction: "recvonly" });

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const answerData = await exchangeSDP(httpURL, { api: httpURL, streamurl: webrtcURL, sdp: offer.sdp });
    await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: answerData.sdp }));

    log("info", `Pull successful for key: ${key}`);
    self.postMessage({ type: "pullSuccess", payload: { key } });
  } catch (error) {
    log("error", `Pulling process for key ${key} failed:`, error);
    self.postMessage({ type: "pullError", payload: { key, error: (error as Error).message } });
    if (remotePeers[key]) {
      remotePeers[key].close();
      delete remotePeers[key];
    }
  }
}

/**
 * 移除指定的拉流
 * @param key
 */
function handleRemovePull(key: string) {
  const pc = remotePeers[key];
  if (pc) {
    pc.close();
    delete remotePeers[key];
    log("info", `Pull connection for key ${key} removed.`);
  }
}

/**
 * 关闭所有连接和资源
 */
function handleClose() {
  // 关闭推流
  if (peer) {
    peer.close();
    peer = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  // 关闭所有拉流
  for (const key in remotePeers) {
    handleRemovePull(key);
  }

  log("info", "All WebRTC connections have been closed.");
}

/**
 * Worker 的消息入口
 */
self.onmessage = (event: MessageEvent) => {
  const { type, payload } = event.data;

  switch (type) {
    case "init":
      // 初始化配置
      webRTCPublishParam = payload.webRTCPublishParam;
      if (payload.rtcConfig) {
        rtcConfig = payload.rtcConfig;
      }
      log("info", "WebRTC Worker initialized.");
      break;

    case "publish":
      handlePublish(payload.key, payload.stream);
      break;

    case "pull":
      handlePull(payload.key);
      break;

    case "removePull":
      handleRemovePull(payload.key);
      break;

    case "close":
      handleClose();
      break;

    // 可以在此扩展更多指令，如 toggleAudio, toggleVideo 等
  }
};
