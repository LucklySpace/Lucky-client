// src/hooks/useWebSocketWorkerSingleton.ts
import { onBeforeUnmount, shallowReactive, shallowRef } from "vue";
import { useLogger } from "./useLogger";
import { ProtocolMode } from "@/types/env";

/**
 * 模块级单例 WebSocket Worker 管理器（改进版，带详细注释）
 *
 * 目标：
 * - 在模块级保持单个 Worker 实例（避免重复创建多个 worker）
 * - 提供订阅/退订消息的接口（onMessage 返回 unsubscribe）
 * - 支持发送缓冲（连接不可用时缓存消息，连接可用时 flush）
 * - 支持自动释放（当没有订阅者且超过超时后终止 worker）
 * - 支持断线重连（指数退避 + 长轮询周期 + 抖动）
 * - 在实现上尽量稳健：避免重复订阅计数错误、避免缓冲无限增长等
 *
 * 使用注意：
 * - 组件/调用方需负责保存并在卸载/不需要时调用 unsubscribe（onMessage 返回的函数）。
 * - 组件卸载不自动 terminate worker（保持原语义）；若确实想释放，调用 destroy()。
 */

// ---------------------------- 类型声明 ----------------------------

// 与 worker 主从通信的命令类型（发送到 worker）
type WorkerCmd =
  | { type: "connect"; url: string; payload?: any; heartbeat?: any; interval?: number; protocol?: ProtocolMode }
  | { type: "send"; payload: any }
  | { type: "disconnect" };

// worker 发回主线程的事件类型（由 worker.postMessage 传回）
type WorkerEvent =
  | { event: "open" }
  | { event: "message"; data: any }
  | { event: "error"; error: any }
  | { event: "close"; code?: number; reason?: string }
  | { event: "log"; level: string; msg: any[] };

// ---------------------------- 日志 ----------------------------
const log = useLogger(); // 假设项目中有一个日志 Hook：useLogger，提供 .info/.warn/.error 等方法

// ---------------------------- 模块级状态（单例） ----------------------------

// worker 的引用（module scope），使用 shallowRef 以便外部调试时能读取
const workerRef = shallowRef<Worker | null>(null);

// 公开给调用者的状态对象（响应式），包括连接状态、最近消息、错误信息等
const state = shallowReactive({
  connected: false, // 当前是否连上（逻辑上）
  status: "idle" as "idle" | "connecting" | "open" | "closed" | "error", // 更细粒度的状态机字符串
  lastMessage: null as any, // 最后一条收到的消息（原样）
  messages: [] as any[], // 保存的历史消息（最近 N 条，防止内存爆炸）
  error: null as any, // 最近的错误对象
  reconnectionAttempts: 0 // 最近重连尝试计数（可用于 UI 显示）
});

// 使用 Set 保存订阅者（handler），Set 能保证同一函数不会被重复注册
// 如果用户想重复订阅同一个回调，他们应该 wrap 一层新函数
const messageHandlers = new Set<(data: any) => void>();

// 发送缓冲（当连接未 open 或 postMessage 失败时，将消息缓存在这里）
// 注意：此缓冲是按顺序发送（FIFO）
const sendBuffer: any[] = [];

// ---------------------------- 释放与重连控制变量 ----------------------------

// 自动释放超时（当没有订阅者时等待多长时间后 terminate worker）
const AUTO_RELEASE_TIMEOUT = 30_000; // ms
let autoReleaseTimer: ReturnType<typeof setTimeout> | null = null; // auto release 的定时器引用

// 手动断开标记：当调用方显式 disconnect() 时，设置为 true，使得后续不进行自动重连
let manualDisconnect = false;

// 重连调度相关计时器/计数
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectionAttempts = 0; // 实际重连尝试次数（会写入 state.reconnectionAttempts）

// worker 默认路径（指向项目内的 worker 文件）
// 注意：build 环境下确保 import.meta.url + new URL(...) 能被打包器处理
const defaultWorkerPath = new URL("@/worker/Websocket.worker.ts", import.meta.url);

// 记录最后一次 connect 的参数（用于自动重连时重新发起连接）
let lastConnectArgs: {
  url: string;
  options?: { payload?: any; heartbeat?: any; interval?: number; protocol?: ProtocolMode };
  workerPath?: URL;
} | null = null;

// ---------------------------- 可配置项（常量） ----------------------------

