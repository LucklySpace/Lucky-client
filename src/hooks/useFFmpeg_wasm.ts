// src/hooks/useFFmpeg.ts
import { computed, ref } from "vue";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

// import { Command } from '@tauri-apps/plugin-shell';
// // `binaries/my-sidecar` 是在 `tauri.conf.json > tauri > bundle > externalBin` 指定的确切值。
// // 请注意 args 数组需要与 `tauri.conf.json` 中指定的需完全匹配
// const command = Command.sidecar('binaries/my-sidecar', [
//   'arg1',
//   '-a',
//   '--arg2',
//   'any-string-that-matches-the-validator',
// ]);
// const output = await command.execute();

/**
 * 简化版 useFFmpeg Hook
 * - 提供：startScreenRecord / stopScreenRecord / cancelScreenRecord
 * - 可选：convertToMp4（需要 ffmpeg.wasm，会按需 load）
 *
 * 使用示例：
 * const { isRecording, startScreenRecord, stopScreenRecord, cancelScreenRecord, convertToMp4 } = useFFmpeg();
 */

export type ProgressInfo = { ratio: number; time?: number };

export type UseFFmpegOptions = {
  coreBaseUrl?: string; // ffmpeg core 的 base url（含 ffmpeg-core.js / .wasm 的目录），可选
  log?: boolean; // 是否打印 ffmpeg 日志
  loadOnInit?: boolean; // 是否在 hook 初始化时自动 load ffmpeg（默认 false）
};

let GLOBAL_FFMPEG: FFmpeg | null = null;
let GLOBAL_LOAD_PROMISE: Promise<void> | null = null;

