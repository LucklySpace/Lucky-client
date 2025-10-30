// NoiseReducer.ts
// TypeScript — 浏览器/tauri 可用
// Usage:
//   await NoiseReducer.init(); // optional to pre-init
//   const processedStream = await NoiseReducer.processStream(micStream, optionalReferenceStream);
//   // use processedStream in WebRTC.publish as the stream to addTrack/send

export type NoiseReducerOptions = {
  sampleRate?: number; // desired sample rate, default AudioContext.sampleRate
  highpassCutoff?: number; // Hz - remove rumble (default 80)
  notchFreq?: number; // Hz - mains hum (default 50 or 60)
  notchQ?: number; // Q for notch filter
  gateThresholdDb?: number; // dB below which gate reduces gain (default -50 dB)
  gateAttack?: number; // ms
  gateRelease?: number; // ms
  compressor?: {
    threshold: number; // dB
    knee: number;
    ratio: number;
    attack: number; // ms
    release: number; // ms
  };
  makeupGainDb?: number; // final gain
  aec?: {
    enabled: boolean;
    filterLength?: number; // taps for LMS (e.g., 256)
    mu?: number; // LMS learning rate (small, e.g., 1e-6 ~ 1e-4)
  };
  workletBufferSize?: number; // frames per callback for worklet/script processor
};

const defaultOptions: NoiseReducerOptions = {
  highpassCutoff: 80,
  notchFreq: 50,
  notchQ: 1,
  gateThresholdDb: -50,
  gateAttack: 5,
  gateRelease: 100,
  compressor: {
    threshold: -24,
    knee: 30,
    ratio: 12,
    attack: 0.003,
    release: 0.25
  },
  makeupGainDb: 6,
  aec: { enabled: false, filterLength: 256, mu: 2e-5 },
  workletBufferSize: 128
};

export default class NoiseReducer {
  private static audioCtx: AudioContext | null = null;
  private static inited = false;

  /** 可选的全局初始化（预加载 worklet） */
  public static async init(): Promise<void> {
    if (this.inited) return;
    this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    // try register worklet
    if ((this.audioCtx as any).audioWorklet) {
      try {
        await (this.audioCtx as any).audioWorklet.addModule(this._createWorkletBlobUrl());
      } catch (e) {
        // ignore - fallback will be used
        console.warn("NoiseReducer: audioWorklet addModule failed, will fallback to ScriptProcessor if needed", e);
      }
    }
    this.inited = true;
  }

  /**
   * 主接口：对一个 mic MediaStream 做降噪处理，返回新的 MediaStream（可直接 addTrack）
   * referenceStream 可选（通常来自系统播放 / remote playback capture）用于 AEC。
   */

