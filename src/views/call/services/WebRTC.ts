import Log from "../../../utils/Log.ts";
import HttpClient from "@/views/call/services/Http.ts";
//import { useLogger } from "./useLogger";

// 创建实例，配置 baseURL、默认头与超时
const Http = HttpClient.create({
  baseURL: "",
  defaultHeaders: { "Content-Type": "application/json" },
  timeout: 10000
});

/**
 * https://blog.csdn.net/weixin_44341110/article/details/132319958
 *
 * srs webrtc推流工具类
 */
/**
 * WebRTC 推流/拉流工具类（优化版）
 *
 * 主要目标：
 *  - 最小改动原有逻辑与接口（publish / pull / removePull / close 等方法保持不变）
 *  - 增强跨平台（macOS/Windows/Linux/Tauri）兼容性与错误提示
 *  - 更健壮的资源释放（停止 tracks、关闭 peer、移除 event handlers）
 *  - 更友好的调试输出与状态回调点（onconnectionstatechange / onicecandidate / oniceconnectionstatechange）
 *
 * 使用说明（跨平台注意事项）：
 *  - macOS 桌面/tauri：如出现 NotAllowedError，请检查 Info.plist 是否声明了 NSCameraUsageDescription/NSMicrophoneUsageDescription（以及系统隐私设置）
 *  - Windows：检查摄像头/麦克风权限与驱动；浏览器外的 WebView（如 Tauri），可能需要在 host 应用中声明权限
 *  - Linux：注意 pulseaudio/pipewire/alsa 驱动与权限，设备名与 deviceId 的兼容性
 *
 * 尽量保持原来行为。若需要将 offer/answer 的 candidate 单独上报（trickle ICE），可在 onicecandidate 中扩展 HTTPClient 调用。
 */

export default class WebRTC {
  private peer: RTCPeerConnection | null = null; // 推流 RTCPeerConnection 实例
  private localVideoRef: HTMLVideoElement | null = null; // 本地 video 元素引用
  private remotePeers: { [key: string]: RTCPeerConnection } = {}; // 拉流 peer map
  private remoteVideoRefs: { [key: string]: HTMLVideoElement } = {}; // 远程 video 元素引用 map
  private screenStream: MediaStream | null = null; // 屏幕共享流（若在共享）
  private webRTCPublishParam: WebRTCPublishParam; // 推流参数
  private localAudioTracks: MediaStreamTrack[] = []; // 本地音频轨道
  private localVideoTracks: MediaStreamTrack[] = []; // 本地视频轨道

  // 降噪相关属性
  private noiseSuppressionEnabled: boolean = true; // 是否启用降噪
  private audioContext: AudioContext | null = null; // 音频上下文
  private noiseProcessor: AudioWorkletNode | null = null; // 降噪处理器
  private noiseSuppressionCleanup: (() => void) | null = null; // 清理函数