export function useFFmpeg(options: UseFFmpegOptions = {}) {
  // ---------- 反应式状态 ----------
  const loading = ref(false); // ffmpeg 加载中
  const ready = ref(false); // ffmpeg 已就绪
  const running = ref(false); // ffmpeg 正在执行命令
  const progress = ref<ProgressInfo>({ ratio: 0 });

  // 录屏相关
  const isRecording = ref(false);
  const mediaStream = ref<MediaStream | null>(null);
  const mediaRecorder = ref<MediaRecorder | null>(null);
  const recordedChunks: Blob[] = []; // session 内部缓冲块
  const error = ref<string | null>(null);

  // 默认 ffmpeg core 地址（可被 options.coreBaseUrl 覆盖）
  const DEFAULT_FFMPEG_BASE = "https://unpkg.com/@ffmpeg/core@0.12.4/dist/esm";

  // ---------- 内部 util ----------
  function logger(...args: any[]) {
    if (options.log) console.log("[useFFmpeg]", ...args);
  }

  function getOrCreateFFmpeg(): FFmpeg {
    if (GLOBAL_FFMPEG) return GLOBAL_FFMPEG;
    const ff = new FFmpeg(); // 依赖 @ffmpeg/ffmpeg 提供的类
    GLOBAL_FFMPEG = ff;
    return ff;
  }

  // 按需加载 ffmpeg.wasm（返回加载 promise）
  async function load() {
    if (ready.value) return;
    if (GLOBAL_LOAD_PROMISE) return GLOBAL_LOAD_PROMISE;
    loading.value = true;
    const ff = getOrCreateFFmpeg();
    GLOBAL_LOAD_PROMISE = (async () => {
      try {
        logger("开始加载 ffmpeg...");
        const base = options.coreBaseUrl ?? DEFAULT_FFMPEG_BASE;

        // 进度与日志转发
        ff.on("log", ({ message }: any) => {
          if (options.log) console.log("[ffmpeg]", message);
        });
        ff.on("progress", ({ progress: p, time }: any) => {
          progress.value = { ratio: p ?? 0, time };
        });

        // toBlobURL 用于把远端脚本转换成可加载的 BlobURL（有些环境需要）
        await ff.load({
          coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm")
        });

        ready.value = true;
        logger("ffmpeg 加载完成");
      } catch (e: any) {
        logger("ffmpeg load error:", e);
        error.value = String(e?.message ?? e);
        // 清理单例以便重试
        GLOBAL_FFMPEG = null;
        GLOBAL_LOAD_PROMISE = null;
        throw e;
      } finally {
        loading.value = false;
      }
    })();
    return GLOBAL_LOAD_PROMISE;
  }

  // 运行 ffmpeg 命令（低级 API）
  async function runFFmpeg(args: string[], onProgress?: (p: ProgressInfo) => void) {
    if (!ready.value) throw new Error("ffmpeg 未加载");
    const ff = getOrCreateFFmpeg();
    running.value = true;
    error.value = null;

    const progHandler = (ev: any) => {
      const p: ProgressInfo = { ratio: ev.progress ?? 0, time: ev.time ?? undefined };
      progress.value = p;
      onProgress?.(p);
    };
    ff.on("progress", progHandler);

    try {
      logger("执行 ffmpeg:", args.join(" "));
      await ff.exec(args);
      logger("ffmpeg 执行完成");
    } catch (e: any) {
      error.value = String(e?.message ?? e);
      logger("ffmpeg 执行失败:", e);
      throw e;
    } finally {
      running.value = false;
      try {
        ff.off("progress", progHandler);
      } catch {
      }
    }
  }

  // 高级转码：把 webm Blob 写入 ffmpeg FS，执行转码，读取输出并返回 Uint8Array
  async function transcodeWebmToMp4(webm: Blob, outName = "out.mp4") {
    await load();
    const ff = getOrCreateFFmpeg();
    const inputName = "in.webm";
    const data = await fetchFile(webm as any);
    await ff.writeFile(inputName, data);

    // 默认 H.264 + AAC 设置（若 core 未包含相关 codec，可能失败）
    const args = [
      "-i",
      inputName,
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-y",
      outName
    ];
    await runFFmpeg(args);
    const out = await ff.readFile(outName);
    // 清理文件
    try {
      await ff.deleteFile(inputName);
      await ff.deleteFile(outName);
    } catch {
    }
    return new Uint8Array(out as any);
  }

  // ---------- MediaRecorder 录屏逻辑 ----------

  /**
   * startScreenRecord
   * - 请求屏幕捕获并用 MediaRecorder 录制（webm）
   * - opts: mimeType/bitsPerSecond/timeSlice/includeAudio
   * - 返回 MediaStream（用于预览）
   */
  async function startScreenRecord(opts?: {
    mimeType?: string;
    bitsPerSecond?: number;
    timeSlice?: number;
    includeAudio?: boolean;
  }): Promise<MediaStream> {
    if (isRecording.value) {
      logger("已在录制中");
      return mediaStream.value as MediaStream;
    }

    if (!navigator.mediaDevices || !("getDisplayMedia" in navigator.mediaDevices)) {
      throw new Error("浏览器不支持屏幕捕获 (getDisplayMedia)");
    }

    // 请求屏幕（可选音频）
    const constraints: MediaStreamConstraints = {
      video: { frameRate: { ideal: 30 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: opts?.includeAudio ?? false
    };
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
      mediaStream.value = stream;
      recordedChunks.length = 0;
      isRecording.value = true;

      // 自动在 track ended 时停止并清理（用户在浏览器停止共享）
      const vt = stream.getVideoTracks()[0];
      if (vt) {
        vt.addEventListener("ended", () => {
          logger("屏幕共享被用户停止（track ended）");
          // 这里选择自动停止并保留数据，交由调用者处理后续：stopScreenRecord() / cancelScreenRecord()
          // 我们先把 isRecording 置 false，以保证 UI 同步
          isRecording.value = false;
        });
      }

      // 选择支持的 mimeType
      const supported = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8,opus",
        "video/webm"
      ];
      let mimeType = opts?.mimeType ?? supported.find(t => MediaRecorder.isTypeSupported(t)) ?? "video/webm";

      const recorderOpts: MediaRecorderOptions = { mimeType, bitsPerSecond: opts?.bitsPerSecond ?? 2_500_000 };
      const mr = new MediaRecorder(stream, recorderOpts);
      mediaRecorder.value = mr;

      mr.ondataavailable = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0) recordedChunks.push(ev.data);
      };
      mr.onerror = (ev: any) => {
        logger("MediaRecorder error", ev);
        error.value = ev?.error?.message || "MediaRecorder 错误";
        isRecording.value = false;
      };
      mr.onstop = () => {
        logger("MediaRecorder stop event");
        isRecording.value = false;
      };

      if (opts?.timeSlice && opts.timeSlice > 0) mr.start(opts.timeSlice);
      else mr.start();
      logger("开始录制, mimeType=" + mimeType);
      return stream;
    } catch (e: any) {
      logger("startScreenRecord failed:", e);
      isRecording.value = false;
      mediaStream.value = null;
      throw e;
    }
  }

  /**
   * stopScreenRecord
   * - 停止 recorder，合并 chunks，返回 { webmBlob, mp4Blob?, url? }
   * - 若 opts.transcodeToMp4 为 true，会尝试用 ffmpeg 转为 mp4（需要先 load）
   */
  async function stopScreenRecord(opts?: { transcodeToMp4?: boolean; ffmpegProgressCb?: (p: ProgressInfo) => void }) {
    // 如果没有数据且没有录制，直接返回空
    if (!mediaRecorder.value && recordedChunks.length === 0 && !mediaStream.value) {
      return { webmBlob: null, mp4Blob: null, url: null };
    }

    // helper: finalize
    const finalize = async () => {
      // 停止所有 tracks（释放共享）
      try {
        mediaStream.value?.getTracks().forEach(t => {
          try {
            t.stop();
          } catch {
          }
        });
      } catch {
      }
      mediaStream.value = null;
      mediaRecorder.value = null;
      isRecording.value = false;

      const webm =
        recordedChunks.length > 0 ? new Blob(recordedChunks, { type: recordedChunks[0].type || "video/webm" }) : null;
      recordedChunks.length = 0;

      if (!webm) return { webmBlob: null, mp4Blob: null, url: null };

      // 若需要转码
      if (opts?.transcodeToMp4) {
        try {
          // 可选：把外部 progress 回调连接到内部 progress
          //const onProg = (p: ProgressInfo) => { opts.ffmpegProgressCb?.(p); };
          await load();
          const u8 = await transcodeWebmToMp4(webm, "out.mp4");
          const mp4Blob = new Blob([u8], { type: "video/mp4" });
          const url = URL.createObjectURL(mp4Blob);
          return { webmBlob: webm, mp4Blob, url };
        } catch (e: any) {
          logger("转码失败，回退返回 webm:", e);
          const url = URL.createObjectURL(webm);
          return { webmBlob: webm, mp4Blob: null, url };
        }
      } else {
        const url = URL.createObjectURL(webm);
        return { webmBlob: webm, mp4Blob: null, url };
      }
    };

    // 如果 recorder 正在活跃，等待 stop 事件
    return new Promise<{ webmBlob: Blob | null; mp4Blob: Blob | null; url: string | null }>(resolve => {
      try {
        if (mediaRecorder.value && mediaRecorder.value.state !== "inactive") {
          mediaRecorder.value.addEventListener(
            "stop",
            async () => {
              const r = await finalize();
              resolve(r);
            },
            { once: true }
          );
          try {
            mediaRecorder.value.stop();
          } catch {
            /* ignore */
          }
        } else {
          // 已经停止
          finalize().then(r => resolve(r));
        }
      } catch (e) {
        finalize().then(r => resolve(r));
      }
    });
  }

  /**
   * cancelScreenRecord
   * - 立即停止并丢弃数据（不会返回文件）
   */
  function cancelScreenRecord() {
    try {
      if (mediaRecorder.value && mediaRecorder.value.state !== "inactive") {
        try {
          mediaRecorder.value.stop();
        } catch {
        }
      }
      if (mediaStream.value) {
        mediaStream.value.getTracks().forEach(t => {
          try {
            t.stop();
          } catch {
          }
        });
      }
    } finally {
      recordedChunks.length = 0;
      mediaRecorder.value = null;
      mediaStream.value = null;
      isRecording.value = false;
      logger("录制已取消并清理");
    }
  }

  // ---------- 辅助：外部转 mp4（包装） ----------
  async function convertToMp4(input: Blob) {
    try {
      await load();
      const u8 = await transcodeWebmToMp4(input, "out.mp4");
      return new Blob([u8], { type: "video/mp4" });
    } catch (e) {
      throw e;
    }
  }

  // ---------- 公共返回对象 ----------
  const state = computed(() => ({
    ready: ready.value,
    loading: loading.value,
    running: running.value,
    progress: progress.value,
    error: error.value,
    isRecording: isRecording.value
  }));

  return {
    // state
    state,
    ready,
    loading,
    running,
    progress,
    error,

    // ffmpeg lifecycle
    load,
    // stop/kill ffmpeg (轻量清理)
    cancelFFmpeg: () => {
      if (!GLOBAL_FFMPEG) return;
      try {
        (GLOBAL_FFMPEG as any).terminate?.();
      } catch {
      }
      GLOBAL_FFMPEG = null;
      GLOBAL_LOAD_PROMISE = null;
      ready.value = false;
      loading.value = false;
    },

    // recording APIs
    isRecording,
    startScreenRecord,
    stopScreenRecord,
    cancelScreenRecord,

    // utility
    convertToMp4
  };
}