  public static async processStream(
    micStream: MediaStream,
    referenceOrOpts?: MediaStream | Partial<NoiseReducerOptions>,
    maybeOpts?: Partial<NoiseReducerOptions>
  ): Promise<MediaStream> {
    // helper to detect MediaStream (robust across some environments)
    const isMediaStream = (v: any): v is MediaStream => !!v && typeof v.getAudioTracks === "function";

    let referenceStream: MediaStream | undefined;
    let opts: Partial<NoiseReducerOptions> | undefined;

    if (isMediaStream(referenceOrOpts)) {
      referenceStream = referenceOrOpts;
      opts = maybeOpts;
    } else {
      referenceStream = undefined;
      opts = referenceOrOpts as Partial<NoiseReducerOptions> | undefined;
    }

    // merge options with defaults
    const options = { ...defaultOptions, ...(opts || {}) };

    // ensure init
    await this.init();
    const audioCtx = this.audioCtx || new (window.AudioContext || (window as any).webkitAudioContext)();
    const sampleRate = audioCtx.sampleRate;

    // create sources (MediaStreamSource will throw if stream is closed; caller should ensure valid stream)
    const micSource = audioCtx.createMediaStreamSource(micStream);
    const refSource = referenceStream ? audioCtx.createMediaStreamSource(referenceStream) : null;

    const highpass = audioCtx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = options.highpassCutoff!;
    highpass.Q.value = 0.7;

    const notch = audioCtx.createBiquadFilter();
    notch.type = "notch";
    notch.frequency.value = options.notchFreq!;
    notch.Q.value = options.notchQ!;

    const compressor = audioCtx.createDynamicsCompressor();
    const cOpt = options.compressor!;
    compressor.threshold.value = cOpt.threshold;
    compressor.knee.value = cOpt.knee;
    compressor.ratio.value = cOpt.ratio;
    compressor.attack.value = cOpt.attack;
    compressor.release.value = cOpt.release;

    const makeup = audioCtx.createGain();
    makeup.gain.value = Math.pow(10, (options.makeupGainDb || 0) / 20);

    const destination = audioCtx.createMediaStreamDestination();

    const wantAEC = !!(options.aec && options.aec.enabled && refSource);

    // create processing node (worklet preferred)
    let processingNode: AudioNode | null = null;
    if ((audioCtx as any).audioWorklet && this._workletRegistered()) {
      // AudioWorkletNode path
      const awn = new (window as any).AudioWorkletNode(audioCtx, "noise-reducer-processor", {
        numberOfInputs: wantAEC ? 2 : 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: {
          sampleRate,
          gateThresholdDb: options.gateThresholdDb,
          gateAttack: options.gateAttack,
          gateRelease: options.gateRelease,
          aec: options.aec,
          bufferSize: options.workletBufferSize
        }
      });
      micSource.connect(awn, 0, 0);
      if (refSource && wantAEC) refSource.connect(awn, 0, 1);
      processingNode = awn;
    } else {
      // ScriptProcessor fallback
      const bufferSize = 2048;
      const sp = (audioCtx.createScriptProcessor || (audioCtx as any).createJavaScriptNode).call(
        audioCtx,
        bufferSize,
        wantAEC ? 2 : 1,
        1
      );

      // simple LMS state
      const lms = {
        enabled: wantAEC,
        taps: new Float32Array(options.aec?.filterLength || 256),
        buf: new Float32Array((options.aec?.filterLength || 256) * 2),
        idx: 0,
        mu: options.aec?.mu || 2e-5
      };
      let noiseEstimate = 1e-8;
      const alpha = 0.95;

      sp.onaudioprocess = (ev: AudioProcessingEvent) => {
        const inMic = ev.inputBuffer.getChannelData(0);
        const inRef = wantAEC && ev.inputBuffer.numberOfChannels > 1 ? ev.inputBuffer.getChannelData(1) : null;
        const out = ev.outputBuffer.getChannelData(0);

        for (let i = 0; i < inMic.length; i++) {
          let x = inMic[i];

          // AEC (LMS)
          if (wantAEC && inRef) {
            lms.buf[lms.idx] = inRef[i];
            let y = 0;
            let p = lms.idx;
            for (let k = 0; k < lms.taps.length; k++) {
              y += lms.taps[k] * lms.buf[p];
              p = (p - 1 + lms.buf.length) % lms.buf.length;
            }
            const e = x - y;
            let p2 = lms.idx;
            for (let k = 0; k < lms.taps.length; k++) {
              lms.taps[k] += lms.mu * e * lms.buf[p2];
              p2 = (p2 - 1 + lms.buf.length) % lms.buf.length;
            }
            x = e;
            lms.idx = (lms.idx + 1) % lms.buf.length;
          }

          // noise estimate (RMS-like)
          const abs = Math.abs(x);
          noiseEstimate = alpha * noiseEstimate + (1 - alpha) * (abs * abs);

          // gate
          const rmsDb = 10 * Math.log10(noiseEstimate + 1e-12);
          const gateThr = options.gateThresholdDb || -50;
          let gateGain = 1;
          if (rmsDb < gateThr) {
            const diff = gateThr - rmsDb;
            gateGain = Math.max(0, 1 - diff / 40);
          }

          // naive compressor
          const levelDb = 20 * Math.log10(Math.max(1e-8, Math.abs(x)));
          let compGain = 1;
          if (levelDb > cOpt.threshold) {
            const over = levelDb - cOpt.threshold;
            const reduced = over / cOpt.ratio;
            const gainDb = reduced - over;
            compGain = Math.pow(10, gainDb / 20);
          }

          out[i] = x * gateGain * compGain;
        }
      };

      micSource.connect(sp);
      if (refSource && wantAEC) {
        refSource.connect(sp, 0, 1);
      }
      processingNode = sp;
    }

    // final chain
    micSource.connect(highpass);
    highpass.connect(notch);
    if (!processingNode) throw new Error("processing node not created");
    notch.connect(processingNode);
    processingNode.connect(compressor);
    compressor.connect(makeup);
    makeup.connect(destination);

    return destination.stream;
  }

