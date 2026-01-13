/**
 * 高性能消息队列 - 自适应批处理 + 时间切片 + 背压控制
 *
 * - 自适应批大小：根据处理耗时动态调整
 * - 时间切片：每帧最多执行 N ms，避免阻塞主线程
 * - 背压控制：队列过长时自动限流
 * - 优先级支持：高优先级消息优先处理
 * - 性能监控：实时统计吞吐量和延迟
 */

// ========================= 类型定义 =========================

type BatchHandler<T> = (batch: T[]) => Promise<void> | void;
type ItemResolver<T> = (value: T) => void;
type ItemRejecter = (error: Error) => void;

interface QueueItem<T> {
  data: T;
  priority: number;
  timestamp: number;
  resolve: ItemResolver<T>;
  reject: ItemRejecter;
}

interface QueueConfig {
  /** 每帧最大执行时间（ms），默认 8ms */
  maxFrameTime?: number;
  /** 初始批大小，默认 10 */
  initialBatchSize?: number;
  /** 最小批大小，默认 1 */
  minBatchSize?: number;
  /** 最大批大小，默认 100 */
  maxBatchSize?: number;
  /** 背压阈值：队列超过此长度时触发限流，默认 1000 */
  backpressureThreshold?: number;
  /** 是否启用优先级，默认 false */
  enablePriority?: boolean;
  /** 调度间隔（ms），0 表示使用 RAF，默认 0 */
  scheduleInterval?: number;
}

interface QueueStats {
  /** 已处理消息总数 */
  processed: number;
  /** 当前队列长度 */
  pending: number;
  /** 平均处理延迟（ms） */
  avgLatency: number;
  /** 每秒处理数（吞吐量） */
  throughput: number;
  /** 当前批大小 */
  currentBatchSize: number;
  /** 是否处于背压状态 */
  isBackpressured: boolean;
}

// ========================= 常量 =========================

const DEFAULT_CONFIG: Required<QueueConfig> = {
  maxFrameTime: 8,
  initialBatchSize: 10,
  minBatchSize: 1,
  maxBatchSize: 100,
  backpressureThreshold: 1000,
  enablePriority: false,
  scheduleInterval: 0,
};

// ========================= 优先级常量 =========================

export const Priority = {
  LOW: 0,
  NORMAL: 1,
  HIGH: 2,
  URGENT: 3,
} as const;

export type PriorityLevel = (typeof Priority)[keyof typeof Priority];

// ========================= 主类 =========================

export class MessageQueue<T> {
  private queue: QueueItem<T>[] = [];
  private config: Required<QueueConfig>;
  private batchHandler?: BatchHandler<T>;

  // 调度状态
  private isScheduled = false;
  private rafId: number | null = null;
  private timerId: ReturnType<typeof setTimeout> | null = null;

  // 自适应参数
  private currentBatchSize: number;
  private lastProcessTime = 0;

  // 统计数据
  private stats = {
    processed: 0,
    totalLatency: 0,
    startTime: Date.now(),
  };

  constructor(config?: QueueConfig | number, batchHandler?: BatchHandler<T>) {
    // 兼容旧 API：constructor(intervalMs?, batchHandler?)
    if (typeof config === "number") {
      this.config = { ...DEFAULT_CONFIG, scheduleInterval: config };
      this.batchHandler = batchHandler;
    } else {
      this.config = { ...DEFAULT_CONFIG, ...config };
      this.batchHandler = batchHandler;
    }

    this.currentBatchSize = this.config.initialBatchSize;
  }

  // ========================= 公共 API =========================

  /**
   * 入队消息
   * @param item 消息数据
   * @param priority 优先级（默认 NORMAL）
   */
  push(item: T, priority: PriorityLevel | number = Priority.NORMAL): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const queueItem: QueueItem<T> = {
        data: item,
        priority: this.config.enablePriority ? priority : Priority.NORMAL,
        timestamp: performance.now(),
        resolve,
        reject,
      };

      // 优先级插入
      if (this.config.enablePriority && priority > Priority.NORMAL) {
        this.insertByPriority(queueItem);
      } else {
        this.queue.push(queueItem);
      }

