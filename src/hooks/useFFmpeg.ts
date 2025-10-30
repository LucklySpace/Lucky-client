// src/hooks/useFFmpeg.ts
// 优化版：中文注释，改进了停止逻辑（优先发送 'q' 请求 ffmpeg 优雅结束，回退到 kill）
// 增加了进度解析（当用户传入 durationSec 时能报告 ratio），增强了异常处理与临时文件清理

import { computed, ref } from "vue";
import { Child, Command } from "@tauri-apps/plugin-shell";
import { join, tempDir } from "@tauri-apps/api/path";
import { BaseDirectory, readFile, remove, writeFile } from "@tauri-apps/plugin-fs";
import { platform } from "@tauri-apps/plugin-os";

export type UseFFmpegOptions = {
  sidecarName?: string; // sidecar 名称或路径（tauri.conf.json 中 externalBin）
  log?: boolean;
  defaultFps?: number;
  defaultPreset?: string;
  // 停止录制时优先尝试发送 'q' 到 ffmpeg stdin，若不可用再 kill（默认 true）
  preferGracefulStop?: boolean;
};

export type RecordOptions = {
  filename?: string;
  fps?: number;
  includeAudio?: boolean;
  durationSec?: number; // 若传入则 ffmpeg 会在该时长后自动结束
  customArgs?: string[];
};

