import { computed, onUnmounted, readonly, ref } from "vue";
// @ts-ignore
import { createRNNWasmModule } from "@jitsi/rnnoise-wasm";
import Log from "@/utils/Log";

export interface NoiseSuppressionOptions {
  enabled?: boolean;
  sampleRate?: number;
  latencyHint?: "interactive" | "balanced" | "playback";
}

export interface NoiseSuppressionState {
  enabled: boolean;
  initialized: boolean;
  audioContextState: string | null;
  processingLatency: number;
  error: string | null;
}

export interface NoiseSuppressionResult {
  processedStream: MediaStream;
  cleanup: () => void;
}

/**
 * RNNoise降噪处理 Hook
 *
 * 功能特点：
 * - 使用 @jitsi/rnnoise-wasm 进行实时音频降噪
 * - 支持WebRTC音频流处理
 * - 自动资源管理和清理
 * - 状态监控和错误处理
 *
 * 使用示例：
 * ```ts
 * const { 
 *   applyNoiseSuppression, 
 *   toggleNoiseSuppression, 
 *   state 
 * } = useNoiseSuppression()
 *
 * // 应用降噪到音频流
 * const result = await applyNoiseSuppression(mediaStream)
 *
 * // 切换降噪状态
 * toggleNoiseSuppression(true)
 * ```
 */
