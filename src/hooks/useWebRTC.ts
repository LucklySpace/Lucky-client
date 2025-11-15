import { ref, shallowReactive } from "vue";
import HttpClient from "@/utils/Http.ts";
import { useLogger } from "./useLogger";

// 创建实例，配置 baseURL、默认头与超时
const Http = HttpClient.create({
  baseURL: "",
  defaultHeaders: { "Content-Type": "application/json" },
  timeout: 10000
});

/**
 * https://blog.csdn.net/weixin_44341110/article/details/132319958
 *
 * WebRTC 推流/拉流 Hook
 */
export function useWebRTC(webRTCPublishParam: WebRTCPublishParam = defaultPublishParam) {
  // 日志
  const log = useLogger();

  // 本地 RTCPeerConnection 实例
  const peer = ref<RTCPeerConnection | null>(null);
  // 远程 RTCPeerConnection 集合
  const remotePeers = shallowReactive<Record<string, RTCPeerConnection>>({});

  // 本地视频元素引用
  const localVideoRef = ref<HTMLVideoElement | null>(null);
  // 远程视频元素引用集合
  const remoteVideoRefs = shallowReactive<Record<string, HTMLVideoElement>>({});

  // 本地音视频轨道
  const localAudioTracks = ref<MediaStreamTrack[]>([]);
  const localVideoTracks = ref<MediaStreamTrack[]>([]);

  /**
   * 推流
   * @param key 流 key
   * @param videoEl 本地视频元素
   */
  async function publish(key: string, videoEl: HTMLVideoElement): Promise<void> {
    if (!hasUserMedia()) {
      log.prettyInfo("webrtc", "不支持获取视频,请检查摄像头配置");
      return;
    }
    // 已存在推流
    if (peer.value) {
      log.prettyInfo("webrtc", "已开始推流");
      return;
    }

    try {
      localVideoRef.value = videoEl;
      const httpURL = webRTCPublishParam.httpPublish;
      const webrtcURL = `${webRTCPublishParam.webrtc}${key}`;
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: webRTCPublishParam.audio,
        video: webRTCPublishParam.video
      });

      // 获取轨道并绑定本地预览
      localAudioTracks.value = localStream.getAudioTracks();
      localVideoTracks.value = localStream.getVideoTracks();
      localVideoRef.value.srcObject = localStream;
      localVideoRef.value.volume = webRTCPublishParam.audio.volume;

      // 创建连接并添加轨道
      peer.value = new RTCPeerConnection();
      peer.value.addTransceiver("audio", { direction: "recvonly" });
      peer.value.addTransceiver("video", { direction: "recvonly" });
      localStream.getTracks().forEach(track => peer.value?.addTrack(track, localStream));

      // SDP 交换
      const offer = await peer.value.createOffer();
      await peer.value.setLocalDescription(offer);
      Http.post(httpURL, { api: httpURL, streamurl: webrtcURL, sdp: offer.sdp }).then(async (data: any) => {
        log.prettyInfo("webrtc", "publish推流成功");
        peer.value?.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: data.sdp }));
      }).catch(err => {
        log.prettyError("webrtc", `publish SDP交换失败:${err}`);
      });
      // HTTPClient(httpURL, { api: httpURL, streamurl: webrtcURL, sdp: offer.sdp })
      //     .then(async (data: WebRTCAnswer) => {
      //         log.prettyInfo('webrtc', 'publish推流成功');
      //         peer.value?.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp }));
      //     })
      //     .catch(err => {
      //         log.prettyError('webrtc', `publish SDP交换失败:${err}`);
      //     });
    } catch (error) {
      log.prettyInfo("webrtc", `publish推流过程出现错误: ${error}`);
    }
  }

  /**
   * 拉流
   * @param key 流 key
   * @param videoEl 远程视频元素
   */
  async function pull(key: string, videoEl: HTMLVideoElement): Promise<void> {
    if (remotePeers[key] && remoteVideoRefs[key]) {
      log.prettyInfo("webrtc", `${key} pull已经推流`);
      return;
    }
    remoteVideoRefs[key] = videoEl;

    try {
      const httpURL = webRTCPublishParam.httpPlay;
      const webrtcURL = `${webRTCPublishParam.webrtc}${key}`;
      const pc = new RTCPeerConnection();
      remotePeers[key] = pc;
      const stream = new MediaStream();
      remoteVideoRefs[key].srcObject = stream;

      pc.ontrack = (event: RTCTrackEvent) => {
        stream.addTrack(event.track);
      };
      pc.addTransceiver("audio", { direction: "recvonly" });
      pc.addTransceiver("video", { direction: "recvonly" });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      Http.post(httpURL, { api: httpURL, streamurl: webrtcURL, sdp: offer.sdp }).then(async (data: any) => {
        log.prettyInfo("webrtc", "拉流成功");
        pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: data.sdp }));
      }).catch(err => {
        log.prettyError("webrtc", `pull SDP交换失败:${err}`);
      });
      // HTTPClient(httpURL, { api: httpURL, streamurl: webrtcURL, sdp: offer.sdp })
      //     .then((data: WebRTCAnswer) => {
      //         log.prettyInfo('webrtc', '拉流成功');
      //         pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp }));
      //     })
      //     .catch(err => {
      //         log.prettyError('webrtc', `pull SDP交换失败:${err}`);
      //     });
    } catch (err) {
      log.prettyError("webrtc", `pull 拉流过程出现错误:${err}`);
    }
  }

  /**
   * 移除并关闭拉流
   */
  function removePull(key: string): void {
    const pc = remotePeers[key];
    if (pc) {
      pc.getSenders().forEach(sender => sender.track?.stop());
      pc.close();
      delete remotePeers[key];
      log.prettyInfo("webrtc", `${key} pull已移除`);
    }
    const videoEl = remoteVideoRefs[key];
    if (videoEl && videoEl.srcObject) {
      (videoEl.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoEl.srcObject = null;
      delete remoteVideoRefs[key];
    }
  }

  /** 关闭推流 */
  function close(): void {
    if (peer.value) {
      peer.value.getSenders().forEach((s: RTCRtpSender) => s.track?.stop());
      peer.value.close();
      peer.value = null;
      log.prettyInfo("webrtc", "推流已停止");
    }
    if (localVideoRef.value?.srcObject) {
      (localVideoRef.value.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      localVideoRef.value.srcObject = null;
    }
  }

  /** 开启/关闭摄像头 */
  function toggleCamera(enable: boolean) {
    localVideoTracks.value.forEach(track => (track.enabled = enable));
  }

  /** 开启/关闭麦克风 */
  function toggleMicrophone(enable: boolean) {
    localAudioTracks.value.forEach(track => (track.enabled = enable));
  }

  /** 开启/关闭扬声器 */
  function toggleSpeaker(enable: boolean, key: string) {
    const videoEl = remoteVideoRefs[key];
    if (videoEl) videoEl.volume = enable ? 1 : 0;
  }

  /** 判断远程连接是否存在 */
  function RemoteConnectIsExist(key: string): boolean {
    return !!remotePeers[key];
  }

  /** 设置分辨率 */
  async function handleResolutionRatio(params: ConstraintParams): Promise<boolean> {
    const { frameRate, width, height, stream } = params;
    const queue: Promise<any>[] = [];
    stream.getTracks().forEach(track => {
      if (track.kind === "video") {
        queue.push(track.applyConstraints({
          width: { ideal: width },
          height: { ideal: height },
          frameRate: { ideal: frameRate }
        }));
      }
    });
    try {
      await Promise.all(queue);
      return true;
    } catch (err) {
      log.prettyError("webrtc", `设置分辨率失败:${err}`);
      return false;
    }
  }

  /** 设置帧率 */
  async function handleMaxFramerate(params: ConstraintParams): Promise<boolean> {
    return handleResolutionRatio(params);
  }

  function hasUserMedia(): boolean {
    return !!navigator.mediaDevices.getUserMedia;
  }

  return {
    publish,
    pull,
    removePull,
    close,
    toggleCamera,
    toggleMicrophone,
    toggleSpeaker,
    RemoteConnectIsExist,
    handleResolutionRatio,
    handleMaxFramerate,
    localVideoRef,
    remoteVideoRefs
  };
}

// 参数定义
interface WebRTCPublishParam {
  httpPublish: string;
  httpPlay: string;
  webrtc: string;
  audio: any;
  video: any;
}

//interface WebRTCAnswer { api: string; streamurl: string; sdp: any; }
interface ConstraintParams {
  frameRate: number;
  width: number;
  height: number;
  stream: MediaStream;
}

// 默认参数
const defaultPublishParam: WebRTCPublishParam = {
  httpPublish: "http://localhost:1985/rtc/v1/publish/",
  httpPlay: "http://localhost:1985/rtc/v1/play/",
  webrtc: "webRTC://localhost/live/",
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

// 简易 HTTP 客户端
// const HTTPClient = (url: string, data: WebRTCAnswer) => {
//     return new Promise<any>((resolve, reject) => {
//         const xhr = new XMLHttpRequest();
//         xhr.open('POST', url, true);
//         xhr.setRequestHeader('Content-Type', 'application/json');
//         xhr.send(JSON.stringify(data));
//         xhr.onload = () => {
//             if (xhr.readyState !== XMLHttpRequest.DONE) reject(xhr);
//             if (xhr.status !== 200 && xhr.status !== 201) reject(xhr);
//             const resp = JSON.parse(xhr.responseText);
//             if (resp.code === 0) resolve(resp);
//             else reject(resp);
//         };
//     });
// };

