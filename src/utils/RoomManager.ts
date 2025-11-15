import Log from "./Log.ts";
import HttpClient from "@/utils/Http.ts"; // 你已有的 Http 客户端（create 返回实例）
/* 全局 SRS SDK 类型（如果没有模块化声明，可在项目中声明这些全局变量或把 SDK 转为模块） */
declare const SrsRtcSignalingAsync: any;
declare const SrsRtcPublisherAsync: any;
declare const SrsRtcPlayerAsync: any;
declare const SrsRtcSignalingParse: any;

/* ======= 类型定义 ======= */

const Http = HttpClient.create({
  baseURL: "",
  defaultHeaders: { "Content-Type": "application/json" },
  timeout: 10000
});

// 推流参数结构（可扩展）
export interface WebRTCPublishParam {
  httpPublish: string; // 用于 publish SDP 交换的 HTTP 接口
  httpPlay: string; // 用于 play SDP 交换的 HTTP 接口
  webrtc: string; // webrtc base url，例如: "webrtc://127.0.0.1/live/"
  audio?: MediaTrackConstraints | boolean | any; // 本地 audio constraints/config
  video?: MediaTrackConstraints | boolean | any; // 本地 video constraints/config
}

// 房间参与者信息（简单）
export interface Participant {
  display: string;
  publishing?: boolean;

  [k: string]: any;
}

// 房间事件回调集合
export interface RoomManagerEvents {
  onLog?: (level: "info" | "warn" | "error" | "trace", msg: string) => void;
  onSignalingNotify?: (msg: any) => void;
  onParticipantJoin?: (participant: Participant) => void;
  onParticipantLeave?: (display: string) => void;
  onPublished?: (display: string) => void;
  onUnpublished?: (display: string) => void;
  onLocalStream?: (stream: MediaStream | null) => void;
  onRemoteStream?: (display: string, stream: MediaStream | null) => void;
}

/* ======= 默认参数 ======= */
const WebRTCPublishParamDefault: WebRTCPublishParam = {
  httpPublish: "http://localhost:1985/rtc/v1/publish/",
  httpPlay: "http://localhost:1985/rtc/v1/play/",
  webrtc: "webrtc://localhost/live/",
  audio: true,
  video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
};

/* ======= RoomManager 类 ======= */
export default class RoomManager {
  // signaling & peers
  private sig: any | null = null;
  private publisher: any | null = null; // SrsRtcPublisherAsync
  private remotePeers: Record<string, any> = {}; // key -> RTCPeerConnection (SrsRtcPlayerAsync wrapper)
  // DOM video elements
  private localVideoEl: HTMLVideoElement | null = null;
  private remoteVideoEls: Record<string, HTMLVideoElement | null> = {};
  // local media
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  // config
  private publishParam: WebRTCPublishParam;
  private rtcConfig: RTCConfiguration;
  private events: RoomManagerEvents;
  // room state
  private roomName = "";
  private display = "";
  private joined = false;

