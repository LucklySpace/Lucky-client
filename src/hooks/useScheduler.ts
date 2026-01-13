/**
 * useScheduler - Web Worker 定时任务调度器 Hook
 *
 * 特性：
 * - 在 Web Worker 中运行，不受主线程阻塞影响
 * - 页面不可见时仍能准确执行（绕过浏览器节流）
 * - 支持多任务管理、暂停/恢复、动态更新间隔
 * - 自动清理，组件卸载时停止所有任务
 */

import { onBeforeUnmount, ref, shallowRef } from "vue";

// ========================= 类型定义 =========================
export interface SchedulerTask {
  /** 任务唯一标识 */
  id: string;
  /** 执行间隔（毫秒） */
  interval: number;
  /** 是否立即执行一次 */
  immediate?: boolean;
  /** 最大执行次数，达到后自动停止 */
  maxRuns?: number;
  /** 附加数据，会在 tick 回调中返回 */
  data?: unknown;
}

export interface TickEvent {
  taskId: string;
  runCount: number;
  data?: unknown;
}

export interface SchedulerCallbacks {
  onTick?: (event: TickEvent) => void;
  onStarted?: (taskId: string) => void;
  onStopped?: (taskId: string) => void;
  onPaused?: (taskId: string) => void;
  onResumed?: (taskId: string) => void;
  onCompleted?: (taskId: string, totalRuns: number) => void;
  onError?: (message: string, taskId?: string) => void;
}

type WorkerEvent =
  | { event: "tick"; taskId: string; runCount: number; data?: unknown }
  | { event: "started"; taskId: string }
  | { event: "stopped"; taskId: string }
  | { event: "paused"; taskId: string }
  | { event: "resumed"; taskId: string }
  | { event: "completed"; taskId: string; totalRuns: number }
  | { event: "error"; taskId?: string; message: string };

// ========================= Hook 实现 =========================
export function useScheduler(callbacks: SchedulerCallbacks = {}) {
  const worker = shallowRef<Worker | null>(null);
  const activeTasks = ref<Set<string>>(new Set());
  const isReady = ref(false);

  // 初始化 Worker
  const initWorker = () => {
    if (worker.value) return;

    try {
      worker.value = new Worker(
        new URL("../worker/Scheduler.worker.ts", import.meta.url),
        { type: "module" }
      );

      worker.value.onmessage = (e: MessageEvent<WorkerEvent>) => {
        handleWorkerMessage(e.data);
      };

      worker.value.onerror = (e) => {
        callbacks.onError?.(`Worker error: ${e.message}`);
      };

      isReady.value = true;
    } catch (err) {
      callbacks.onError?.(`Failed to initialize worker: ${err}`);
    }
  };

  // 处理 Worker 消息
  const handleWorkerMessage = (msg: WorkerEvent) => {
    switch (msg.event) {
      case "tick":
        callbacks.onTick?.({
          taskId: msg.taskId,
          runCount: msg.runCount,
          data: msg.data,
        });
        break;

      case "started":
        activeTasks.value.add(msg.taskId);
        callbacks.onStarted?.(msg.taskId);
        break;

      case "stopped":
        activeTasks.value.delete(msg.taskId);
        callbacks.onStopped?.(msg.taskId);
        break;

      case "paused":
        callbacks.onPaused?.(msg.taskId);
        break;

      case "resumed":
        callbacks.onResumed?.(msg.taskId);
        break;

      case "completed":
        activeTasks.value.delete(msg.taskId);
        callbacks.onCompleted?.(msg.taskId, msg.totalRuns);
        break;

      case "error":
        callbacks.onError?.(msg.message, msg.taskId);
        break;
    }
  };

  // 发送命令到 Worker
  const postCommand = (command: object) => {
    if (!worker.value) {
      initWorker();
    }
    worker.value?.postMessage(command);
  };

  // ========================= 公共 API =========================

  /**
   * 启动定时任务
   */
  const start = (task: SchedulerTask) => {
    postCommand({ type: "start", task });
  };

  /**
   * 快捷方式：创建简单的定时任务
   */
  const startInterval = (
    id: string,
    interval: number,
    options?: Omit<SchedulerTask, "id" | "interval">
  ) => {
    start({ id, interval, ...options });
  };

  /**
   * 停止指定任务
   */
  const stop = (taskId: string) => {
    postCommand({ type: "stop", taskId });
  };

  /**
   * 停止所有任务
   */
  const stopAll = () => {
    postCommand({ type: "stopAll" });
  };

  /**
   * 暂停任务（定时器继续运行但不触发回调）
   */
  const pause = (taskId: string) => {
    postCommand({ type: "pause", taskId });
  };

  /**
   * 恢复任务
   */
  const resume = (taskId: string) => {
    postCommand({ type: "resume", taskId });
  };

  /**
   * 动态更新任务间隔
   */
  const updateInterval = (taskId: string, interval: number) => {
    postCommand({ type: "update", taskId, interval });
  };

  /**
   * 检查任务是否在运行
   */
  const isRunning = (taskId: string): boolean => {
    return activeTasks.value.has(taskId);
  };

  /**
   * 销毁 Worker
   */
  const destroy = () => {
    if (worker.value) {
      stopAll();
      worker.value.terminate();
      worker.value = null;
      isReady.value = false;
      activeTasks.value.clear();
    }
  };

  // 组件卸载时自动清理
  onBeforeUnmount(destroy);

  return {
    // 状态
    isReady,
    activeTasks,

    // 方法
    start,
    startInterval,
    stop,
    stopAll,
    pause,
    resume,
    updateInterval,
    isRunning,
    destroy,
  };
}