      this.scheduleFlush();
    });
  }

  /** 立即刷新队列 */
  async flushNow(): Promise<void> {
    this.cancelSchedule();
    await this.processQueue();
  }

  /** 停止并清空队列 */
  stopAndClear(reason = "Queue stopped"): void {
    this.cancelSchedule();
    const error = new Error(reason);
    for (const item of this.queue) {
      item.reject(error);
    }
    this.queue = [];
  }

  /** 获取当前队列长度 */
  length(): number {
    return this.queue.length;
  }

  /** 获取统计信息 */
  getStats(): QueueStats {
    const elapsed = (Date.now() - this.stats.startTime) / 1000 || 1;
    return {
      processed: this.stats.processed,
      pending: this.queue.length,
      avgLatency: this.stats.processed > 0
        ? this.stats.totalLatency / this.stats.processed
        : 0,
      throughput: this.stats.processed / elapsed,
      currentBatchSize: this.currentBatchSize,
      isBackpressured: this.isBackpressured(),
    };
  }

  /** 检查是否处于背压状态 */
  isBackpressured(): boolean {
    return this.queue.length >= this.config.backpressureThreshold;
  }

  /** 重置统计 */
  resetStats(): void {
    this.stats = { processed: 0, totalLatency: 0, startTime: Date.now() };
  }

  // ========================= 内部方法 =========================

  /** 按优先级插入 */
  private insertByPriority(item: QueueItem<T>): void {
    // 从后向前找到第一个优先级 >= 当前的位置
    let i = this.queue.length - 1;
    while (i >= 0 && this.queue[i].priority < item.priority) {
      i--;
    }
    this.queue.splice(i + 1, 0, item);
  }

  /** 调度刷新 */
  private scheduleFlush(): void {
    if (this.isScheduled) return;
    this.isScheduled = true;

    const { scheduleInterval } = this.config;

    if (scheduleInterval > 0) {
      this.timerId = setTimeout(() => this.onSchedule(), scheduleInterval);
    } else if (typeof requestAnimationFrame === "function") {
      this.rafId = requestAnimationFrame(() => this.onSchedule());
    } else {
      this.timerId = setTimeout(() => this.onSchedule(), 16);
    }
  }

  /** 取消调度 */
  private cancelSchedule(): void {
    this.isScheduled = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  /** 调度回调 */
  private onSchedule(): void {
    this.isScheduled = false;
    this.rafId = null;
    this.timerId = null;
    this.processQueue();
  }

  /** 处理队列（时间切片） */
  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) return;

    const frameStart = performance.now();
    const { maxFrameTime } = this.config;

    while (this.queue.length > 0) {
      // 时间切片检查
      const elapsed = performance.now() - frameStart;
      if (elapsed >= maxFrameTime) {
        // 让出主线程，下一帧继续
        this.scheduleFlush();
        return;
      }

      // 计算本轮批大小（自适应）
      const batchSize = Math.min(this.currentBatchSize, this.queue.length);
      const batch = this.queue.splice(0, batchSize);

      await this.processBatch(batch);

      // 自适应调整批大小
      this.adjustBatchSize();
    }
  }

  /** 处理一批消息 */
  private async processBatch(batch: QueueItem<T>[]): Promise<void> {
    const batchStart = performance.now();

    try {
      // 调用批处理器（如果有）
      if (this.batchHandler) {
        const items = batch.map((b) => b.data);
        await this.batchHandler(items);
      }

      // 逐个 resolve
      const now = performance.now();
      for (const item of batch) {
        const latency = now - item.timestamp;
        this.stats.totalLatency += latency;
        this.stats.processed++;

        try {
          item.resolve(item.data);
        } catch {
          // 用户回调错误不影响其他消息
        }
      }
    } catch (err) {
      // 批处理器出错，reject 整批
      const error = err instanceof Error ? err : new Error(String(err));
      for (const item of batch) {
        item.reject(error);
      }
    }

    this.lastProcessTime = performance.now() - batchStart;
  }

  /** 自适应调整批大小 */
  private adjustBatchSize(): void {
    const { minBatchSize, maxBatchSize, maxFrameTime } = this.config;

    if (this.lastProcessTime === 0) return;

    // 计算理想批大小：目标是每批处理时间约为 maxFrameTime 的 60%
    const targetTime = maxFrameTime * 0.6;
    const timePerItem = this.lastProcessTime / this.currentBatchSize;

    if (timePerItem > 0) {
      const idealBatchSize = Math.floor(targetTime / timePerItem);

      // 平滑调整（避免剧烈波动）
      const newSize = Math.round(this.currentBatchSize * 0.7 + idealBatchSize * 0.3);

      this.currentBatchSize = Math.max(
        minBatchSize,
        Math.min(maxBatchSize, newSize)
      );
    }

    // 背压时增大批大小，加速消费
    if (this.isBackpressured()) {
      this.currentBatchSize = Math.min(
        maxBatchSize,
        Math.ceil(this.currentBatchSize * 1.5)
      );
    }
  }
}

// ========================= 便捷工厂函数 =========================

/**
 * 创建高性能消息队列
 */
export function createMessageQueue<T>(
  config?: QueueConfig,
  batchHandler?: BatchHandler<T>
): MessageQueue<T> {
  return new MessageQueue<T>(config, batchHandler);
}

/**
 * 创建带优先级的消息队列
 */
export function createPriorityQueue<T>(
  config?: Omit<QueueConfig, "enablePriority">,
  batchHandler?: BatchHandler<T>
): MessageQueue<T> {
  return new MessageQueue<T>({ ...config, enablePriority: true }, batchHandler);
}

export default MessageQueue;