export function useNoiseSuppression(options: NoiseSuppressionOptions = {}) {
  // 响应式状态
  const state = ref<NoiseSuppressionState>({
    enabled: options.enabled ?? false,
    initialized: false,
    audioContextState: null,
    processingLatency: 0,
    error: null
  });

  // 内部状态
  let audioContext: AudioContext | null = null;
  let wasmModule: any = null;
  let processorUrl: string | null = null;
  let activeProcessors = new Set<AudioWorkletNode>();

  // 计算属性
  const isReady = computed(() => state.value.initialized && !state.value.error);
  const canProcess = computed(() => isReady.value && state.value.enabled);

  /**
   * 初始化WASM模块和音频处理器
   */
  async function initialize(): Promise<boolean> {
    if (state.value.initialized) return true;

    try {
      state.value.error = null;

      // 创建音频上下文
      audioContext = new AudioContext({
        sampleRate: options.sampleRate || 48000,
        latencyHint: options.latencyHint || "interactive"
      });

      // 确保音频上下文运行
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      // 加载WASM模块
      wasmModule = await createRNNWasmModule();
      Log.colorLog("noise-suppression", "RNNoise WASM模块加载成功", "info");

      // 准备处理器URL
      processorUrl = new URL("../utils/rnnoise-processor.js", import.meta.url).href;

      // 加载AudioWorklet处理器
      await audioContext.audioWorklet.addModule(processorUrl);
      Log.colorLog("noise-suppression", "AudioWorklet处理器加载成功", "info");

      state.value.initialized = true;
      state.value.audioContextState = audioContext.state;

      return true;
    } catch (error) {
      const errorMessage = `初始化降噪失败: ${error}`;
      state.value.error = errorMessage;
      Log.colorLog("noise-suppression", errorMessage, "error");
      return false;
    }
  }

  /**
   * 应用降噪处理到音频流
   */
  async function applyNoiseSuppression(
    inputStream: MediaStream,
    options: { forceEnable?: boolean } = {}
  ): Promise<NoiseSuppressionResult | null> {
    // 检查是否需要处理
    if (!options.forceEnable && !canProcess.value) {
      Log.colorLog("noise-suppression", "降噪未启用或未准备就绪", "info");
      return null;
    }

    // 确保已初始化
    if (!state.value.initialized) {
      const initialized = await initialize();
      if (!initialized) {
        throw new Error("降噪初始化失败");
      }
    }

    if (!audioContext || !processorUrl) {
      throw new Error("音频上下文或处理器未准备就绪");
    }

    try {
      // 检查输入流是否有音频轨道
      const audioTracks = inputStream.getAudioTracks();
      if (audioTracks.length === 0) {
        Log.colorLog("noise-suppression", "输入流没有音频轨道，跳过降噪处理", "warn");
        return {
          processedStream: inputStream,
          cleanup: () => {
          }
        };
      }

      // 创建音频处理链
      const source = audioContext.createMediaStreamSource(inputStream);
      const processor = new AudioWorkletNode(audioContext, "rnnoise-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1, // RNNoise处理单声道
        channelCountMode: "explicit",
        channelInterpretation: "speakers"
      });
      const destination = audioContext.createMediaStreamDestination();

      // 连接音频节点
      source.connect(processor);
      processor.connect(destination);

      // 监听处理器消息
      processor.port.onmessage = (event) => {
        const { type, message, latency } = event.data;

        switch (type) {
          case "initialized":
            Log.colorLog("noise-suppression", "RNNoise处理器初始化完成", "info");
            break;
          case "status":
            Log.colorLog("noise-suppression", `状态: ${message}`, "trace");
            break;
          case "error":
            Log.colorLog("noise-suppression", `处理错误: ${message}`, "error");
            state.value.error = message;
            break;
          case "latency":
            state.value.processingLatency = latency || 0;
            break;
        }
      };

      // 记录活跃处理器
      activeProcessors.add(processor);

      // 创建输出流（包含降噪音频和原始视频）
      const processedStream = new MediaStream();

      // 添加降噪后的音频轨道
      destination.stream.getAudioTracks().forEach(track => {
        processedStream.addTrack(track);
      });

      // 保留原始视频轨道
      inputStream.getVideoTracks().forEach(track => {
        processedStream.addTrack(track);
      });

      // 清理函数
      const cleanup = () => {
        try {
          source.disconnect();
          processor.disconnect();
          processor.port.close();
          activeProcessors.delete(processor);

          // 停止处理后的音频轨道
          destination.stream.getTracks().forEach(track => track.stop());

          Log.colorLog("noise-suppression", "降噪处理器已清理", "info");
        } catch (error) {
          Log.colorLog("noise-suppression", `清理处理器时出错: ${error}`, "warn");
        }
      };

      Log.colorLog("noise-suppression", "降噪处理已应用到音频流", "info");

      return {
        processedStream,
        cleanup
      };

    } catch (error) {
      const errorMessage = `应用降噪处理失败: ${error}`;
      state.value.error = errorMessage;
      Log.colorLog("noise-suppression", errorMessage, "error");
      throw error;
    }
  }

  /**
   * 切换降噪启用状态
   */
  function toggleNoiseSuppression(enable?: boolean): boolean {
    const newState = enable !== undefined ? enable : !state.value.enabled;
    state.value.enabled = newState;

    Log.colorLog("noise-suppression", `降噪${newState ? "已启用" : "已禁用"}`, "info");
    return newState;
  }

  /**
   * 获取音频上下文信息
   */
  function getAudioContextInfo() {
    if (!audioContext) return null;

    return {
      state: audioContext.state,
      sampleRate: audioContext.sampleRate,
      currentTime: audioContext.currentTime,
      baseLatency: audioContext.baseLatency,
      outputLatency: audioContext.outputLatency
    };
  }

  /**
   * 清理所有资源
   */
  async function cleanup() {
    try {
      // 清理所有活跃的处理器
      activeProcessors.forEach(processor => {
        try {
          processor.disconnect();
          processor.port.close();
        } catch (error) {
          Log.colorLog("noise-suppression", `清理处理器出错: ${error}`, "warn");
        }
      });
      activeProcessors.clear();

      // 关闭音频上下文
      if (audioContext && audioContext.state !== "closed") {
        await audioContext.close();
      }

      // 重置状态
      audioContext = null;
      wasmModule = null;
      processorUrl = null;

      state.value.initialized = false;
      state.value.audioContextState = null;
      state.value.error = null;
      state.value.processingLatency = 0;

      Log.colorLog("noise-suppression", "降噪资源已全部清理", "info");
    } catch (error) {
      Log.colorLog("noise-suppression", `清理资源时出错: ${error}`, "warn");
    }
  }

  // 组件卸载时自动清理
  onUnmounted(() => {
    cleanup();
  });

  // 监听音频上下文状态变化
  if (typeof window !== "undefined") {
    const updateAudioContextState = () => {
      if (audioContext) {
        state.value.audioContextState = audioContext.state;
      }
    };

    // 定期更新状态
    const stateUpdateInterval = setInterval(updateAudioContextState, 1000);

    onUnmounted(() => {
      clearInterval(stateUpdateInterval);
    });
  }

  return {
    // 状态
    state: readonly(state),
    isReady,
    canProcess,

    // 方法
    initialize,
    applyNoiseSuppression,
    toggleNoiseSuppression,
    getAudioContextInfo,
    cleanup
  };
}

// 类型导出
export type UseNoiseSuppressionReturn = ReturnType<typeof useNoiseSuppression>
