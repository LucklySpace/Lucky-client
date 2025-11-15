// WebRTC.ts（改进版）
// 注意：需要在项目中 import Log 相应的 logger，以下注释均为 中文

import Log from "./Log.ts";

/**
 * srs webrtc 推流/拉流工具类（改进版）
 *
 * 主要改动与增强：
 * - 支持 iceServers（STUN/TURN）
 * - 修正 transceiver direction（publish: sendrecv/sendonly；pull: recvonly）
 * - 支持多种 SDP 交换模式（WHIP / simple HTTP SDP / custom JSON）
 * - 完善事件回调（onicecandidate/onconnectionstatechange/oniceconnectionstatechange）
 * - 统一的资源清理（停止 tracks、关闭 pc、清空 video.srcObject）
 * - 更严谨的类型与错误处理
 */

type SDPExchangeMode = "srs-http-sdp" | "whip" | "custom-json";

export default class WebRTC {
  // RTCPeerConnection 实例
  private peer: RTCPeerConnection | null = null;
  // 远程 RTCPeerConnection 实例
  private remotePeers: Record<string, RTCPeerConnection> = {};
  // 本地视频元素
  private localVideoRef: HTMLVideoElement | null = null;
  // 远程视频元素
  private remoteVideoRefs: Record<string, HTMLVideoElement> = {};
  // WebRTC推流参数
  private webRTCPublishParam: WebRTCPublishParam;
  // 音频轨道
  private localAudioTracks: MediaStreamTrack[] = [];
  // 视频轨道
  private localVideoTracks: MediaStreamTrack[] = [];

  // 可选：当使用 TURN 时通过构造传入 iceServers
  private iceServers: RTCIceServer[] = [];

  // 配置如何与服务器交换 SDP
  private sdpExchangeMode: SDPExchangeMode = "srs-http-sdp";

  constructor(
    webRTCPublishParam: WebRTCPublishParam = DefaultWebRTCPublishParam,
    options?: {
      iceServers?: RTCIceServer[];
      sdpExchangeMode?: SDPExchangeMode;
    }
  ) {
    this.webRTCPublishParam = webRTCPublishParam;
    if (options?.iceServers) this.iceServers = options.iceServers;
    if (options?.sdpExchangeMode) this.sdpExchangeMode = options.sdpExchangeMode;
  }