// 重连策略参数：
const RECONNECT_BASE_DELAY = 1000; // 初始基数（ms）
const RECONNECT_MAX_DELAY = 30_000; // 指数退避最大值（ms）
const RECONNECT_IMMEDIATE_MAX = 5; // 前 N 次使用指数退避，之后进入 LONG_RETRY_INTERVALS
const LONG_RETRY_INTERVALS = [60_000]; // 超过指数退避后的固定重试间隔（可扩展，例如 [60000,120000,...]）
const RECONNECT_JITTER_RATIO = 0.2; // 抖动比例（0.2 = ±20%）

// 缓冲/历史长度上限，防止内存无限增长
const MAX_SEND_BUFFER = 2000; // sendBuffer 最大长度（超过则丢弃最旧）
const MAX_SAVED_MESSAGES = 200; // state.messages 最多保存条数

// ---------------------------- 辅助函数 ----------------------------

/**
 * 清理重连定时器
 */
function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

/**
 * 根据尝试次数计算重连延迟（ms）
 * - 前 RECONNECT_IMMEDIATE_MAX 次采用指数退避（并截断到 RECONNECT_MAX_DELAY）
 * - 超过之后采用 LONG_RETRY_INTERVALS 的循环值（例如长轮询式的 60s、120s）
 * - 加入随机抖动以避免集群同时重连导致的雪崩
 */
function computeReconnectDelay(attempt: number) {
  let delay: number;
  if (attempt <= RECONNECT_IMMEDIATE_MAX) {
    const exp = Math.pow(2, attempt - 1); // attempt=1 -> 1, attempt=2 ->2, attempt=3 ->4...
    delay = Math.min(RECONNECT_BASE_DELAY * exp, RECONNECT_MAX_DELAY);
  } else {
    // 超过立即退避次数，使用长轮询间隔（可以是数组循环）
    const idx = (attempt - RECONNECT_IMMEDIATE_MAX - 1) % LONG_RETRY_INTERVALS.length;
    delay = LONG_RETRY_INTERVALS[idx];
  }
  const jitter = (Math.random() * 2 - 1) * RECONNECT_JITTER_RATIO * delay; // ± jitter_ratio * delay
  return Math.max(500, Math.round(delay + jitter)); // 最小延迟 500ms
}

/**
 * 取消所有重连相关计数/状态
 * - 清除定时器
 * - 重置尝试次数
 */
function cancelAllReconnects() {
  clearReconnectTimer();
  reconnectionAttempts = 0;
  state.reconnectionAttempts = 0;
}

/**
 * 安全地向 worker postMessage，捕获异常并返回是否成功
 */
function safePost(cmd: WorkerCmd) {
  const w = workerRef.value;
  if (!w) return false;
  try {
    w.postMessage(cmd);
    return true;
  } catch (e) {
    log.error("worker postMessage failed", e);
    return false;
  }
}

/**
 * 当前订阅者数量（由 messageHandlers.size 派生）
 * 说明：我们不使用单独的 refCount 变量避免去重问题（相同 handler 多次注册导致计数错乱）
 */
function getRefCount() {
  return messageHandlers.size;
}

// ---------------------------- Worker 管理：创建 / 销毁 ----------------------------

/**
 * 确保存在一个 worker（单例），若已存在则直接返回
 * - 在创建 worker 时，绑定 onmessage 和 onerror 回调来处理 worker 发回的事件
 * - 如果之前存在自动释放定时器则取消（因为又有订阅出现或手动 connect）
 */
function ensureWorker(workerPath = defaultWorkerPath) {
  if (workerRef.value) return workerRef.value;

  // 取消 auto-release（若正排队释放）
  if (autoReleaseTimer) {
    clearTimeout(autoReleaseTimer);
    autoReleaseTimer = null;
  }

  // 创建 worker（module 模式）
  const w = new Worker(workerPath, { type: "module" });

  // worker -> 主线程 的消息处理入口
  w.onmessage = (evt: MessageEvent<WorkerEvent>) => {
    handleWorkerEvent(evt.data);
  };

  // worker 层级错误（未 catch 的异常）
  w.onerror = ev => {
    state.error = ev;
    state.status = "error";
    state.connected = false;
    log.error("worker error", ev);
    // 若不是手动断开，则安排重连（worker 内部可能已断开）
    if (!manualDisconnect) scheduleReconnect();
  };

  workerRef.value = w;
  return w;
}

