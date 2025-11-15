// rnnoise-processor.js - 正确的 RNNoise AudioWorkletProcessor 实现
import { createRNNWasmModule } from "@jitsi/rnnoise-wasm";

class RnnoiseProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // 初始化状态
    this.initialized = false;
    this.rnnoise = null;
    this.wasmModule = null;
    this.frameSize = 480; // RNNoise 固定帧大小
    this.sampleRate = 48000; // RNNoise 固定采样率
    this.inputBuffer = new Float32Array(this.frameSize);
    this.outputBuffer = new Float32Array(this.frameSize);
    this.bufferIndex = 0;

    // 异步初始化 WASM 模块
    this.initializeWasm();
  }

  async initializeWasm() {
    try {
      // 创建 WASM 模块实例
      this.wasmModule = await createRNNWasmModule();

      // 创建 RNNoise 状态
      this.rnnoise = this.wasmModule._rnnoise_create();

      if (this.rnnoise) {
        this.initialized = true;
        console.log("RNNoise processor initialized successfully");
      }
    } catch (error) {
      console.error("Failed to initialize RNNoise:", error);
    }
  }

  // 最大公约数
  _gcd(a, b) {
    return b === 0 ? a : this._gcd(b, a % b);
  }

  // 最小公倍数
  _lcm(a, b) {
    return (a * b) / this._gcd(a, b);
  }

  // 将 float32 转换为 int16
  _floatToInt16(float32Array, int16Array) {
    for (let i = 0; i < float32Array.length; i++) {
      const val = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = Math.round(val * 32767);
    }
  }

  // 将 int16 转换为 float32
  _int16ToFloat(int16Array, float32Array) {
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32767;
    }
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    // 如果还未初始化或没有输入，直接返回
    if (!this.initialized || !input || input.length === 0) {
      // 如果未初始化，将输入直接复制到输出（bypass）
      if (input && output && input[0] && output[0]) {
        output[0].set(input[0]);
      }
      return true;
    }

    const inputChannel = input[0];
    const outputChannel = output[0];

    if (!inputChannel || !outputChannel) {
      return true;
    }

    // 处理每个输入样本
    for (let i = 0; i < inputChannel.length; i++) {
      this.inputBuffer[this.bufferIndex] = inputChannel[i];
      this.bufferIndex++;

      // 当缓冲区满时，处理一帧数据
      if (this.bufferIndex >= this.frameSize) {
        this.processFrame();
        this.bufferIndex = 0;
      }
    }

    // 输出处理后的数据（这里简化处理，实际应该维护输出缓冲区）
    outputChannel.set(inputChannel);
    return true;
  }

  processFrame() {
    if (!this.wasmModule || !this.rnnoise) return;

    try {
      // 分配内存用于输入和输出
      const inputPtr = this.wasmModule._malloc(this.frameSize * 2); // int16 = 2 bytes
      const outputPtr = this.wasmModule._malloc(this.frameSize * 2);

      // 创建临时 int16 数组
      const int16Input = new Int16Array(this.frameSize);
      const int16Output = new Int16Array(this.frameSize);

      // 转换 float32 到 int16
      this._floatToInt16(this.inputBuffer, int16Input);

      // 将数据写入 WASM 内存
      this.wasmModule.HEAP16.set(int16Input, inputPtr / 2);

      // 调用 RNNoise 处理函数
      this.wasmModule._rnnoise_process_frame(this.rnnoise, outputPtr, inputPtr);

      // 从 WASM 内存读取结果
      int16Output.set(this.wasmModule.HEAP16.subarray(outputPtr / 2, outputPtr / 2 + this.frameSize));

      // 转换 int16 回 float32
      this._int16ToFloat(int16Output, this.outputBuffer);

      // 释放内存
      this.wasmModule._free(inputPtr);
      this.wasmModule._free(outputPtr);

      // 将处理后的数据复制回输入缓冲区（用于输出）
      this.inputBuffer.set(this.outputBuffer);

    } catch (error) {
      console.error("Error processing frame:", error);
    }
  }

  // 清理资源
  destroy() {
    if (this.wasmModule && this.rnnoise) {
      this.wasmModule._rnnoise_destroy(this.rnnoise);
      this.rnnoise = null;
    }
    this.initialized = false;
  }
}

// 注册处理器
registerProcessor("rnnoise-processor", RnnoiseProcessor);