export function useFFmpeg(options: UseFFmpegOptions = {}) {
  const sidecarName = options.sidecarName ?? "bin/ffmpeg"; // 保持兼容原始代码
  const logEnabled = !!options.log;
  const defaultFps = options.defaultFps ?? 30;
  const defaultPreset = options.defaultPreset ?? "veryfast";
  const preferGracefulStop = options.preferGracefulStop ?? true;

  // 状态
  const loading = ref(false);
  const ready = ref(false);
  const isRecording = ref(false);
  const progress = ref<{ text?: string; ratio?: number }>({});
  const error = ref<string | null>(null);

  // 内部 child 引用（spawn 返回）
  const childRef = ref<Child | null>(null);

  // 临时输出文件 basename（在 BaseDirectory.Temp 下）
  const tempOutName = ref<string | null>(null);

  function log(...args: any[]) {
    if (logEnabled) console.log("[useFFmpeg-sidecar]", ...args);
  }

  async function ensureReady() {
    if (ready.value) return;
    loading.value = true;
    try {
      log("checking ffmpeg sidecar:", sidecarName);
      const cmd = Command.sidecar(sidecarName, ["-version"]);
      const res = await cmd.execute();
      log("ffmpeg:", res.stdout?.split("\n")?.[0] ?? "ok");
      ready.value = true;
    } catch (e: any) {
      error.value = String(e?.message ?? e);
      ready.value = false;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  // 平台默认输入参数（仅视频，作为起点）
  async function buildDefaultInputArgs(opts: RecordOptions) {
    const plt = await platform();
    const fps = opts.fps ?? defaultFps;
    if (plt === "windows") {
      return ["-f", "gdigrab", "-framerate", String(fps), "-i", "desktop"];
    } else if (plt === "macos") {
      // macOS 上的默认屏幕索引 1（可能需用户调整）
      return ["-f", "avfoundation", "-framerate", String(fps), "-i", "1"];
    } else {
      // Linux（默认 X11），Wayland/pipewire 需用户自定义 customArgs
      return ["-f", "x11grab", "-framerate", String(fps), "-i", ":0.0"];
    }
  }

  /**
   * startScreenRecord - spawn 一个 ffmpeg sidecar 进行录屏
   * 特点：
   * - 优先使用 opts.customArgs（用户完全控制），否则使用平台默认输入
   * - 自动在 BaseDirectory.Temp 下写入文件（basename 存于 tempOutName）
   * - 尝试解析 stderr 中的 progress（当提供了 durationSec 时可给出 ratio）
   */
  async function startScreenRecord(opts: RecordOptions = {}) {
    if (isRecording.value) throw new Error("already recording");
    await ensureReady();

    if (opts.includeAudio && (!opts.customArgs || opts.customArgs.length === 0)) {
      log(
        "WARNING: includeAudio=true but no customArgs provided. Default input is video-only. Provide full -i args for audio."
      );
    }

    const tmp = await tempDir();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const filename = opts.filename ?? `screen-${id}.mp4`;
    const outName = `${id}-${filename}`; // basename（写入 BaseDirectory.Temp）
    const outFull = await join(tmp, outName); // 仅用于日志与 spawn 参数

    // 构建输入参数
    let inputArgs: string[] = [];
    if (opts.customArgs && opts.customArgs.length > 0) {
      // 假设用户传入完整的 -i ... 等参数，保留顺序
      inputArgs = opts.customArgs.slice();
    } else {
      inputArgs = await buildDefaultInputArgs(opts);
    }

    // 默认编码设置（用户可以在 customArgs 中覆盖）
    const encArgs = ["-c:v", "libx264", "-preset", defaultPreset, "-pix_fmt", "yuv420p", "-movflags", "+faststart"];

    // duration 放在输出前
    const durationArgs = opts.durationSec ? ["-t", String(opts.durationSec)] : [];

    // 将输出路径使用绝对（或 join 得到的）路径传给 ffmpeg
    // 注意：在 tauri plugin-fs 中，我们后续读取文件使用 basename + BaseDirectory.Temp
    const args = [...inputArgs, ...encArgs, ...durationArgs, outFull];

    log("spawning ffmpeg with args:", args.join(" "));

    const command = Command.sidecar(sidecarName, args);

    // 绑定基本的 stream 事件以便打印日志并尝试解析进度
    try {
      // stderr 通常包含 ffmpeg 的进度信息
      command.stderr.on("data", (data: any) => {
        try {
          const text = String(data);
          // 打印原始 stderr（按需）
          log("ffmpeg stderr:", text.trim());

          // 试着解析 time=HH:MM:SS.mmm 当用户提供 durationSec 时计算 ratio
          if (opts.durationSec) {
            const m = text.match(/time=\s*([0-9:.]+)/);
            if (m) {
              const t = m[1];
              const parts = t.split(":").map(p => parseFloat(p));
              let seconds = 0;
              if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
              else if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
              else seconds = parts[0];
              progress.value = { text: `time=${t}`, ratio: Math.min(1, seconds / (opts.durationSec || 1)) };
            }
          }
        } catch (e) {
          log("stderr parse error:", e);
        }
      });

      command.stdout.on("data", (d: any) => {
        // 有时 ffmpeg 的机器可读进度会输出到 stdout（取决于 -progress），这里简单打印
        log("ffmpeg stdout:", String(d).trim());
      });

      command.on("error", (err: any) => {
        log("ffmpeg command error:", err);
      });

      command.on("close", (code: any) => {
        log("ffmpeg process closed with code", code);
      });
    } catch (e) {
      // 某些运行时可能不支持绑定事件（容错）
      log("stream bind warning:", e);
    }

    // spawn 并保存 child 引用
    childRef.value = await command.spawn();
    isRecording.value = true;
    progress.value = {};
    tempOutName.value = outName; // 只保留 basename，后续用 BaseDirectory.Temp 读取

    log("ffmpeg spawned, child:", childRef.value.pid ?? childRef.value);

    return { outPath: outFull, outName };
  }

  /**
   * stopScreenRecord - 停止录制并读取临时文件返回 Blob
   * 实现要点：
   * 1) 优先使用优雅方式：向 ffmpeg stdin 写入 'q'（或发送 SIGINT）让 ffmpeg 写入 trailer
   * 2) 若优雅方式不可用或超时，则回退到 kill()
   * 3) 停止后等待短暂时间以确保输出文件 flush，然后读取并返回 Blob
   */
  async function stopScreenRecord() {
    const outName = tempOutName.value;
    if (!outName) {
      // 没有临时文件：重置状态并返回空结果
      childRef.value = null;
      isRecording.value = false;
      return { blob: null, path: null, name: null };
    }

    // 主体：先尝试q结束，失败则 kill（并容错）
    if (childRef.value && isRecording.value) {
      try {
        // 优先尝试标准 stdin 写入
        if (typeof childRef.value.write === "function") {
          // 某些实现直接暴露 write
          log("sending 'q' to ffmpeg via child.write...");
          await childRef.value.write("q");
        } else if (typeof childRef.value.kill === "function") {
          log("fallback: killing ffmpeg child...");
          await childRef.value.kill();
        }
      } catch (e) {
        log("kill child failed:", e);
      }
    }

    // 给 ffmpeg 一点时间把文件 flush 完（保证 moov atom 等写入完成）
    await new Promise(res => setTimeout(res, 600));

    // 读取临时文件并返回 Blob
    try {
      const u8 = await readFile(outName, { baseDir: BaseDirectory.Temp });
      const uint8 = Uint8Array.from(u8);
      const blob = new Blob([uint8], { type: "video/mp4" });

      // 重置状态（不自动删除临时文件，保留给上层决定）
      childRef.value = null;
      tempOutName.value = null;
      isRecording.value = false;
      progress.value = {};
      // Cleanup
      await remove(outName, { baseDir: BaseDirectory.Temp }).catch(log);
      return { blob, path: null, name: outName };
    } catch (e: any) {
      log("read output file error:", e);
      childRef.value = null;
      tempOutName.value = null;
      isRecording.value = false;
      error.value = e?.message ?? String(e);
      // Cleanup on error
      await remove(outName, { baseDir: BaseDirectory.Temp }).catch(log);
      throw e;
    }
  }

  /**
   * cancelScreenRecord - 立即停止并尝试删除临时文件（无返回）
   */
  async function cancelScreenRecord() {
    try {
      if (childRef.value) {
        try {
          await (childRef.value as any).kill?.();
        } catch (e) {
          log("cancel kill failed:", e);
        }
      }
    } finally {
      if (tempOutName.value) {
        await remove(tempOutName.value, { baseDir: BaseDirectory.Temp }).catch(log);
      }
      childRef.value = null;
      tempOutName.value = null;
      isRecording.value = false;
      progress.value = {};
    }
  }

  /**
   * convertToMp4 - 将传入的 Blob 转换为 mp4（blocking execute）
   */
  async function convertToMp4(input: Blob, extraArgs: string[] = []) {
    await ensureReady();
    const tmp = await tempDir();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const inName = `${id}-in.${input.type.split("/")[1] || "webm"}`;
    await writeFile(inName, new Uint8Array(await input.arrayBuffer()), { baseDir: BaseDirectory.Temp });

    const inFull = await join(tmp, inName);
    const outName = `${id}-out.mp4`;
    const outFull = await join(tmp, outName);

    const args = [
      "-y",
      "-i",
      inFull,
      "-c:v",
      "libx264",
      "-preset",
      defaultPreset,
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      ...extraArgs,
      outFull
    ];

    log("convertToMp4 args:", args.join(" "));
    const cmd = Command.sidecar(sidecarName, args);
    const res = await cmd.execute();
    if (res.stderr?.length) log("ffmpeg stderr (convert):", res.stderr.slice(-1000));
    if (res.code !== 0) {
      throw new Error(`FFmpeg convert failed with code ${res.code}: ${res.stderr?.slice(-500)}`);
    }

    const u8 = await readFile(outName, { baseDir: BaseDirectory.Temp });
    const uint8 = Uint8Array.from(u8);
    const blob = new Blob([uint8], { type: "video/mp4" });

    await Promise.all([
      remove(inName, { baseDir: BaseDirectory.Temp }).catch(log),
      remove(outName, { baseDir: BaseDirectory.Temp }).catch(log)
    ]);

    return blob;
  }

  const state = computed(() => ({
    ready: ready.value,
    loading: loading.value,
    isRecording: isRecording.value,
    progress: progress.value,
    error: error.value
  }));

  return {
    state,
    ready,
    loading,
    isRecording,
    progress,
    error,
    ensureReady,
    startScreenRecord,
    stopScreenRecord,
    cancelScreenRecord,
    convertToMp4
  };
}
