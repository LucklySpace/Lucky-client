import { ref } from "vue";

export function useAudioPlayer() {
  // 缓存 Audio 实例
  const audios = new Map<AudioEnum, HTMLAudioElement>();
  // 循环播放的定时器 ID
  const loopTimers = new Map<AudioEnum, number>();
  // 上次单次播放时间戳（1s 限频）
  const lastPlayTime = ref(0);

  // 组件卸载时，自动停止所有循环，释放资源
  function clear() {
    loopTimers.forEach((_, tip) => stopLoop(tip));
    audios.clear();
    lastPlayTime.value = 0;
  }

  /** 获取或创建 Audio 元素 */
  function getAudio(tip: AudioEnum) {
    if (!audios.has(tip)) {
      const url = new URL(audioSrcMap[tip], import.meta.url).href;
      const audio = new Audio(url);
      audio.preload = "auto";
      audios.set(tip, audio);
    }
    return audios.get(tip)!;
  }

  /**
   * 播放一次提示音（1s 内限频）
   */
  function play(tip: AudioEnum) {
    const now = Date.now();
    if (now - lastPlayTime.value < 1000) return;
    lastPlayTime.value = now;

    const audio = getAudio(tip);
    audio.currentTime = 0;
    audio.play().catch(e => {
      console.error("[useAudioPlayerStandalone] play error", e);
    });
  }

  /**
   * 循环播放提示音，可传入持续时长（毫秒），不传则无限循环
   */
  function playLoop(tip: AudioEnum, duration?: number) {
    stopLoop(tip); // 先清理已有

    const audio = getAudio(tip);
    audio.loop = true;
    audio.currentTime = 0;
    audio.play().catch(e => {
      console.error("[useAudioPlayerStandalone] playLoop error", e);
    });

    if (duration != null) {
      const timer = window.setTimeout(() => {
        stopLoop(tip);
      }, duration);
      loopTimers.set(tip, timer);
    }
  }

  /**
   * 停止循环播放
   */
  function stopLoop(tip: AudioEnum) {
    // 清定时器
    const timer = loopTimers.get(tip);
    if (timer != null) {
      clearTimeout(timer);
      loopTimers.delete(tip);
    }
    // 停掉 audio
    const audio = audios.get(tip);
    if (audio) {
      audio.loop = false;
      audio.pause();
      audio.currentTime = 0;
    }
  }

  return {
    play,
    playLoop,
    stopLoop,
    clear
  };
}

/** 枚举及对应音频文件映射，请根据项目实际路径修改 */
export enum AudioEnum {
  /** 消息提醒 */
  MESSAGE_ALERT = "message_alert",
  /** 通话提醒 */
  CALL_ALERT = "call_alert",
  /** 通话挂断提示音 */
  HAND_UP_ALERT = "handup_alert",
  /** 正在通话中提醒 */
  ONCALL_ALERT = "oncall_alert"
}

const audioSrcMap: Record<AudioEnum, string> = {
  [AudioEnum.MESSAGE_ALERT]: "../assets/audio/tip.wav",
  [AudioEnum.CALL_ALERT]: "../assets/audio/call.wav",
  [AudioEnum.HAND_UP_ALERT]: "../assets/audio/handup.wav",
  [AudioEnum.ONCALL_ALERT]: "../assets/audio/oncall.wav"
};