/**
 * 立即终止并清理 worker 实例
 * - 清除自动释放定时器
 * - 取消所有重连尝试
 * - terminate worker，置空引用
 * - 清空 sendBuffer（因为 worker 已被释放）
 */
function terminateWorker() {
  if (autoReleaseTimer) {
    clearTimeout(autoReleaseTimer);
    autoReleaseTimer = null;
  }
  cancelAllReconnects();

  if (workerRef.value) {
    try {
      workerRef.value.terminate();
    } catch (e) {
      // ignore terminate 错误
    }
    workerRef.value = null;
  }

  // 清空缓冲并置状态为 closed
  sendBuffer.length = 0;
  state.connected = false;
  state.status = "closed";
}

// ---------------------------- 重连调度 ----------------------------

/**
 * 安排一次重连（在断线或错误时调用）
 * - 根据 reconnectionAttempts 计算延迟
 * - 在触发重连时会调用 ensureWorker 并向 worker 发送 connect 命令（使用 lastConnectArgs）
 * - 如果 postMessage 又失败，则再次 schedule，以避免卡死
 */
function scheduleReconnect() {
  // 如果用户执行了手动断连，则不自动重连
  if (manualDisconnect) return;
  if (!lastConnectArgs) return; // 没有上次连接参数就不能重连

  clearReconnectTimer();
  reconnectionAttempts++;
  state.reconnectionAttempts = reconnectionAttempts;

  const attempt = reconnectionAttempts;
  const delay = computeReconnectDelay(attempt);

  log.info(`scheduling reconnect #${attempt} in ${Math.round(delay / 1000)}s`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (manualDisconnect) return;

    const { url, options, workerPath } = lastConnectArgs!;
    ensureWorker(workerPath ?? defaultWorkerPath);
    state.status = "connecting";

    const ok = safePost({
      type: "connect",
      url,
      payload: options?.payload,
      heartbeat: options?.heartbeat,
      interval: options?.interval,
      protocol: options?.protocol
    } as WorkerCmd);

    if (!ok) {
      // postMessage 失败则尽快再次 schedule（避免出现停滞）
      scheduleReconnect();
    }
  }, delay);
}

// ---------------------------- 处理来自 worker 的事件 ----------------------------

/**
 * 处理 worker 发来的事件（open / message / error / close / log）
 * 说明：
 * - open：表示底层 socket 已连接成功。我们在此 flush sendBuffer。
 * - message：将消息分发给所有订阅者，并保存到 state.messages（有限保存）
 * - error / close：更新状态并在必要时 scheduleReconnect
 */
function handleWorkerEvent(ev: WorkerEvent) {
  switch (ev.event) {
    case "open": {
      // 连接建立 -> 重置重连计数，标记已连接
      cancelAllReconnects();
      state.connected = true;
      state.status = "open";
      state.error = null;

      // flush sendBuffer：按条发送，捕获中途失败
      // 注意：一次性 splice 提取 pending 再在 try/catch 中逐条发送，确保已发送的不会被重复放回
      if (sendBuffer.length && workerRef.value) {
        const pending = sendBuffer.splice(0); // 取走当前的所有待发送，保存在 pending 中
        let i = 0;
        try {
          for (; i < pending.length; i++) {
            // 逐条发送；若在任何一条抛错，将进入 catch
            workerRef.value.postMessage({ type: "send", payload: pending[i] } as WorkerCmd);
          }
        } catch (e) {
          // 将尚未发送的 remaining 放回 sendBuffer 的前端（保持原顺序）
          const remaining = pending.slice(i);
          if (remaining.length) {
            sendBuffer.unshift(...remaining);
          }
          log.error("flush pending sendBuffer failed, scheduling reconnect", e);
          if (!manualDisconnect) scheduleReconnect();
        }
      }
      break;
    }

    case "message": {
      // 收到来自 worker 的消息数据（worker 已按需解析原始 WebSocket 数据）
      state.lastMessage = ev.data;
      state.messages.push(ev.data);

      // 保持 messages 长度上限，避免内存无限增长
      if (state.messages.length > MAX_SAVED_MESSAGES) {
        // 删除最旧的若干条
        state.messages.splice(0, state.messages.length - MAX_SAVED_MESSAGES);
      }

      // 分发给所有订阅者（每个 handler 在 try/catch 中运行以避免一处错误阻塞其他 handler）
      for (const h of messageHandlers) {
        try {
          h(ev.data);
        } catch (e) {
          // 单个 handler 抛错不应该影响其他 handler 或整体状态
          log.error("message handler error", e);
        }
      }
      break;
    }

    case "error": {
      // worker 报错，更新 state 并 scheduleReconnect（若非手动断连）
      state.error = ev.error;
      state.status = "error";
      state.connected = false;
      if (!manualDisconnect) scheduleReconnect();
      break;
    }

    case "close": {
      // 底层连接关闭（明确关闭）
      state.connected = false;
      state.status = "closed";
      if (!manualDisconnect) scheduleReconnect();
      break;
    }

    case "log": {
      // 可选：worker 内部日志级别与内容可以按需转到主线程日志
      // 这里暂时不 forward，放置 hook 点方便调试
      // e.g. log.info("[worker]", ev.msg)
      break;
    }
  }
}

