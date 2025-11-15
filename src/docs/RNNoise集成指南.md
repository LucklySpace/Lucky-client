# RNNoise 降噪集成指南

本指南介绍如何在WebRTC项目中正确集成和使用 `@jitsi/rnnoise-wasm` 进行实时音频降噪。

## 概述

RNNoise是一个基于循环神经网络的实时音频降噪解决方案，特别适合用于语音通信场景。我们的集成包括：

1. **AudioWorkletProcessor** - 基于Web Audio API的实时音频处理
2. **WebRTC集成** - 在WebRTC推流中自动应用降噪
3. **Vue Hook** - 便于在Vue组件中管理降噪功能
4. **完整示例** - 演示各种使用场景

## 核心组件

### 1. RNNoise处理器 (`rnnoise-processor.js`)

这是核心的音频处理器，运行在Web Worker中，负责实际的降噪计算：

```javascript
// 关键特性
- 48kHz采样率（RNNoise要求）
- 480样本帧大小
- 实时处理，低延迟
- 自动资源管理
```

### 2. WebRTC集成 (`WebRTC.ts`)

在WebRTC类中集成了降噪功能：

```typescript
// 启用降噪
const webrtc = new WebRTC()
webrtc.setNoiseSuppressionEnabled(true)

// 推流时自动应用降噪
await webrtc.publish('stream-key', videoElement)

// 获取降噪状态
const status = webrtc.getNoiseSuppressionStatus()
```

### 3. Vue Hook (`useNoiseSuppression.ts`)

提供Vue组件中使用的响应式降噪功能：

```typescript
const { 
  state, 
  isReady, 
  canProcess, 
  applyNoiseSuppression, 
  toggleNoiseSuppression 
} = useNoiseSuppression({ enabled: true })
```

## 快速开始

### 1. 基本使用

```typescript
import { useNoiseSuppression } from '@/hooks/useNoiseSuppression'

// 在Vue组件中
const { applyNoiseSuppression, toggleNoiseSuppression } = useNoiseSuppression()

// 启用降噪
toggleNoiseSuppression(true)

// 获取音频流
const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

// 应用降噪
const result = await applyNoiseSuppression(stream)
if (result) {
  // 使用处理后的流
  videoElement.srcObject = result.processedStream
  
  // 记得清理资源
  // result.cleanup()
}
```

### 2. WebRTC集成

```typescript
import WebRTC from '@/utils/WebRTC'

const webrtc = new WebRTC()

// 启用降噪（在publish之前）
webrtc.setNoiseSuppressionEnabled(true)

// 推流时自动应用降噪
await webrtc.publish('my-stream', videoElement)

// 检查状态
const status = webrtc.getNoiseSuppressionStatus()
console.log('降噪状态:', status)
```

### 3. 手动音频处理

```typescript
// 创建音频上下文
const audioContext = new AudioContext({ sampleRate: 48000 })

// 加载处理器
await audioContext.audioWorklet.addModule('./rnnoise-processor.js')

// 创建处理链
const source = audioContext.createMediaStreamSource(inputStream)
const processor = new AudioWorkletNode(audioContext, 'rnnoise-processor')
const destination = audioContext.createMediaStreamDestination()

// 连接节点
source.connect(processor)
processor.connect(destination)

// 获取处理后的流
const outputStream = destination.stream
```

## 配置选项

### WebRTC配置

```typescript
const webrtc = new WebRTC({
  audio: {
    echoCancellation: true,
    noiseSuppression: false, // 使用RNNoise而非浏览器内置
    autoGainControl: false,
    sampleRate: 48000
  }
})
```

### Hook配置

```typescript
const noiseSuppressionHook = useNoiseSuppression({
  enabled: true,
  sampleRate: 48000,
  latencyHint: 'interactive'
})
```

## 性能优化

### 1. 延迟优化

- 使用 `latencyHint: 'interactive'` 获得最低延迟
- 确保采样率为48kHz（RNNoise优化采样率）
- 避免不必要的音频格式转换

### 2. 资源管理

```typescript
// 正确的资源清理
const result = await applyNoiseSuppression(stream)
if (result) {
  // 使用完毕后清理
  result.cleanup()
}

// WebRTC自动清理
webrtc.close() // 会自动清理降噪资源
```

### 3. 错误处理

```typescript
try {
  const result = await applyNoiseSuppression(stream)
  // 使用result
} catch (error) {
  console.error('降噪应用失败:', error)
  // 回退到原始流
  videoElement.srcObject = stream
}
```

## 故障排除

### 常见问题

1. **WASM加载失败**
   ```
   错误: Failed to initialize RNNoise
   解决: 检查网络连接，确保@jitsi/rnnoise-wasm正确安装
   ```

2. **音频上下文被挂起**
   ```
   错误: AudioContext was not allowed to start
   解决: 确保在用户交互后初始化音频上下文
   ```

3. **采样率不匹配**
   ```
   错误: 音频处理异常
   解决: 确保音频上下文采样率为48kHz
   ```

4. **内存泄漏**
   ```
   问题: 长时间使用后性能下降
   解决: 确保调用cleanup()函数清理资源
   ```

### 调试技巧

```typescript
// 启用详细日志
import Log from '@/utils/Log'

// 监听处理器消息
processor.port.onmessage = (event) => {
  Log.colorLog('rnnoise', `消息: ${JSON.stringify(event.data)}`, 'debug')
}

// 检查音频上下文状态
console.log('AudioContext状态:', audioContext.state)
console.log('采样率:', audioContext.sampleRate)
```

## 浏览器兼容性

| 浏览器     | 版本要求 | 备注       |
|---------|------|----------|
| Chrome  | 66+  | 完全支持     |
| Firefox | 76+  | 完全支持     |
| Safari  | 14+  | 需要用户交互启动 |
| Edge    | 79+  | 完全支持     |

## API参考

### useNoiseSuppression Hook

```typescript
interface NoiseSuppressionOptions {
  enabled?: boolean
  sampleRate?: number
  latencyHint?: 'interactive' | 'balanced' | 'playback'
}

interface NoiseSuppressionState {
  enabled: boolean
  initialized: boolean
  audioContextState: string | null
  processingLatency: number
  error: string | null
}
```

### WebRTC集成方法

```typescript
// 设置降噪状态
setNoiseSuppressionEnabled(enable: boolean): void

// 获取降噪状态
isNoiseSuppressionEnabled(): boolean

// 获取详细状态
getNoiseSuppressionStatus(): {
  enabled: boolean
  initialized: boolean
  audioContextState?: string
}
```

## 最佳实践

1. **初始化时机**: 在用户首次交互后初始化音频上下文
2. **资源清理**: 始终在组件卸载时调用cleanup()
3. **错误回退**: 降噪失败时回退到原始音频流
4. **性能监控**: 监控处理延迟，必要时调整配置
5. **用户体验**: 提供降噪开关让用户自主选择

## 示例项目

完整的使用示例请参考 `src/examples/NoiseSuppressionExample.vue`，其中包含：

- 实时音频捕获和降噪
- WebRTC集成演示
- 状态监控界面
- 错误处理示例
- 资源管理最佳实践

## 技术支持

如遇到问题，请：

1. 检查浏览器控制台错误信息
2. 确认浏览器版本兼容性
3. 验证音频权限是否正确授予
4. 参考故障排除章节的解决方案