  // 可选 RTC 配置（包含 STUN），可通过构造器扩展或修改（默认使用公共 STUN）
  private rtcConfig: RTCConfiguration = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  };

  constructor(webRTCPublishParam: WebRTCPublishParam = WebRTCPublishParamDefault) {
    this.webRTCPublishParam = webRTCPublishParam;
  }

  /**
   * 推流
   * @param key 推流流 id / key（会拼接到 webrtc URL 上）
   * @param localVideoRef 本地 video 元素（用于显示本地预览）
   */
  async publish(key: string, localVideoRef: HTMLVideoElement, useScreen = false): Promise<void> {
    if (!this.hasUserMedia()) {
      Log.colorLog("webrtc", "不支持获取视频，请检查运行环境（navigator.mediaDevices 未实现）", "info");
      return;
    }

    try {
      if (this.peer !== null) {
        Log.colorLog("webrtc", "已开始推流（peer 已存在）", "info");
        return;
      }

      // 记录本地 video 元素
      this.localVideoRef = localVideoRef;

      const httpURL = this.webRTCPublishParam.httpPublish;
      const webrtcURL = `${this.webRTCPublishParam.webrtc}${key}`;

      // 获取本地媒体流（包含权限、设备回退逻辑）
      // 获取初始本地流（摄像头或屏幕）
      const initialSource: "camera" | "screen" = useScreen ? "screen" : "camera";
      let localStream = await this.acquireLocalStream(initialSource);

      // 如果启用降噪，应用RNNoise处理
      if (this.noiseSuppressionEnabled && localStream.getAudioTracks().length > 0) {
        try {
          const noiseSuppressionResult = await this.applyNoiseSuppression(localStream, true);
          localStream = noiseSuppressionResult.processedStream;
          this.audioContext = noiseSuppressionResult.audioContext;
          this.noiseProcessor = noiseSuppressionResult.processor;
          this.noiseSuppressionCleanup = noiseSuppressionResult.cleanup;
          Log.colorLog("webrtc", `降噪应用成功 `, "info");
        } catch (error) {
          Log.colorLog("webrtc", `降噪应用失败，继续使用原始音频: ${error}`, "warn");
        }
      }

      // 保存轨道引用
      this.localAudioTracks = localStream.getAudioTracks();
      this.localVideoTracks = localStream.getVideoTracks();

      // 将本地流绑定到 video（用于本地预览）
      if (this.localVideoRef) {
        this.localVideoRef.srcObject = localStream;
        // 设置静音（避免回声在本地预览中播放）
        this.localVideoRef.volume = this.webRTCPublishParam.audio.volume ?? 0.5;
        // 为了更好兼容某些平台，尝试自动播放（浏览器策略可能阻止，需要用户交互）
        // 注意：不保证在所有环境下自动播放成功
        this.localVideoRef.play().catch(() => {
          // 忽略自动播放错误
        });
      }

      // 创建 RTCPeerConnection（保持以前逻辑，但使用默认 rtcConfig）
      this.peer = new RTCPeerConnection(this.rtcConfig);

      // 添加常用事件监听，方便调试与状态跟踪
      this.peer.onicecandidate = (ev: RTCPeerConnectionIceEvent) => {
        // Trickle ICE：如果需要可以把 candidate 发送到信令服务器
        // 保守处理：此处仅打印日志，不改变原有 SDP HTTP 交换流程
        if (ev.candidate) {
          Log.colorLog("webrtc", `onicecandidate: ${JSON.stringify(ev.candidate)}`, "trace");
        }
      };

      this.peer.onconnectionstatechange = () => {
        Log.colorLog("webrtc", `peer connectionState: ${this.peer?.connectionState}`, "info");
      };
      this.peer.oniceconnectionstatechange = () => {
        Log.colorLog("webrtc", `peer iceConnectionState: ${this.peer?.iceConnectionState}`, "info");
      };

      // 保守：保留你原来添加 transceiver 的方式（不修改逻辑）
      this.peer.addTransceiver("audio", { direction: "recvonly" });
      this.peer.addTransceiver("video", { direction: "recvonly" });

      // 将本地流的轨道添加到 peer（用于推送）
      localStream.getTracks().forEach((track: MediaStreamTrack) => {
        try {
          this.peer?.addTrack(track, localStream);
        } catch (err) {
          // 某些环境下 addTrack 可能失败，打印日志但继续
          Log.colorLog("webrtc", `addTrack 出错: ${err}`, "warn");
        }
      });

      // 创建 offer 并设置本地描述（保持原逻辑）
      const offer = await this.peer.createOffer();
      await this.peer.setLocalDescription(offer);

      // 发送 HTTP 请求取 answer（保留原有数据格式）
      Http.post(httpURL, { api: httpURL, streamurl: webrtcURL, sdp: offer.sdp })
        .then(async (data: any) => {
          Log.prettyInfo("webrtc", "publish推流成功");
          await this.peer?.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: data.sdp }));
        })
        .catch(err => {
          Log.prettyError("webrtc", `publish SDP交换失败:${err}`);
        });
    } catch (error: any) {
      Log.colorLog("webrtc", `publish 推流过程出现错误: ${error?.message ?? error}`, "error");
      throw error;
    }
  }

  /**
   * 拉流（按 key 创建单独的 RTCPeerConnection 与 <video> 绑定）
   * @param key 拉流 key（唯一标识）
   * @param remoteVideoRef 绑定的远端 video 元素
   */
  async pull(key: string, remoteVideoRef: HTMLVideoElement): Promise<void> {
    try {
      // 防止重复拉流
      if (this.remotePeers[key] && this.remoteVideoRefs[key]) {
        Log.colorLog("webrtc", `${key} pull 已经存在`, "warn");
        this.removePull(key);
      }

      this.remoteVideoRefs[key] = remoteVideoRef;

      const httpURL = this.webRTCPublishParam.httpPlay;
      const webrtcURL = `${this.webRTCPublishParam.webrtc}${key}`;

      // 创建新的 RTCPeerConnection（单独管理）
      const pc = new RTCPeerConnection(this.rtcConfig);
      this.remotePeers[key] = pc;

      // 创建接收流
      const stream = new MediaStream();

      // ontrack：合并 track 到 MediaStream 并绑定到 video 元素
      pc.ontrack = (event: RTCTrackEvent) => {
        // 把所有 track 添加到同一个 stream 中
        try {
          stream.addTrack(event.track);
          const rv = this.remoteVideoRefs[key];
          if (rv) {
            rv.srcObject = stream;
            // 尝试 autoplay（可能被浏览器策略阻止）
            rv.play().catch(() => {});
          }
        } catch (err) {
          Log.colorLog("webrtc", `ontrack 处理失败: ${err}`, "warn");
        }
      };

      pc.onicecandidate = (ev: RTCPeerConnectionIceEvent) => {
        if (ev.candidate) {
          Log.colorLog("webrtc", `remote onicecandidate: ${JSON.stringify(ev.candidate)}`, "trace");
        }
      };

      pc.onconnectionstatechange = () => {
        Log.colorLog("webrtc", `remote peer[${key}] connectionState: ${pc.connectionState}`, "info");
      };

      pc.oniceconnectionstatechange = () => {
        Log.colorLog("webrtc", `remote peer[${key}] iceState: ${pc.iceConnectionState}`, "info");
      };

      // 保守：保留原有添加 transceiver 逻辑
      pc.addTransceiver("audio", { direction: "recvonly" });
      pc.addTransceiver("video", { direction: "recvonly" });

      // 创建 offer 并设置本地描述
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 通过 HTTP 与服务端交换 SDP
      Http.post(httpURL, { api: httpURL, streamurl: webrtcURL, sdp: offer.sdp })
        .then(async (data: any) => {
          Log.prettyInfo("webrtc", "拉流成功");
          await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: data.sdp }));
        })
        .catch(err => {
          Log.prettyError("webrtc", `pull SDP交换失败:${err}`);
        });
    } catch (error: any) {
      Log.colorLog("webrtc", `pull 拉流过程出现错误: ${error?.message ?? error}`, "error");
      throw error;
    }
  }

  isPulish() {
    return this.peer && this.localVideoRef;
  }

  /**
   * 移除并关闭单个拉流连接
   * @param key 拉流 key
   */
  removePull(key: string): void {
    // 关闭 peerConnection
    const pc = this.remotePeers[key];
    if (pc) {
      try {
        // 停止 peer 发送的所有 track（如果有）
        try {
          pc.getSenders().forEach((sender: RTCRtpSender) => {
            sender.track?.stop();
          });
        } catch (err) {
          // 某些环境下 pc.getSenders() 可能异常，忽略但记录
          Log.colorLog("webrtc", `getSenders 停止轨道异常: ${err}`, "warn");
        }
        // 关闭连接并移除引用
        pc.close();
      } catch (err) {
        Log.colorLog("webrtc", `关闭 remote peer[${key}] 出错: ${err}`, "warn");
      } finally {
        delete this.remotePeers[key];
        Log.colorLog("webrtc", `${key} pull 已移除`, "info");
      }
    }

    // 清理绑定的远程 video 元素并停止其流
    const rv = this.remoteVideoRefs[key];
    if (rv) {
      const remoteStream = rv.srcObject as MediaStream | null;
      if (remoteStream) {
        this._stopStreamTracks(remoteStream);
      }
      rv.srcObject = null;
      delete this.remoteVideoRefs[key];
    }

    Log.colorLog("webrtc", `${key} pull 移除完成`, "info");
  }

  /**
   * 判断远程连接是否存在
   * @param key key
   */
  RemoteConnectIsExist(key: string): boolean {
    return !!this.remotePeers[key];
  }

  /**
   * 停止并关闭推流（关闭 this.peer 与本地流）
   */
  close(): void {
    try {
      if (this.peer) {
        try {
          this.peer.getSenders().forEach(s => s.track?.stop());
        } catch (e) {}
        this.peer.close();
      }
    } catch (e) {
      Log.colorLog("webrtc", `close 出错: ${e}`, "warn");
    } finally {
      this.peer = null;
    }

    // 清理降噪相关资源
    try {
      if (this.noiseSuppressionCleanup) {
        this.noiseSuppressionCleanup();
        this.noiseSuppressionCleanup = null;
      }
      this.audioContext = null;
      this.noiseProcessor = null;
    } catch (e) {
      Log.colorLog("webrtc", `清理降噪资源出错: ${e}`, "warn");
    }

    // 停止本地流与屏幕流
    try {
      this.localVideoTracks.forEach(t => t.stop());
      this.localAudioTracks.forEach(t => t.stop());
      if (this.screenStream) this._stopStreamTracks(this.screenStream);
    } catch (e) {}
    this.localAudioTracks = [];
    this.localVideoTracks = [];
    this.screenStream = null;
    if (this.localVideoRef) this.localVideoRef.srcObject = null;
    Log.colorLog("webrtc", "已完全关闭连接与流", "info");
  }

  /**
   * 设置分辨率（对指定 stream 的 video track 应用约束）
   */
  async handleResolutionRatio(data: {
    frameRate: number;
    width: number;
    height: number;
    stream: MediaStream;
  }): Promise<boolean> {
    const { frameRate, width, height, stream } = data;
    const queue: Promise<void>[] = [];

    stream.getTracks().forEach(track => {
      if (track.kind === "video") {
        queue.push(
          // applyConstraints 返回 Promise<void>
          track.applyConstraints({
            height: { ideal: height },
            width: { ideal: width },
            frameRate: { ideal: frameRate }
          }) as Promise<void>
        );
      }
    });

    try {
      await Promise.all(queue);
      Log.colorLog("webrtc", "设置分辨率成功", "info");
      return true;
    } catch (error) {
      Log.colorLog("webrtc", `设置分辨率失败: ${error}`, "warn");
      return false;
    }
  }

  /**
   * 设置帧率（本质与 handleResolutionRatio 一样）
   */
  async handleMaxFramerate(data: {
    frameRate: number;
    width: number;
    height: number;
    stream: MediaStream;
  }): Promise<boolean> {
    // 复用 handleResolutionRatio 的逻辑
    return this.handleResolutionRatio(data);
  }

  /**
   * 开启/关闭本地摄像头轨道（启用/禁用 video track）
   */
  toggleCamera(enable: boolean): void {
    if (!this.localVideoTracks || this.localVideoTracks.length === 0) {
      Log.colorLog("webrtc", "toggleCamera: 本地 video tracks 为空", "warn");
      return;
    }
    this.localVideoTracks.forEach(track => {
      track.enabled = enable;
    });
  }

  /**
   * 开启/关闭麦克风（启用/禁用 audio track）
   */
  toggleMicrophone(enable: boolean): void {
    if (!this.localAudioTracks || this.localAudioTracks.length === 0) {
      Log.colorLog("webrtc", "toggleMicrophone: 本地 audio tracks 为空", "warn");
      return;
    }
    // 1) 直接启/禁用找到的 track（覆盖缓存与 preview）
    this.localAudioTracks.forEach(t => {
      try {
        t.enabled = enable;
      } catch (e) {
        /* 忽略单 track 错误 */
      }
    });

    // 2) 额外确保 peer 的 sender.track 也被设置（某些实现可能不会反向同步）
    if (this.peer) {
      try {
        this.peer.getSenders().forEach(s => {
          const tr = s.track;
          if (tr && tr.kind === "audio") {
            try {
              tr.enabled = enable;
            } catch (e) {
              /* 忽略 */
            }
          }
        });
      } catch (e) {
        Log.colorLog("webrtc", `toggleMicrophone: peer.getSenders() 处理异常: ${e}`, "warn");
      }
    }
  }

  /**
   * 控制远端 video 的扬声器（通过设置 video 元素的 volume）
   */
  toggleSpeaker(enable: boolean, key: string): void {
    const rv = this.remoteVideoRefs[key];
    if (rv) {
      rv.volume = enable ? 1 : 0;
    } else {
      Log.colorLog("webrtc", `toggleSpeaker: 未找到远端 video 元素 key=${key}`, "warn");
    }
  }

  /**
   * 启用或禁用降噪功能
   * @param enable 是否启用降噪
   */
  setNoiseSuppressionEnabled(enable: boolean): void {
    this.noiseSuppressionEnabled = enable;
    Log.colorLog("webrtc", `降噪功能${enable ? "已启用" : "已禁用"}`, "info");
  }

  /**
   * 获取当前降噪状态
   */
  isNoiseSuppressionEnabled(): boolean {
    return this.noiseSuppressionEnabled;
  }

  /**
   * 获取降噪处理器状态信息
   */
  getNoiseSuppressionStatus(): {
    enabled: boolean;
    initialized: boolean;
    audioContextState?: string;
  } {
    return {
      enabled: this.noiseSuppressionEnabled,
      initialized: this.noiseProcessor !== null,
      audioContextState: this.audioContext?.state
    };
  }

  /**
   * 切换清晰度（720p / 1080p / 1440p）
   * - 先对本地 video track applyConstraints 请求更高分辨率
   * - 然后对对应的 RTCRtpSender 设置 maxBitrate（若支持）
   * - 返回 true 表示尝试完成（不保证网络/设备最终效果）
   */
  public async setQuality(preset: QualityKey): Promise<boolean> {
    const cfg = QUALITY_PRESETS[preset];
    if (!cfg) {
      Log.colorLog("webrtc", `setQuality: unknown preset ${preset}`, "warn");
      return false;
    }

    // 选择当前的本地 video track（优先 screenStream 的 video 若在共享）
    let track: MediaStreamTrack | undefined;
    // 如果正在屏幕共享，优先使用 screenStream 的 video track
    if (this.screenStream) {
      track = this.screenStream.getVideoTracks()[0];
    }
    // 否则使用本地摄像头 video track
    if (!track && this.localVideoTracks && this.localVideoTracks.length > 0) {
      track = this.localVideoTracks.find(t => t.kind === "video");
    }

    if (!track) {
      Log.colorLog("webrtc", "setQuality: 未找到本地 video track 可用", "warn");
      return false;
    }

    // 1) 尝试使用 applyConstraints 提高采集分辨率
    try {
      // 基于设备 capability 做安全约束
      const caps = typeof (track as any).getCapabilities === "function" ? (track as any).getCapabilities() : null;
      const targetWidth = caps?.width?.max ? Math.min(cfg.width, caps.width.max) : cfg.width;
      const targetHeight = caps?.height?.max ? Math.min(cfg.height, caps.height.max) : cfg.height;
      const targetFrameRate = caps?.frameRate?.max ? Math.min(cfg.frameRate, caps.frameRate.max) : cfg.frameRate;

      await track.applyConstraints({
        width: { ideal: targetWidth },
        height: { ideal: targetHeight },
        frameRate: { ideal: targetFrameRate }
      } as any);

      Log.colorLog(
        "webrtc",
        `setQuality: applyConstraints 成功 -> ${preset} (${targetWidth}x${targetHeight}@${targetFrameRate})`,
        "info"
      );
    } catch (err) {
      Log.colorLog("webrtc", `setQuality: applyConstraints 失败，设备可能不支持请求分辨率: ${err}`, "warn");
      // 继续尝试设置编码码率（有时服务器端/浏览器会在编码端做降级）
    }

    // 2) 如果已建立 peer（推流端），设置编码最大码率
    try {
      if (this.peer) {
        // 找到对应 video sender（优先匹配 track）
        let sender = this.peer.getSenders().find(s => s.track === track);
        // 如果没找到，尝试匹配 video sender
        if (!sender) {
          sender = this.peer.getSenders().find(s => s.track && s.track.kind === "video");
        }
        if (sender) {
          const params = sender.getParameters();
          if (!params.encodings) params.encodings = [{}];

          // 设置第一个 encoding 的 maxBitrate（若需要 simulcast/多码率请按 encodings 数组配置）
          params.encodings[0].maxBitrate = QUALITY_PRESETS[preset].bitrate;

          await sender.setParameters(params);
          Log.colorLog(
            "webrtc",
            `setQuality: sender.setParameters 成功，maxBitrate=${params.encodings[0].maxBitrate}`,
            "info"
          );
        } else {
          Log.colorLog("webrtc", "setQuality: 未找到 video sender，无法设置编码参数", "warn");
        }
      } else {
        Log.colorLog("webrtc", "setQuality: peer 未初始化，跳过 setParameters（将在 publish 时生效）", "info");
      }
    } catch (err) {
      Log.colorLog("webrtc", `setQuality: 设置编码参数失败: ${err}`, "warn");
      // 不抛出错误，让方法返回 false 或 true 表示“已尝试”
    }

    // 3) 更新本地缓存的 videoTracks（如果 track 有变化）
    try {
      this.localVideoTracks = this.localVideoTracks.filter(t => t && t.readyState !== "ended");
      if (!this.localVideoTracks.find(t => t === track)) {
        // 把当前 track 放在数组首位（便于后续操作）
        this.localVideoTracks.unshift(track);
      }
    } catch {
      // 忽略
    }

    return true;
  }

  /**
   * 启动屏幕共享（只替换 video track）
   * - 若 peer 不存在：只在本地预览替换（便于在建立连接前设置屏幕）
   * - 若 peer 存在：使用 replaceTrack 替换发送端的 video track（无缝切换）
   */
  async startScreenShare(): Promise<void> {
    try {
      const screen = await this.acquireLocalStream("screen"); // getDisplayMedia
      const screenVideoTrack = screen.getVideoTracks()[0];
      if (!screenVideoTrack) throw new Error("未获取到屏幕 video track");

      // 在本地预览中展示屏幕流
      if (this.localVideoRef) {
        // 合并 audio（若 screen 带 audio），否则保持已有 audio
        const mixed = new MediaStream();
        // 优先使用屏幕的 video
        mixed.addTrack(screenVideoTrack);
        // 如果屏幕带 audio 或者已有本地 audio，则加入 audio track
        if (screen.getAudioTracks().length > 0) {
          screen.getAudioTracks().forEach(t => mixed.addTrack(t));
        } else {
          this.localAudioTracks.forEach(t => mixed.addTrack(t));
        }
        this.localVideoRef.srcObject = mixed;
        this.localVideoRef.play().catch(() => {});
      }

      // 如果没有 peer（还未 publish），只保存 screenStream 供后续 publish 使用
      if (!this.peer) {
        this.screenStream = screen;
        // 保存本地 videoTracks 引用为屏幕流
        this.localVideoTracks = screen.getVideoTracks();
        return;
      }

      // 有 peer：查找 video sender 并 replaceTrack
      await this._replaceSenderTrack("video", screenVideoTrack);

      // 保存 screenStream 引用并绑定 onended 恢复
      this.screenStream = screen;
      screenVideoTrack.addEventListener("ended", () => {
        this.stopScreenShare().catch(() => {});
      });
    } catch (err) {
      Log.colorLog("webrtc", `startScreenShare 失败: ${err}`, "error");
      throw err;
    }
  }

  /**
   * 停止屏幕共享并尝试恢复摄像头轨道（若存在）
   */
  async stopScreenShare(): Promise<void> {
    try {
      if (this.screenStream) {
        this._stopStreamTracks(this.screenStream);
        this.screenStream = null;
      }

      // 如果有摄像头 track 可用并且有 peer，则用摄像头 track 恢复发送端
      const camTrack = this.localVideoTracks?.find(t => t.kind === "video");
      if (camTrack && this.peer) {
        await this._replaceSenderTrack("video", camTrack);
        // 恢复本地预览为摄像头流（如果 localVideoRef 存在）
        if (this.localVideoRef) {
          const m = new MediaStream();
          camTrack && m.addTrack(camTrack);
          this.localAudioTracks.forEach(t => m.addTrack(t));
          this.localVideoRef.srcObject = m;
        }
      } else {
        // 没有摄像头 track，则清空本地预览
        if (this.localVideoRef) {
          this.localVideoRef.srcObject = null;
        }
      }
    } catch (err) {
      Log.colorLog("webrtc", `stopScreenShare 错误: ${err}`, "warn");
      throw err;
    }
  }

  /**
   * 应用RNNoise降噪到音频流
   * @param stream 原始音频流
   * @param enableNoiseSuppression 是否启用降噪
   * @returns 返回处理后的流和控制对象
   */
  async applyNoiseSuppression(
    stream: MediaStream,
    enableNoiseSuppression: boolean = true
  ): Promise<{
    processedStream: MediaStream;
    audioContext: AudioContext;
    processor: AudioWorkletNode | null;
    cleanup: () => void;
  }> {
    if (!enableNoiseSuppression) {
      return {
        processedStream: stream,
        audioContext: null as any,
        processor: null,
        cleanup: () => {}
      };
    }

    try {
      // 创建音频上下文（RNNoise需要48kHz采样率）
      const audioContext = new AudioContext({
        sampleRate: 48000,
        latencyHint: "interactive" // 低延迟模式
      });

      // 确保音频上下文处于运行状态
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      // 加载RNNoise处理器模块
      const processorUrl = new URL("./rnnoise-processor.js", import.meta.url);
      await audioContext.audioWorklet.addModule(processorUrl.href);

      // 创建音频节点
      const source = audioContext.createMediaStreamSource(stream);
      const processor = new AudioWorkletNode(audioContext, "rnnoise-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1, // RNNoise处理单声道
        channelCountMode: "explicit",
        channelInterpretation: "speakers"
      });
      const destination = audioContext.createMediaStreamDestination();

      // 连接音频处理链：源 -> RNNoise处理器 -> 目标
      source.connect(processor);
      processor.connect(destination);

      // 监听处理器消息（用于调试和状态监控）
      processor.port.onmessage = event => {
        if (event.data.type === "status") {
          Log.colorLog("webrtc", `RNNoise状态: ${event.data.message}`, "info");
        } else if (event.data.type === "error") {
          Log.colorLog("webrtc", `RNNoise错误: ${event.data.message}`, "error");
        }
      };

      // 获取处理后的音频轨道
      const processedAudioTracks = destination.stream.getAudioTracks();
      if (processedAudioTracks.length === 0) {
        throw new Error("降噪处理失败：未生成音频轨道");
      }

      // 创建新的MediaStream，包含处理后的音频和原始视频
      const processedStream = new MediaStream();

      // 添加降噪后的音频轨道
      processedAudioTracks.forEach(track => {
        processedStream.addTrack(track);
      });

      // 保持原始视频轨道不变
      stream.getVideoTracks().forEach(track => {
        processedStream.addTrack(track);
      });

      // 清理函数
      const cleanup = () => {
        try {
          source.disconnect();
          processor.disconnect();
          processor.port.close();
          audioContext.close();
          Log.colorLog("webrtc", "RNNoise降噪资源已清理", "info");
        } catch (error) {
          Log.colorLog("webrtc", `清理RNNoise资源时出错: ${error}`, "warn");
        }
      };

      Log.colorLog("webrtc", "RNNoise降噪已成功应用", "info");

      return {
        processedStream,
        audioContext,
        processor,
        cleanup
      };
    } catch (error) {
      Log.colorLog("webrtc", `应用RNNoise降噪失败: ${error}`, "error");
      throw error;
    }
  }

  /**
   * 是否支持 getUserMedia 检查
   */
  private hasUserMedia(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  /**
   * 获取本地流
   * - source: 'camera'（getUserMedia）或 'screen'（getDisplayMedia）
   * - 如果 camera 请求失败且 source='camera'，会尝试回退到 enumerateDevices
   */
  private async acquireLocalStream(source: "camera" | "screen" = "camera"): Promise<MediaStream> {
    if (source === "screen") {
      // 屏幕共享：尽量请求系统音频（浏览器支持有限）
      try {
        const ds = await (navigator.mediaDevices as any).getDisplayMedia?.({ video: true, audio: true });
        // attach onended：当用户通过浏览器停止共享时，自动触发 stopScreenShare 以做恢复
        ds.getVideoTracks()[0]?.addEventListener("ended", () => {
          this.stopScreenShare().catch(() => {});
        });
        this.screenStream = ds;
        return ds;
      } catch (e) {
        Log.colorLog("webrtc", `getDisplayMedia 失败: ${e}`, "warn");
        throw e;
      }
    }

    // camera 逻辑（简化并保留回退）
    const audioConstr = this.webRTCPublishParam.audio ? this.webRTCPublishParam.audio : true;
    const videoConstr = this.webRTCPublishParam.video ? this.webRTCPublishParam.video : true;
    const baseConstraints: MediaStreamConstraints = { audio: audioConstr, video: videoConstr };

    try {
      return await navigator.mediaDevices.getUserMedia(baseConstraints);
    } catch (err: any) {
      Log.colorLog("webrtc", `getUserMedia 失败: ${err?.name}`, "warn");
      // 简要回退：枚举设备并选择第一个可用设备
      if (err?.name === "NotFoundError" || err?.name === "OverconstrainedError") {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevice = devices.find(d => d.kind === "videoinput");
        const audioDevice = devices.find(d => d.kind === "audioinput");
        const fallback: MediaStreamConstraints = {
          video: videoDevice ? { deviceId: { exact: videoDevice.deviceId } } : false,
          audio: audioDevice ? { deviceId: { exact: audioDevice.deviceId } } : false
        };
        return await navigator.mediaDevices.getUserMedia(fallback);
      }
      throw err;
    }
  }

  /**
   * 内部：替换发送者的 track（按 kind 查找 sender 并 replaceTrack）
   * - 若未找到对应 sender，则尝试 addTrack（降级处理）
   */
  private async _replaceSenderTrack(kind: "audio" | "video", newTrack: MediaStreamTrack): Promise<void> {
    if (!this.peer) throw new Error("_replaceSenderTrack: peer 不存在");

    try {
      const sender = this.peer.getSenders().find(s => s.track && s.track.kind === kind);
      if (sender) {
        // replaceTrack 可以接收 null（用于停止发送），这里替换为新 track
        await sender.replaceTrack(newTrack);
        Log.colorLog("webrtc", `_replaceSenderTrack: replaced ${kind} sender`, "info");
      } else {
        // 降级：直接 addTrack（注意：可能产生额外 sender）
        const ms = new MediaStream([newTrack]);
        try {
          this.peer.addTrack(newTrack, ms);
        } catch (e) {
          Log.colorLog("webrtc", `替换/添加 sender 失败: ${e}`, "warn");
        }
      }
    } catch (err) {
      Log.colorLog("webrtc", `_replaceSenderTrack 出错: ${err}`, "warn");
      throw err;
    }
  }

  /** 停止并释放 MediaStream 的所有 track */
  private _stopStreamTracks(stream: MediaStream) {
    try {
      stream.getTracks().forEach(t => {
        try {
          t.stop();
        } catch (e) {}
      });
    } catch (e) {}
  }
}