// ---------------------------- 暴露给使用者的 API ----------------------------

/**
 * 连接到指定 URL（建立或重用 worker 并发起 connect 命令）
 * - url：ws://... 或 wss://...
 * - options：可选的 payload（用于鉴权/握手）、心跳策略、协议模式等
 * - workerPath：可选，覆盖默认 worker 文件路径（便于测试/mock）
 *
 * 行为：
 * - 会把 manualDisconnect 设为 false（允许自动重连）
 * - 记录 lastConnectArgs（用于后续自动重连）
 * - 调用 ensureWorker 并向 worker postMessage({type: 'connect', ...})
 * - 如果 postMessage 失败，会调用 scheduleReconnect 以重试（防止卡死）
 */
function connect(
  url: string,
  options?: { payload?: any; heartbeat?: any; interval?: number; protocol?: ProtocolMode },
  workerPath = defaultWorkerPath
) {
  manualDisconnect = false;
  lastConnectArgs = { url, options, workerPath };
  clearReconnectTimer();

  ensureWorker(workerPath);
  state.status = "connecting";
  state.error = null;

  const ok = safePost({
    type: "connect",
    url,
    payload: options?.payload,
    heartbeat: options?.heartbeat,
    interval: options?.interval,
    protocol: options?.protocol
  } as WorkerCmd);

  if (!ok) {
    // postMessage 失败，可能 worker 未就绪或浏览器限制，安排重试
    scheduleReconnect();
  }
}

/**
 * 发送消息（主线程 -> worker -> WebSocket）
 * - 若当前状态是 open 且 worker 存在，尝试直接 post send 命令
 * - 否则将 payload 放入 sendBuffer
 * - 若 send 时 postMessage 失败（可能 worker 已异常），同样将 payload 入缓冲并 scheduleReconnect
 *
 * 注意：payload 的具体协议/序列化由 worker 端实现。这里仅负责传递。
 */
function send(payload: any) {
  if (state.status === "open" && workerRef.value) {
    const ok = safePost({ type: "send", payload } as WorkerCmd);
    if (!ok) {
      // 尝试失败：缓存并触发重连（以便稍后 flush）
      _pushToSendBuffer(payload);
      if (!manualDisconnect) scheduleReconnect();
    }
  } else {
    // 当前不可发送：缓存等待
    _pushToSendBuffer(payload);
  }
}

/**
 * 将 payload 放到 sendBuffer，处理缓冲上限策略
 * - 当前策略：当缓冲已满时，丢弃最旧一条（FIFO），并记录 warn 日志
 * - 可替换为其它策略：抛出异常、丢弃新消息、持久化到磁盘等
 */
function _pushToSendBuffer(payload: any) {
  if (sendBuffer.length >= MAX_SEND_BUFFER) {
    // 丢弃最旧的一条，保证最近的消息有机会先被发送
    sendBuffer.shift();
    log.warn("sendBuffer full, dropping oldest message");
  }
  sendBuffer.push(payload);
}

/**
 * 手动断开连接
 * - 将 manualDisconnect 置 true（阻止自动重连）
 * - 向 worker 发送 disconnect（如果可以）
 * - 更新状态并取消所有自动重连
 *
 * 注意：不会 terminate worker（除非显式调用 destroy）。
 * 这样做是为了保留 worker 的存在以便调用者之后可以调用 connect 快速重连或 reuse worker。
 */
function disconnect() {
  manualDisconnect = true;
  if (workerRef.value) {
    try {
      workerRef.value.postMessage({ type: "disconnect" } as WorkerCmd);
    } catch {
      // ignore
    }
  }
  state.connected = false;
  state.status = "closed";
  cancelAllReconnects();
}