  /**
   * publish 推流：建立 RTCPeerConnection，采集本地流并发送到服务器
   * @param key - 流的唯一标识（stream id）
   * @param localVideoRef - 本地预览的 video 元素（会把 srcObject 设为本地流并 muted）
   */
  async publish(key: string, localVideoRef: HTMLVideoElement): Promise<void> {
    if (!this.hasUserMedia()) {
      Log.colorLog("webrtc", "当前环境不支持 getUserMedia", "warn");
      return;
    }

    if (this.peer) {
      Log.colorLog("webrtc", "已经在推流中，忽略重复 publish", "info");
      return;
    }

    try {
      this.localVideoRef = localVideoRef;

      // 1. 获取本地流（处理用户拒绝、设备不存在等异常）
      const constraints = this.buildMediaConstraints();
      const localStream = await navigator.mediaDevices.getUserMedia(constraints);

      // 暂存 track 引用，便于开关麦克/摄像头
      this.localAudioTracks = localStream.getAudioTracks();
      this.localVideoTracks = localStream.getVideoTracks();

      // 本地预览：**强烈建议 muted=true 防止回声**（如果你希望本地也能听到远端混音另行处理）
      if (this.localVideoRef) {
        this.localVideoRef.autoplay = true;
        this.localVideoRef.playsInline = true;
        this.localVideoRef.muted = true; // 重要：避免回声
        this.localVideoRef.srcObject = localStream;
      }

      // 2. 创建 RTCPeerConnection（带 iceServers）
      const pcConfig: RTCConfiguration = {
        iceServers: this.iceServers.length ? this.iceServers : [{ urls: "stun:stun.l.google.com:19302" }]
        // 可根据需要设置 bundlePolicy、rtcpMuxPolicy 等
      };
      this.peer = new RTCPeerConnection(pcConfig);

      // 3. 事件：ICE candidate（trickle ICE），你可以选择发送给后端或让服务器完成 SDP-only 交换
      this.peer.onicecandidate = ev => {
        if (ev.candidate) {
          // 推荐：把 candidate 发到你的信令服务器（若使用 WHIP，可能不必）
          Log.prettyWarn("webrtc", "onicecandidate: " + JSON.stringify(ev.candidate), "debug");
          // TODO: 根据后端协议决定是否发送 candidate
        } else {
          // gathering 完成（candidate 为 null）
          Log.prettyWarn("webrtc", "ICE candidate gathering finished", "debug");
        }
      };

      // 连接状态追踪
      this.peer.onconnectionstatechange = () => {
        Log.prettyWarn("webrtc", `publish connectionState=${this.peer?.connectionState}`, "info");
        if (this.peer?.connectionState === "failed" || this.peer?.connectionState === "disconnected") {
          // 这里可以触发重连策略
        }
      };

      this.peer.oniceconnectionstatechange = () => {
        Log.prettyWarn("webrtc", `publish iceConnectionState=${this.peer?.iceConnectionState}`, "info");
      };

      // 4. 将本地 track 添加到 PeerConnection（使用 addTrack，浏览器会自动创建 sender）
      localStream.getTracks().forEach(track => {
        this.peer!.addTrack(track, localStream);
      });

      // 5. 为兼容一些 SFU/服务器（如果需要）也可以 explicit 添加 transceiver
      //    但注意 direction：发布端应为 'sendonly' 或 'sendrecv'（这里不强制）
      // this.peer.addTransceiver('audio', { direction: 'sendrecv' });
      // this.peer.addTransceiver('video', { direction: 'sendrecv' });

      // 6. 创建 offer（可以在需要时添加 offerOptions）
      const offer = await this.peer.createOffer();
      await this.peer.setLocalDescription(offer);

      // 7. 等待 ICE gather 完成再发送 offer（可选）
      //    某些服务器需要完整 SDP（non-trickle），否则你也可以直接发送并使用 candidates trickle
      const offerSdp = await this.maybeWaitForIceGatheringComplete(this.peer, offer.sdp);

      // 8. 发送 offer 给服务器并获取 answer（exchangeSDP 会根据 sdpExchangeMode 处理）
      const answer = await this.exchangeSDP({
        api: this.webRTCPublishParam.httpPublish,
        streamurl: `${this.webRTCPublishParam.webrtc}${key}`,
        sdp: offerSdp
      });

      // 9. 设置远端描述
      await this.peer.setRemoteDescription({ type: "answer", sdp: answer.sdp });

      Log.prettyInfo("webrtc", "publish 推流成功", "info");
    } catch (err: any) {
      Log.prettyError("webrtc", `publish 报错: ${err?.message || err}`, "error");
      // 发生异常时清理
      this.close();
      throw err;
    }
  } // end publish

  /**
   * pull（拉流/播放）
   * @param key - 流 id
   * @param remoteVideoRef - 用于播放远端流的 <video>
   */
  async pull(key: string, remoteVideoRef: HTMLVideoElement): Promise<void> {
    try {
      if (this.remotePeers[key] && this.remoteVideoRefs[key]) {
        Log.prettyWarn("webrtc", `${key} 已在拉流中，忽略重复拉流`, "warn");
        return;
      }

      this.remoteVideoRefs[key] = remoteVideoRef;
      const httpURL = this.webRTCPublishParam.httpPlay;
      const webrtcURL = `${this.webRTCPublishParam.webrtc}${key}`;

      // 创建 pc（拉流只需要 recv）
      const pcConfig: RTCConfiguration = {
        iceServers: this.iceServers.length ? this.iceServers : [{ urls: "stun:stun.l.google.com:19302" }]
      };
      const pc = new RTCPeerConnection(pcConfig);
      this.remotePeers[key] = pc;

      // 创建用于存远端 track 的 MediaStream
      const remoteStream = new MediaStream();
      if (remoteVideoRef) {
        remoteVideoRef.autoplay = true;
        remoteVideoRef.playsInline = true;
        remoteVideoRef.muted = false; // 远端播放通常不静音
        remoteVideoRef.srcObject = remoteStream;
      }

      // 监听远端 track
      pc.ontrack = (event: RTCTrackEvent) => {
        // event.streams[0] 包含远端流，或者单 track 可用接入 remoteStream
        event.streams?.[0] ? remoteStream.addTrack(event.track) : remoteStream.addTrack(event.track);
      };

      pc.onicecandidate = ev => {
        if (ev.candidate) {
          Log.prettyWarn("webrtc", `pull ${key} onicecandidate: ${JSON.stringify(ev.candidate)}`, "debug");
          // 根据后端协议决定是否转发 candidate
        }
      };

      pc.onconnectionstatechange = () => {
        Log.prettyInfo("webrtc", `pull ${key} connectionState=${pc.connectionState}`, "info");
      };

      pc.oniceconnectionstatechange = () => {
        Log.prettyInfo("webrtc", `pull ${key} iceConnectionState=${pc.iceConnectionState}`, "info");
      };

      // 指定接收方向
      pc.addTransceiver("audio", { direction: "recvonly" });
      pc.addTransceiver("video", { direction: "recvonly" });

      // 创建 offer 并设置本地描述
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 可选择等待 ice gathering 完成（视后端是否需要完整 sdp）
      const offerSdp = await this.maybeWaitForIceGatheringComplete(pc, offer.sdp);

      // 通过 HTTP 交换获取 answer（同 publish）
      const answer = await this.exchangeSDP({
        api: httpURL,
        streamurl: webrtcURL,
        sdp: offerSdp
      });

      await pc.setRemoteDescription({ type: "answer", sdp: answer.sdp });

      Log.colorLog("webrtc", `pull ${key} 成功`, "info");
    } catch (err: any) {
      Log.colorLog("webrtc", `pull ${key} 错误: ${err?.message || err}`, "error");
      // 发生异常时清理
      this.removePull(key);
      throw err;
    }
  } // end pull