/**
 * 默认的推流参数（保持原来结构，仅命名为 WebRTCPublishParamDefault）
 * 如果你想在运行时覆盖某些字段，可以在 new WebRTC({...}) 时传入
 */
const WebRTCPublishParamDefault: WebRTCPublishParam = {
  httpPublish: "http://localhost:1985/rtc/v1/publish/",
  httpPlay: "http://localhost:1985/rtc/v1/play/",
  webrtc: "webRTC://localhost/live/",
  audio: {
    echoCancellationType: "system", // browser|system
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

/** 接口类型定义 */
// interface WebRTCAnswer {
//   sdp: any;
//   api: string;
//   streamurl: string;
// }

// interface UserRemoteVideoRef {
//   key: string;
//   remoteVideoRef: HTMLVideoElement;
// }

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
    width: { min: number; ideal: number };
    height: { min: number; ideal: number };
    aspectRatio: number;
  };
}

const QUALITY_PRESETS = {
  "720p": { width: 1280, height: 720, frameRate: 30, bitrate: 1_200_000 }, // 1.2 Mbps
  "1080p": { width: 1920, height: 1080, frameRate: 30, bitrate: 3_000_000 }, // 3 Mbps
  "1440p": { width: 2560, height: 1440, frameRate: 30, bitrate: 5_000_000 } // 5 Mbps
} as const;

type QualityKey = keyof typeof QUALITY_PRESETS;