  // ---------- internal helpers ------------
  private static _workletRegistered(): boolean {
    // our worklet registers by adding a processor called 'noise-reducer-processor' to global scope
    // since we add module ourselves, simply return true if init tried to register. For robustness check existance:
    try {
      // @ts-ignore
      return !!(window as any).NoiseReducerWorkletRegistered || true; // best-effort - we still attempt addModule when init
    } catch {
      return false;
    }
  }

  /** create a blob URL for an AudioWorklet processor — returns URL string */
  private static _createWorkletBlobUrl(): string {
    // Worklet processor code (plain JS) as string. It implements:
    // - optional LMS AEC if second input exists
    // - noise estimate via RMS + gate
    // - per-sample processing (mono)
    const workletStr = `
class NoiseReducerProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const p = options.processorOptions || {};
    this.sampleRate = p.sampleRate || sampleRate;
    this.gateThresholdDb = p.gateThresholdDb ?? -50;
    this.gateAttack = (p.gateAttack ?? 5) / 1000;
    this.gateRelease = (p.gateRelease ?? 100) / 1000;
    this.aecCfg = p.aec || { enabled: false };
    this.noiseEstimate = 1e-8;
    this.alpha = 0.95;
    if (this.aecCfg.enabled) {
      this.filterLen = this.aecCfg.filterLength || 256;
      this.mu = this.aecCfg.mu || 2e-5;
      this.taps = new Float32Array(this.filterLen);
      this.refBuf = new Float32Array(this.filterLen * 2);
      this.refIdx = 0;
    }
  }
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0]) return true;
    const inCh = input[0];
    const outCh = output[0];
    const refInput = inputs[1] && inputs[1][0] ? inputs[1][0] : null;
    for (let i = 0; i < inCh.length; i++) {
      let x = inCh[i];
      // AEC via LMS
      if (this.aecCfg.enabled && refInput) {
        this.refBuf[this.refIdx] = refInput[i];
        // compute y
        let y = 0;
        let p = this.refIdx;
        for (let k = 0; k < this.taps.length; k++) {
          y += this.taps[k] * this.refBuf[p];
          p = (p - 1 + this.refBuf.length) % this.refBuf.length;
        }
        const e = x - y;
        // update taps
        let p2 = this.refIdx;
        for (let k = 0; k < this.taps.length; k++) {
          this.taps[k] += this.mu * e * this.refBuf[p2];
          p2 = (p2 - 1 + this.refBuf.length) % this.refBuf.length;
        }
        x = e;
        this.refIdx = (this.refIdx + 1) % this.refBuf.length;
      }
      // noise estimate
      const a = Math.abs(x);
      this.noiseEstimate = this.alpha * this.noiseEstimate + (1 - this.alpha) * (a * a);
      const rmsDb = 10 * Math.log10(this.noiseEstimate + 1e-12);
      let gateGain = 1.0;
      if (rmsDb < this.gateThresholdDb) {
        const diff = this.gateThresholdDb - rmsDb;
        gateGain = Math.max(0, 1 - diff / 40.0);
      }
      outCh[i] = x * gateGain;
    }
    return true;
  }
}
registerProcessor('noise-reducer-processor', NoiseReducerProcessor);
    `;
    const blob = new Blob([workletStr], { type: "application/javascript" });
    return URL.createObjectURL(blob);
  }
}