  constructor(
    publishParam: WebRTCPublishParam = WebRTCPublishParamDefault,
    rtcConfig: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] },
    events: RoomManagerEvents = {}
  ) {
    this.publishParam = { ...WebRTCPublishParamDefault, ...publishParam };
    this.rtcConfig = rtcConfig;
    this.events = events;
  }

  /**
   * joinRoom - 连接 signaling 并加入房间
   * @param urlHost 远端 srs host（例如 conf.host）
   * @param room 房间名
   * @param display 自己的显示名
   */
  async joinRoom(urlHost: string, room: string, display: string): Promise<void> {
    if (this.joined) {
      this.log("warn", "已加入房间，忽略重复 join 请求");
      return;
    }
    this.roomName = room;
    this.display = display;

    // 创建并连接 signaling
    try {
      this.sig && this.sig.close?.();
    } catch (e) {
    }
    this.sig = new SrsRtcSignalingAsync();

    // 处理 signaling 回调
    this.sig.onmessage = (msg: any) => {
      this.log("trace", `signaling notify ${JSON.stringify(msg)}`);
      this.events.onSignalingNotify?.(msg);

      if (msg.event === "publish" && msg.peer?.publishing) {
        // 新的发布者，自动订阅（但避免订阅自己）
        if (msg.peer.display && msg.peer.display !== this.display) {
          this.log("info", `检测到新发布者 ${msg.peer.display}，尝试订阅`);
          this.startPlay(msg.peer.display).catch(err => {
            this.log("error", `自动订阅 ${msg.peer.display} 失败: ${err}`);
          });
        }
      }

      // 参与者 join/leave 清理
      if (msg.event === "join" || msg.event === "leave") {
        const alive: Record<string, boolean> = {};
        (msg.participants || []).forEach((p: Participant) => (alive[p.display] = true));
        Object.keys(this.remotePeers).forEach(k => {
          if (!alive[k]) {
            // 远端已离开
            this.log("info", `参与者 ${k} 离开，清理`);
            this.removePlay(k);
            this.events.onParticipantLeave?.(k);
          }
        });
      }
    };

    // conf 参数解析（保留原始 demo 的 parse 行为）
    const conf =
      typeof SrsRtcSignalingParse === "function"
        ? SrsRtcSignalingParse(window.location)
        : { wsSchema: "ws", wsHost: urlHost };

    // connect
    try {
      await this.sig.connect(conf.wsSchema, conf.wsHost, room, display);
      const r0 = await this.sig.send({ action: "join", room, display });
      this.log("info", `signaling join ok: ${JSON.stringify(r0?.participants?.length || 0)} participants`);
      this.joined = true;

      // 如果房间已有发布者，则订阅他们
      (r0.participants || []).forEach((p: Participant) => {
        if (p.display !== display && p.publishing) {
          this.startPlay(p.display).catch(e => {
            this.log("warn", `自动 play ${p.display} 失败: ${e}`);
          });
        }
      });
    } catch (err) {
      this.log("error", `joinRoom 失败: ${err}`);
      throw err;
    }
  }

  /* ---------- 信令与房间管理 ---------- */

  /**
   * leaveRoom - 离开房间并释放全部资源
   */
  async leaveRoom(): Promise<void> {
    try {
      if (this.sig) {
        try {
          await this.sig.send({ action: "leave", room: this.roomName, display: this.display });
        } catch (e) {
        }
        try {
          this.sig.close();
        } catch (e) {
        }
        this.sig = null;
      }
    } finally {
      // 清理所有
      this._cleanupPublisher();
      Object.keys(this.remotePeers).forEach(k => this.removePlay(k));
      this._stopLocalStream();
      this.joined = false;
      this.log("info", "已离开房间并清理资源");
    }
  }

  /**
   * startPublish - 从摄像头/麦克风获取本地流并发布
   * @param localVideoEl 本地预览 video 元素（可选）
   * @param constraints 可选的覆盖约束（audio/video）
   */
  async startPublish(localVideoEl?: HTMLVideoElement | null, constraints?: MediaStreamConstraints): Promise<void> {
    if (!this.joined) throw new Error("未加入房间，请先 joinRoom");
    this.localVideoEl = localVideoEl ?? this.localVideoEl ?? null;

    // 获取本地流（优先使用提供的 constraints，否则使用 publishParam）
    const baseConstraints: MediaStreamConstraints = constraints ?? {
      audio: this.publishParam.audio ?? true,
      video: this.publishParam.video ?? true
    };

    try {
      // 若已有 screenStream（桌面共享）则合并（可发布屏幕及音频）
      const stream = await navigator.mediaDevices.getUserMedia(baseConstraints);
      this._attachLocalStream(stream);
      // 创建 publisher（SrsRtcPublisherAsync），并与本地流绑定
      if (this.publisher) {
        try {
          this.publisher.close();
        } catch (e) {
        }
        this.publisher = null;
      }
      this.publisher = new SrsRtcPublisherAsync();
      if (this.localVideoEl) {
        try {
          this.localVideoEl.srcObject = this.localStream;
          this.localVideoEl.play().catch(() => {
          });
        } catch (e) {
        }
      }

      // 创建 offer（内部 Publisher 类可能封装 createOffer/setLocalDescription）
      // 为兼容性，我们走与页面相同的 HTTP SDP 交换流程。
      // 我们不直接操控 SrsRtcPublisherAsync internals，保持相同的外部行为：
      //  - publisher.publish(url) -> 内部进行 SDP/SDPAnswer 交换（如果 SDK 支持）
      // 如果 SDK 不包含 publish(url) 的包装，你也可手动 createOffer + Http.post。
      const url = this.publishParam.webrtc + this.display;
      // 兼容：如果 publisher 对象提供 publish(url) 使用它，否则走 manual sdp path
      if (typeof this.publisher.publish === "function") {
        await this.publisher.publish(url);
        this.log("info", "调用 publisher.publish 成功");
      } else {
        // fallback: manual createOffer/setLocalDescription + Http.post
        const pc = new RTCPeerConnection(this.rtcConfig);
        // add local tracks
        this.localStream?.getTracks().forEach(t => {
          try {
            pc.addTrack(t, this.localStream as MediaStream);
          } catch (e) {
          }
        });
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const data: any = await Http.post(this.publishParam.httpPublish, {
          api: this.publishParam.httpPublish,
          streamurl: url,
          sdp: offer.sdp
        });
        await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: data.sdp }));
        // we won't keep this pc (publisher SDK usually handles it), close after setRemoteDescription
        try {
          pc.close();
        } catch (e) {
        }
        this.log("info", "manual publish SDP 交换完成（fallback）");
      }

      this.log("info", "publish 完成");
      this.events.onPublished?.(this.display);
    } catch (err: any) {
      this.log("error", `startPublish 失败: ${err?.message ?? err}`);
      throw err;
    }
  }

  /* ---------- 发布（推流） ---------- */

  /**
   * stopPublish - 停止推流并释放本地发布资源（但不离开房间）
   */
  async stopPublish(): Promise<void> {
    this._cleanupPublisher();
    this._stopLocalStream();
    this.events.onLocalStream?.(null);
    this.log("info", "stopPublish 完成");
  }

  /**
   * startPlay - 订阅某个 display 的流并把流绑定到 video 元素
   * @param displayKey 远端 display 名
   * @param videoEl 绑定的 HTMLVideoElement（可选，后续可 setRemoteVideoEl）
   */
  async startPlay(displayKey: string, videoEl?: HTMLVideoElement | null): Promise<void> {
    if (!this.joined) throw new Error("未加入房间，请先 joinRoom");
    if (this.remotePeers[displayKey]) {
      this.log("warn", `已经在播放 ${displayKey}`);
      if (videoEl) this.remoteVideoEls[displayKey] = videoEl;
      return;
    }
    if (videoEl) this.remoteVideoEls[displayKey] = videoEl;

    // 创建 SrsRtcPlayerAsync 实例（或手动 pc）
    const player = new SrsRtcPlayerAsync();
    this.remotePeers[displayKey] = player;

    // 创建接收 stream 并绑定到 video 元素
    const stream = new MediaStream();
    const rv = this.remoteVideoEls[displayKey] ?? null;

    // 当 SDK 提供 stream 时直接绑定；否则监听 player.ontrack（页面示例）
    if (player.stream) {
      // SDK 已经暴露 stream
      if (rv) {
        try {
          rv.srcObject = player.stream;
          rv.play().catch(() => {
          });
        } catch (e) {
        }
      }
      this.events.onRemoteStream?.(displayKey, player.stream);
    } else {
      // 兼容页面的 ontrack 回调
      player.ontrack = (ev: RTCTrackEvent) => {
        try {
          stream.addTrack(ev.track);
          if (rv) {
            rv.srcObject = stream;
            rv.play().catch(() => {
            });
          }
          this.events.onRemoteStream?.(displayKey, stream);
        } catch (e) {
          this.log("warn", `ontrack 处理失败 ${e}`);
        }
      };
    }

    // 连接并交换 SDP（与页面逻辑一致）
    try {
      const url = this.publishParam.webrtc + displayKey;
      if (typeof player.play === "function") {
        await player.play(url);
        this.log("info", `player.play(${displayKey}) 成功`);
      } else {
        // fallback manual sdp
        const pc = new RTCPeerConnection(this.rtcConfig);
        pc.addTransceiver("audio", { direction: "recvonly" });
        pc.addTransceiver("video", { direction: "recvonly" });
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const data: any = await Http.post(this.publishParam.httpPlay, {
          api: this.publishParam.httpPlay,
          streamurl: url,
          sdp: offer.sdp
        });
        await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: data.sdp }));
        // attach ontrack
        pc.ontrack = ev => {
          try {
            stream.addTrack(ev.track);
            if (rv) {
              rv.srcObject = stream;
              rv.play().catch(() => {
              });
            }
            this.events.onRemoteStream?.(displayKey, stream);
          } catch (e) {
          }
        };
        // keep pc so removePlay 可关闭
        this.remotePeers[displayKey] = pc;
      }
    } catch (err) {
      this.log("error", `startPlay ${displayKey} 失败: ${err}`);
      // 清理
      this.removePlay(displayKey);
      throw err;
    }
  }

  /* ---------- 订阅（拉流） ---------- */

  /**
   * removePlay - 移除并关闭某个玩家的连接（并释放 video 的流）
   */
  removePlay(displayKey: string): void {
    const peer = this.remotePeers[displayKey];
    if (peer) {
      try {
        // SDK wrapper 或 RTCPeerConnection
        if (typeof peer.close === "function") peer.close();
        else (peer as RTCPeerConnection).close?.();
      } catch (e) {
        this.log("warn", `关闭 remote peer ${displayKey} 出错: ${e}`);
      } finally {
        delete this.remotePeers[displayKey];
      }
    }

    // 清理 video 元素流
    const rv = this.remoteVideoEls[displayKey];
    if (rv && rv.srcObject) {
      const st = rv.srcObject as MediaStream;
      this._stopStreamTracks(st);
      rv.srcObject = null;
    }
    delete this.remoteVideoEls[displayKey];
    this.events.onRemoteStream?.(displayKey, null);
    this.log("info", `${displayKey} pull 已移除`);
  }

  /**
   * muteLocalAudio - 静音/取消静音（麦克风）
   */
  muteLocalAudio(mute: boolean): void {
    if (!this.localStream) {
      this.log("warn", "本地流为空，无法静音");
      return;
    }
    this.localStream.getAudioTracks().forEach(t => (t.enabled = !mute));
    this.log("info", `本地麦克风 ${mute ? "已静音" : "已取消静音"}`);
  }

  /* ---------- 媒体控制 ---------- */

  /**
   * muteLocalVideo - 关闭/开启本地摄像头（仅禁用 track，不停止 track）
   */
  muteLocalVideo(disable: boolean): void {
    if (!this.localStream) {
      this.log("warn", "本地流为空，无法操作摄像头");
      return;
    }
    this.localStream.getVideoTracks().forEach(t => (t.enabled = !disable));
    this.log("info", `本地摄像头 ${disable ? "已关闭" : "已开启"}`);
  }

  /**
   * switchCamera - 切换到指定 deviceId（摄像头）
   */
  async switchCamera(deviceId: string): Promise<void> {
    if (!deviceId) throw new Error("deviceId 为空");
    // 先停止现有 video tracks（仅停止 track，不关闭 audio）
    try {
      const audio = !!this.publishParam.audio;
      const newStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } }, audio });
      // 替换本地流的视频轨道：对已有 track 用 RTCRtpSender.replaceTrack 或直接停止并 addTrack
      this._replaceLocalVideoTrack(newStream);
      this.log("info", `已切换摄像头 deviceId=${deviceId}`);
    } catch (err) {
      this.log("error", `switchCamera 失败: ${err}`);
      throw err;
    }
  }

  /**
   * switchMicrophone - 切换麦克风设备
   */
  async switchMicrophone(deviceId: string): Promise<void> {
    if (!deviceId) throw new Error("deviceId 为空");
    try {
      const video = !!this.publishParam.video;
      const newStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } }, video });
      // 替换本地流的 audio track
      this._replaceLocalAudioTrack(newStream);
      this.log("info", `已切换麦克风 deviceId=${deviceId}`);
    } catch (err) {
      this.log("error", `switchMicrophone 失败: ${err}`);
      throw err;
    }
  }

  /**
   * setResolution - 对本地 video track 应用约束（applyConstraints）
   */
  async setResolution(options: { width?: number; height?: number; frameRate?: number }): Promise<boolean> {
    if (!this.localStream) {
      this.log("warn", "本地流为空，无法设置分辨率");
      return false;
    }
    const promises: Promise<void>[] = [];
    this.localStream.getVideoTracks().forEach(track => {
      const cons: any = {};
      if (options.width) cons.width = { ideal: options.width };
      if (options.height) cons.height = { ideal: options.height };
      if (options.frameRate) cons.frameRate = { ideal: options.frameRate };
      try {
        promises.push(track.applyConstraints(cons) as Promise<void>);
      } catch (e) {
        this.log("warn", `applyConstraints 同步失败: ${e}`);
      }
    });

    try {
      await Promise.all(promises);
      this.log("info", "setResolution 成功");
      return true;
    } catch (e) {
      this.log("warn", `setResolution 出错: ${e}`);
      return false;
    }
  }

  /**
   * startScreenShare - 开始桌面共享（兼容浏览器）
   */
  async startScreenShare(videoEl?: HTMLVideoElement | null): Promise<void> {
    try {
      // 某些平台（如 Electron/Tauri）需要不同 API，这里以浏览器标准为主
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: false });
      this.screenStream = stream;
      // 若要把屏幕流与本地麦克风合并，需要 create a mixed stream
      // 简单策略：若已有 localStream，则把 screen 的 video track 替换 localStream 的 video track
      if (this.localStream) {
        this._replaceLocalVideoTrack(stream);
      } else {
        // 没有本地流，则把 screen 作为本地流并绑定到本地 video 元素（如果提供）
        this._attachLocalStream(stream);
      }
      // 将画面预览到视频元素
      if (videoEl) {
        try {
          videoEl.srcObject = stream;
          videoEl.play().catch(() => {
          });
        } catch (e) {
        }
      } else if (this.localVideoEl) {
        try {
          this.localVideoEl.srcObject = stream;
          this.localVideoEl.play().catch(() => {
          });
        } catch (e) {
        }
      }
      // 监听 stop 事件（用户在共享工具栏点击停止）
      stream.getVideoTracks().forEach((t: any) => {
        t.onended = () => {
          this.log("info", "屏幕共享停止");
          this.stopScreenShare();
        };
      });
      this.log("info", "开始屏幕共享");
    } catch (err) {
      this.log("error", `startScreenShare 失败: ${err}`);
      throw err;
    }
  }

  /* ---------- 桌面共享 ---------- */

  /**
   * stopScreenShare - 停止桌面共享并恢复原本地摄像头（如果有）
   */
  async stopScreenShare(): Promise<void> {
    if (this.screenStream) {
      this._stopStreamTracks(this.screenStream);
      this.screenStream = null;
    }
    // 若之前有摄像头流（localStream 原本有 video track 的情况下），尝试重新获取摄像头或保留原来 videoTrack
    // 最安全的做法是重新获取 getUserMedia（但这会再次弹窗），这里尝试不重新弹窗，仅记录事件并让用户自行重启 publish
    this.log("info", "stopScreenShare 已执行，若需恢复摄像头请调用 startPublish 或 switchCamera");
  }

  /**
   * setRemoteVideoEl - 外部组件可在任何时刻把 video 元素绑定到某个 display
   */
  setRemoteVideoEl(displayKey: string, el: HTMLVideoElement | null) {
    this.remoteVideoEls[displayKey] = el;
    // 如果已有 stream，立即绑定
    const peer = this.remotePeers[displayKey];
    if (peer) {
      if ((peer as any).stream && el) {
        try {
          el.srcObject = (peer as any).stream;
          el.play().catch(() => {
          });
        } catch (e) {
        }
      }
    }
  }

  /* ---------- 辅助与清理 ---------- */

  /**
   * setLocalVideoEl - 绑定/替换本地预览元素
   */
  setLocalVideoEl(el: HTMLVideoElement | null) {
    this.localVideoEl = el;
    if (el && this.localStream) {
      try {
        el.srcObject = this.localStream;
        el.play().catch(() => {
        });
      } catch (e) {
      }
    }
  }

  /**
   * RemoteConnectIsExist - 判断某个远端连接是否存在
   */
  remoteConnectIsExist(displayKey: string): boolean {
    return !!this.remotePeers[displayKey];
  }

  /* ---------- 内部日志辅助 ---------- */
  private log(level: "info" | "warn" | "error" | "trace", msg: string) {
    // 调用外部 Log，并且触发回调
    try {
      if (level === "error") Log.prettyError?.("RoomManager", msg);
      else if (level === "warn") Log.colorLog?.("RoomManager", msg, "warn");
      else Log.prettyInfo?.("RoomManager", msg);
    } catch (e) {
    }
    this.events.onLog?.(level, msg);
  }

  /* ---------- 私有工具函数 ---------- */

  // attach stream 为 localStream，并触发绑定到 DOM 与回调
  private _attachLocalStream(stream: MediaStream) {
    // 若已有 localStream，先合并 audio（避免覆盖麦克风）
    if (this.localStream && this.localStream !== stream) {
      // 合并：优先保留已有的 audio tracks（若新 stream 有 video 但没有 audio），否则合并 track
      stream.getAudioTracks().forEach(t => this.localStream?.addTrack(t));
      stream.getVideoTracks().forEach(t => {
        // 替换旧 video track
        this.localStream?.getVideoTracks().forEach(old => {
          try {
            old.stop();
          } catch (e) {
          }
          try {
            (this.localStream as MediaStream).removeTrack(old);
          } catch (e) {
          }
        });
        this.localStream?.addTrack(t);
      });
    } else {
      this.localStream = stream;
    }

    if (this.localVideoEl) {
      try {
        this.localVideoEl.srcObject = this.localStream;
        this.localVideoEl.play().catch(() => {
        });
      } catch (e) {
      }
    }
    this.events.onLocalStream?.(this.localStream);
  }

  // 替换本地 video track（用于 switchCamera / screenShare）
  private _replaceLocalVideoTrack(fromStream: MediaStream) {
    const newVideoTrack = fromStream.getVideoTracks()[0];
    if (!newVideoTrack) return;
    // replace in RTCRtpSender if possible
    if (this.publisher && typeof this.publisher.getPeerConnection === "function") {
      try {
        const pc: RTCPeerConnection = this.publisher.getPeerConnection();
        pc.getSenders().forEach(sender => {
          if (sender.track && sender.track.kind === "video") {
            sender.replaceTrack(newVideoTrack).catch(() => {
              // fallback replace: stop + addTrack
              try {
                sender.track?.stop();
                pc.removeTrack(sender);
                pc.addTrack(newVideoTrack, this.localStream as MediaStream);
              } catch (e) {
              }
            });
          }
        });
      } catch (e) {
        // 无法通过 publisher 获取 pc，fallback：停止旧 video track 并 addTrack 到 localStream
        this.localStream?.getVideoTracks().forEach(t => {
          try {
            t.stop();
            this.localStream?.removeTrack(t);
          } catch (e) {
          }
        });
        try {
          this.localStream?.addTrack(newVideoTrack);
        } catch (e) {
        }
      }
    } else {
      // 无 publisher 情况，直接替换
      this.localStream?.getVideoTracks().forEach(t => {
        try {
          t.stop();
          this.localStream?.removeTrack(t);
        } catch (e) {
        }
      });
      try {
        this.localStream?.addTrack(newVideoTrack);
      } catch (e) {
      }
    }

    // 绑定到本地预览
    if (this.localVideoEl) {
      try {
        this.localVideoEl.srcObject = this.localStream;
        this.localVideoEl.play().catch(() => {
        });
      } catch (e) {
      }
    }
    this.events.onLocalStream?.(this.localStream);
  }

  // 替换本地 audio track（switchMicrophone）
  private _replaceLocalAudioTrack(fromStream: MediaStream) {
    const newAudioTrack = fromStream.getAudioTracks()[0];
    if (!newAudioTrack) return;
    if (this.publisher && typeof this.publisher.getPeerConnection === "function") {
      try {
        const pc: RTCPeerConnection = this.publisher.getPeerConnection();
        pc.getSenders().forEach(sender => {
          if (sender.track && sender.track.kind === "audio") {
            sender.replaceTrack(newAudioTrack).catch(() => {
              try {
                sender.track?.stop();
                pc.removeTrack(sender);
                pc.addTrack(newAudioTrack, this.localStream as MediaStream);
              } catch (e) {
              }
            });
          }
        });
      } catch (e) {
        this.localStream?.getAudioTracks().forEach(t => {
          try {
            t.stop();
            this.localStream?.removeTrack(t);
          } catch (e) {
          }
        });
        try {
          this.localStream?.addTrack(newAudioTrack);
        } catch (e) {
        }
      }
    } else {
      this.localStream?.getAudioTracks().forEach(t => {
        try {
          t.stop();
          this.localStream?.removeTrack(t);
        } catch (e) {
        }
      });
      try {
        this.localStream?.addTrack(newAudioTrack);
      } catch (e) {
      }
    }
    this.events.onLocalStream?.(this.localStream);
  }

  // 停止并清空本地流
  private _stopLocalStream() {
    if (this.localStream) {
      this._stopStreamTracks(this.localStream);
      this.localStream = null;
      if (this.localVideoEl) {
        try {
          this.localVideoEl.srcObject = null;
        } catch (e) {
        }
      }
    }
  }

  // 清理 publisher
  private _cleanupPublisher() {
    if (this.publisher) {
      try {
        this.publisher.close?.();
      } catch (e) {
        this.log("warn", `关闭 publisher 出错: ${e}`);
      }
      this.publisher = null;
      this.log("info", "publisher 已清理");
    }
  }

  // 停止并释放 stream 内所有 tracks
  private _stopStreamTracks(stream: MediaStream) {
    try {
      stream.getTracks().forEach(t => {
        try {
          t.stop();
        } catch (e) {
        }
      });
    } catch (e) {
    }
  }
}