/**
 * 订阅消息（onMessage）
 * - handler：接收每条消息的回调
 * - 返回值：取消订阅的函数（unsubscribe）
 *
 * 关键点：
 * - 如果相同的 handler 已存在（Set 去重），不会重复添加，返回的 unsubscribe 行为仍然有效
 * - 注册新 handler 时会取消任何 pending 的 auto-release
 */
function onMessage(handler: (data: any) => void) {
  if (messageHandlers.has(handler)) {
    // 若已注册同一函数，直接返回具有删除该 handler 行为的 unsubscribe
    return () => {
      if (messageHandlers.delete(handler)) {
        _maybeScheduleAutoRelease();
      }
    };
  }

  messageHandlers.add(handler);

  // 一旦有订阅者出现，取消 auto-release（防止 worker 被 terminate）
  if (autoReleaseTimer) {
    clearTimeout(autoReleaseTimer);
    autoReleaseTimer = null;
  }

  // 返回 unsubscribe
  return () => {
    if (messageHandlers.delete(handler)) {
      _maybeScheduleAutoRelease();
    }
  };
}

/**
 * 若没有订阅者则按照 AUTO_RELEASE_TIMEOUT 安排自动释放
 * - 由 onMessage 的 unsubscribe / destroy / register 等触发
 * - 在定时器触发前若有新订阅则取消释放
 */
function _maybeScheduleAutoRelease() {
  if (getRefCount() === 0 && AUTO_RELEASE_TIMEOUT > 0) {
    if (autoReleaseTimer) {
      clearTimeout(autoReleaseTimer);
      autoReleaseTimer = null;
    }
    autoReleaseTimer = setTimeout(() => {
      // 再次检查，防止在等待期间出现新订阅
      if (getRefCount() === 0) {
        terminateWorker();
        log.info("WebSocket worker auto-terminated due to zero subscribers");
      }
      autoReleaseTimer = null;
    }, AUTO_RELEASE_TIMEOUT);
  }
}

/**
 * 销毁整个模块（强制）
 * - 标记为手动断连
 * - 清空所有订阅
 * - 清除 lastConnectArgs
 * - 终止 worker
 *
 * 使用场景：应用退出、用户登出或测试 teardown
 */
function destroy() {
  manualDisconnect = true;
  messageHandlers.clear();
  lastConnectArgs = null;
  terminateWorker();
}

// ---------------------------- 导出单例接口 ----------------------------

/**
 * useWebSocketWorker - 返回 module 单例的控制 API
 *
 * 返回值说明：
 * - state: 响应式状态对象（connected / status / lastMessage / messages / error / reconnectionAttempts）
 * - connect(url, options, workerPath): 发起连接
 * - send(payload): 发送消息
 * - disconnect(): 手动断开（禁止自动重连）
 * - onMessage(handler): 订阅消息，返回 unsubscribe 函数
 * - destroy(): 完全销毁（强制 terminate worker）
 * - _internal: 仅调试使用的内部访问器（可以读取 worker 引用、lastConnectArgs、订阅数）
 *
 * 注意：该模块在模块级维护单例，跨组件复用同一 worker 与缓冲/状态。
 */
export function useWebSocketWorker() {
  // 组件卸载 hook；我们不自动 terminate worker（保持原先语义）
  onBeforeUnmount(() => {
    // 保留注释：如果希望在最后一个组件卸载时自动终止，可以在这里跟踪 refCount 并 terminate
  });

  return {
    state,
    connect,
    send,
    disconnect,
    onMessage,
    destroy,
    _internal: {
      get worker() {
        return workerRef.value;
      },
      get lastConnectArgs() {
        return lastConnectArgs;
      },
      getRefCount
    }
  };
}

/* ============================================================
   Usage 示例（备注形式，不会在运行时执行）：

import { useWebSocketWorker } from "@/hooks/useWebSocketWorkerSingleton";

const { state, connect, send, onMessage, disconnect, destroy } = useWebSocketWorker();

// 1) 订阅消息
const unsub = onMessage((msg) => {
  console.log("收到消息", msg);
});

// 2) 建立连接（可选心跳、payload）
connect("wss://example.com/ws", { payload: { token: "xxx" }, heartbeat: { type: "ping" }, interval: 30000 });

// 3) 发送
send({ type: "hello", data: "world" });

// 4) 退订
unsub();

// 5) 手动断开（并禁止自动重连）
disconnect();

// 6) 完全销毁（例如 logout）
destroy();

   ============================================================ */