  /**
   * 移除并关闭拉流（并清理 DOM）
   */
  removePull(key: string): void {
    try {
      const pc = this.remotePeers[key];
      if (pc) {
        try {
          pc.close();
        } catch (e) {
          /* ignore */
        }
        delete this.remotePeers[key];
      }

      // 清除远端视频元素的 srcObject 并停止其 tracks
      const v = this.remoteVideoRefs[key];
      if (v && v.srcObject) {
        const s = v.srcObject as MediaStream;
        s.getTracks().forEach(t => t.stop());
        v.srcObject = null;
      }
      delete this.remoteVideoRefs[key];
      Log.colorLog("webrtc", `${key} pull 已移除`, "info");
    } catch (e) {
      Log.colorLog("webrtc", `removePull 错误: ${e}`, "warn");
    }
  }

  /**
   * 关闭推流（停止本地发送、释放资源）
   */
  close(): void {
    try {
      if (this.peer) {
        try {
          // 停止所有本地 tracks（发送端）
          this.peer.getSenders().forEach(sender => {
            if (sender.track) {
              try {
                sender.track.stop();
              } catch (e) {
              }
            }
          });
          this.peer.close();
        } catch (e) {
        }
        this.peer = null;
        Log.colorLog("webrtc", "推流连接已关闭", "info");
      }

      // 停止并清理本地 video 元素
      if (this.localVideoRef && this.localVideoRef.srcObject) {
        const s = this.localVideoRef.srcObject as MediaStream;
        s.getTracks().forEach(t => t.stop());
        this.localVideoRef.srcObject = null;
      }
      this.localAudioTracks = [];
      this.localVideoTracks = [];
    } catch (e) {
      Log.colorLog("webrtc", `close 错误: ${e}`, "error");
    }
  }

  // 开关本地摄像头/麦克风（通过 track.enabled）
  toggleCamera(enable: boolean): void {
    this.localVideoTracks.forEach(t => (t.enabled = enable));
  }

  // 麦克风
  toggleMicrophone(enable: boolean): void {
    this.localAudioTracks.forEach(t => (t.enabled = enable));
  }

  toggleSpeaker(enable: boolean, key: string): void {
    const v = this.remoteVideoRefs[key];
    if (v) v.volume = enable ? 1 : 0;
  }

  // webrtc连接是否存在
  RemoteConnectIsExist(key: string): boolean {
    return !!this.remotePeers[key];
  }