// ========================= 单例版本 =========================
let globalScheduler: ReturnType<typeof useScheduler> | null = null;

/**
 * 获取全局单例调度器
 * 适用于跨组件共享的定时任务
 */
export function useGlobalScheduler(callbacks?: SchedulerCallbacks) {
  if (!globalScheduler) {
    // 创建时不使用 onBeforeUnmount，由调用者管理生命周期
    const worker = new Worker(
      new URL("../worker/Scheduler.worker.ts", import.meta.url),
      { type: "module" }
    );

    const activeTasks = ref<Set<string>>(new Set());

    const handleMessage = (e: MessageEvent<WorkerEvent>) => {
      const msg = e.data;
      switch (msg.event) {
        case "tick":
          callbacks?.onTick?.({
            taskId: msg.taskId,
            runCount: msg.runCount,
            data: msg.data,
          });
          break;
        case "started":
          activeTasks.value.add(msg.taskId);
          break;
        case "stopped":
        case "completed":
          activeTasks.value.delete(msg.taskId);
          break;
      }
    };

    worker.onmessage = handleMessage;

    const postCommand = (cmd: object) => worker.postMessage(cmd);

    globalScheduler = {
      isReady: ref(true),
      activeTasks,
      start: (task: SchedulerTask) => postCommand({ type: "start", task }),
      startInterval: (id: string, interval: number, opts?: Omit<SchedulerTask, "id" | "interval">) =>
        postCommand({ type: "start", task: { id, interval, ...opts } }),
      stop: (taskId: string) => postCommand({ type: "stop", taskId }),
      stopAll: () => postCommand({ type: "stopAll" }),
      pause: (taskId: string) => postCommand({ type: "pause", taskId }),
      resume: (taskId: string) => postCommand({ type: "resume", taskId }),
      updateInterval: (taskId: string, interval: number) =>
        postCommand({ type: "update", taskId, interval }),
      isRunning: (taskId: string) => activeTasks.value.has(taskId),
      destroy: () => {
        postCommand({ type: "stopAll" });
        worker.terminate();
        globalScheduler = null;
      },
    };
  }

  return globalScheduler;
}

export default useScheduler;