  /**
   * 辅助：构建 MediaConstraints（可以根据 webRTCPublishParam 动态构建）
   */
  private buildMediaConstraints() {
    // 将 webRTCPublishParam.video 转换成 getUserMedia 可接受的约束（谨慎）
    const videoConstraints: MediaTrackConstraints = {
      width: this.webRTCPublishParam.video?.width ?? undefined,
      height: this.webRTCPublishParam.video?.height ?? undefined,
      frameRate: this.webRTCPublishParam.video?.frameRate ?? undefined,
      aspectRatio: this.webRTCPublishParam.video?.aspectRatio ?? undefined
    };
    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: this.webRTCPublishParam.audio?.echoCancellation,
      noiseSuppression: this.webRTCPublishParam.audio?.noiseSuppression,
      autoGainControl: this.webRTCPublishParam.audio?.autoGainControl
    };
    return { audio: audioConstraints, video: videoConstraints };
  }

  /**
   * 可选：等待 ICE gathering 完成（如果服务器需要完整 SDP 才能处理）
   * 如果 2 秒内没完成则返回当前 SDP（这是一个折中）
   */
  private maybeWaitForIceGatheringComplete(
    pc: RTCPeerConnection,
    sdp: string | undefined,
    timeout = 2000
  ): Promise<string> {
    return new Promise(resolve => {
      if (!sdp) {
        return;
      }
      if (pc.iceGatheringState === "complete") {
        resolve(sdp);
        return;
      }
      const onIceGathering = () => {
        if (pc.iceGatheringState === "complete") {
          cleanup();
          resolve(pc.localDescription?.sdp ?? sdp);
        }
      };
      const cleanup = () => {
        pc.removeEventListener("icegatheringstatechange", onIceGathering);
        clearTimeout(timer);
      };
      pc.addEventListener("icegatheringstatechange", onIceGathering);
      const timer = setTimeout(() => {
        cleanup();
        // 超时则用当前 localDescription（可能为 trickle）
        resolve(pc.localDescription?.sdp ?? sdp);
      }, timeout);
    });
  }

  /**
   * 与后端交换 SDP（可适配多种后端接口）
   * - 若使用 WHIP：POST application/sdp 到 WHIP endpoint，返回 answer SDP 文本
   * - 若使用 SRS 的 /rtc/v1/publish JSON：需要按后端约定发送 JSON 并解析返回
   */
  private async exchangeSDP(payload: { api: string; streamurl: string; sdp: string }): Promise<{ sdp: string }> {
    // 根据 sdpExchangeMode 决定如何发送
    if (this.sdpExchangeMode === "whip" || this.sdpExchangeMode === "srs-http-sdp") {
      // 这里以 POST application/sdp 为例（很多 WHIP 服务就是这样）
      const url = payload.api; // 例如: http://srs-host:1985/rtc/v1/whip/?app=live&stream=streamId
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: payload.sdp
      });
      if (!res.ok) throw new Error(`SDP exchange failed ${res.status}`);
      const answerSdp = await res.text();
      return { sdp: answerSdp };
    } else {
      // custom-json：按你原来实现用 JSON body 的例子（需后端返回 { code:0, data:{ sdp: xxx } }）
      const res = await fetch(payload.api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api: payload.api, streamurl: payload.streamurl, sdp: payload.sdp })
      });
      if (!res.ok) throw new Error("SDP exchange failed (json) " + res.status);
      const json = await res.json();
      // NOTE: 这里需要根据你后端返回格式调整
      if (json?.code === 0 && (json?.data?.sdp || json?.sdp)) {
        return { sdp: json.data?.sdp ?? json.sdp };
      }
      throw new Error("SDP exchange returned error: " + JSON.stringify(json));
    }
  }

  private hasUserMedia(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }
}

/** 默认参数（供参考） */
const DefaultWebRTCPublishParam: WebRTCPublishParam = {
  httpPublish: "http://localhost:1985/rtc/v1/publish",
  httpPlay: "http://localhost:1985/rtc/v1/play",
  webrtc: "live/", // 注意：这里我把 base stream id 保持简单，构造时需拼接正确 URL
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

/** 省略接口定义，保持和你现有的一致（可复用） */
interface WebRTCPublishParam {
  httpPublish: string;
  httpPlay: string;
  webrtc: string;
  audio: {
    echoCancellationType: string;
    echoCancellation: boolean;
    noiseSuppression: boolean;
    autoGainControl: boolean;
    sampleRate: number;
    sampleSize: number;
    channelCount: number;
    volume: number;
  };
  video: {
    frameRate: { min: number };
    width: { min: number; ideal: number } | number;
    height: { min: number; ideal: number } | number;
    aspectRatio: number;
  };
}
