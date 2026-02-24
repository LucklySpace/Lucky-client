/* =========================== Revised IdleTaskExecutor =========================== */
import { logger } from "@/hooks/useLogger";

/**
 * 任务回调签名（兼容 requestIdleCallback 的 IdleDeadline）
 */
export type TaskCallback = (deadline: IdleDeadline) => void | Promise<void>;

export interface TaskOptions {
  /** 数值越小优先级越高，默认 0 */
  priority?: number;
  /** 任务最大等待时间（ms），超时则标记 didTimeout 为 true */
  timeout?: number;
  /** 单次任务最大执行时间（ms），默认 5ms，防止阻塞 */
  maxExecutionTime?: number;
}

interface InternalTask {
  id: number;
  callback: TaskCallback;
  priority: number;
  timeout?: number;
  maxExecutionTime: number;
  enqueueTime: number;
  seq: number;
}

export interface ExecutorOptions {
  /** 单次空闲周期最多花费多少毫秒，默认 8ms */
  maxWorkTimePerIdle?: number;
  /** 单次空闲周期最多执行多少个任务，默认 20 */
  maxTasksPerIdle?: number;
  /** requestIdleCallback 的 timeout（ms），默认 50ms */
  ricTimeout?: number;
  /** 最小任务间隔（ms），确保主线程有喘息机会，默认 1ms */
  minTaskInterval?: number;
}

/**
 * 注意：
 * - 默认 task.maxExecutionTime 现在为 1000ms（1s），如果你需要写入类任务不被中断，
 *   在 addTask 时传入 { maxExecutionTime: 0 } 表示“无限制”。
 */

function isFunction(v: any): v is Function {
  return typeof v === "function";
}

class IdleTaskExecutor {
  private heap: InternalTask[] = [];
  private isRunning = false;
  private paused = false;
  private taskIdCounter = 1;
  private seqCounter = 0;
  private scheduledHandle: number | null = null;
  private options: Required<ExecutorOptions>;

  constructor(options: ExecutorOptions = {}) {
    this.options = {
      maxWorkTimePerIdle: options.maxWorkTimePerIdle ?? 8,
      maxTasksPerIdle: options.maxTasksPerIdle ?? 20,
      ricTimeout: options.ricTimeout ?? 50,
      minTaskInterval: options.minTaskInterval ?? 1
    };
  }

  /* ---------------------------- 公共 API ---------------------------- */

  public addTask(callback: TaskCallback, opts: TaskOptions = {}): number {
    const task: InternalTask = {
      id: this.taskIdCounter++,
      callback,
      priority: opts.priority ?? 0,
      timeout: opts.timeout,
      // 默认 1000ms（1s）。设置为 0 表示“不设置超时 / 无限制”。
      maxExecutionTime: typeof opts.maxExecutionTime === "number" ? opts.maxExecutionTime : 1000,
      enqueueTime: performance.now(),
      seq: this.seqCounter++
    };
    this.pushHeap(task);
    this.scheduleRun();
    return task.id;
  }

  public cancelTask(taskId: number): boolean {
    const idx = this.heap.findIndex(t => t.id === taskId);
    if (idx === -1) return false;
    this.removeAt(idx);
    return true;
  }

  public cancelAllTasks(): IdleTaskExecutor {
    this.heap = [];
    this.stopScheduled();
    this.isRunning = false;
    return this;
  }

  public async runAllTasksImmediately(): Promise<IdleTaskExecutor> {
    // 同步地跑完所有任务，但仍对每个任务应用 maxExecutionTime（如果为 0 则无限）
    while (this.heap.length > 0) {
      const task = this.popHeap()!;
      const didTimeout = task.timeout !== undefined && performance.now() - task.enqueueTime >= task.timeout;
      const deadline: IdleDeadline = {
        didTimeout,
        timeRemaining: () => Infinity
      };

      try {
        const start = performance.now();
        const res = task.callback(deadline);
        // 支持 Promise 返回的任务，respect task.maxExecutionTime (0->no timeout)
        if (res instanceof Promise) {
          await this.runWithTimeout(res, task.maxExecutionTime);
        }
        const elapsed = performance.now() - start;
        if (typeof task.maxExecutionTime === "number" && task.maxExecutionTime > 0 && elapsed > task.maxExecutionTime) {
          logger.warn(`Task ${task.id} exceeded maxExecutionTime (${task.maxExecutionTime}ms)`);
        }
      } catch (err) {
        logger.error(`Task ${task.id} execution failed:`, err);
      }
      // 微暂停，给主线程喘息
      await new Promise(resolve => setTimeout(resolve, this.options.minTaskInterval));
    }
    return this;
  }

  public pause(): void {
    this.paused = true;
    this.stopScheduled();
  }

  public resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.scheduleRun();
  }

  public getQueueLength(): number {
    return this.heap.length;
  }

  /* ---------------------------- internal helpers ---------------------------- */

  // runWithTimeout：如果 timeoutMs === 0 表示无限制（不超时）；否则用 Promise.race 保护
  private runWithTimeout<T>(p: Promise<T>, timeoutMs: number): Promise<T> {
    if (!p) return Promise.resolve(undefined as any);
    if (!timeoutMs || timeoutMs <= 0) {
      // unlimited
      return p.catch(err => {
        // 将错误抛回调用者
        throw err;
      });
    }
    return new Promise<T>((resolve, reject) => {
      let done = false;
      p.then(r => {
        if (done) return;
        done = true;
        resolve(r);
      }).catch(err => {
        if (done) return;
        done = true;
        reject(err);
      });
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error("Task timeout"));
      }, timeoutMs);
      // ensure to clear timer when finished
      p.finally(() => clearTimeout(timer));
    });
  }

  /* ---------------------------- 调度与执行 ---------------------------- */

  private scheduleRun(): void {
    if (this.paused || this.isRunning || this.heap.length === 0) return;
    this.isRunning = true;

    if ("requestIdleCallback" in window) {
      this.scheduledHandle = (window as any).requestIdleCallback(
        (deadline: IdleDeadline) => this.idleHandler(deadline),
        { timeout: this.options.ricTimeout }
      );
    } else {
      this.scheduledHandle = setTimeout(() => {
        const start = performance.now();
        this.idleHandler({
          didTimeout: false,
          timeRemaining: () => Math.max(0, this.options.maxWorkTimePerIdle - (performance.now() - start))
        });
      }, 0) as any;
    }
  }

  private stopScheduled(): void {
    if (this.scheduledHandle == null) return;
    if ("cancelIdleCallback" in window) {
      try {
        (window as any).cancelIdleCallback(this.scheduledHandle);
      } catch {
      }
    } else {
      clearTimeout(this.scheduledHandle);
    }
    this.scheduledHandle = null;
    this.isRunning = false;
  }

  private async idleHandler(deadline: IdleDeadline): Promise<void> {
    const cycleStart = performance.now();
    let tasksRun = 0;

    try {
      while (this.heap.length > 0 && tasksRun < this.options.maxTasksPerIdle) {
        // 计算全局剩余时间（安全退化）
        let globalRemaining = 0;
        try {
          globalRemaining = isFunction(deadline.timeRemaining)
            ? deadline.timeRemaining()
            : this.options.maxWorkTimePerIdle - (performance.now() - cycleStart);
        } catch {
          globalRemaining = this.options.maxWorkTimePerIdle - (performance.now() - cycleStart);
        }

        // 如果没剩余时间且没有 didTimeout 标识，则退出本次空闲周期
        if (globalRemaining <= 0 && !deadline.didTimeout) break;

        const task = this.popHeap()!;
        tasksRun++;

        const taskStart = performance.now();
        const taskDidTimeout = task.timeout !== undefined && performance.now() - task.enqueueTime >= task.timeout;
        const taskDeadline: IdleDeadline = {
          didTimeout: taskDidTimeout,
          timeRemaining: () => {
            // 返回不大于 globalRemaining 且不超过 task.maxExecutionTime
            const taskElapsed = performance.now() - taskStart;
            const allowed =
              task.maxExecutionTime && task.maxExecutionTime > 0
                ? Math.max(0, task.maxExecutionTime - taskElapsed)
                : Infinity;
            return Math.max(0, Math.min(globalRemaining, allowed === Infinity ? globalRemaining : allowed));
          }
        };

        try {
          const res = task.callback(taskDeadline);
          if (res instanceof Promise) {
            // await with task-level timeout (0 => unlimited)
            await this.runWithTimeout(res, task.maxExecutionTime);
          }
        } catch (err) {
          logger.error(`Task ${task.id} execution failed:`, err);
        }

        const elapsedCycle = performance.now() - cycleStart;
        if (elapsedCycle >= this.options.maxWorkTimePerIdle) break;

        // 微暂停，避免长时间占用主线程
        if (tasksRun < this.options.maxTasksPerIdle) {
          await new Promise(resolve => setTimeout(resolve, this.options.minTaskInterval));
        }
      }
    } finally {
      this.isRunning = false;
      if (this.heap.length > 0 && !this.paused) {
        this.scheduleRun();
      } else {
        this.scheduledHandle = null;
      }
    }
  }

  /* ---------------------------- 最小堆实现 ---------------------------- */

  private pushHeap(task: InternalTask): void {
    this.heap.push(task);
    this.siftUp(this.heap.length - 1);
  }

  private popHeap(): InternalTask | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  private removeAt(idx: number): void {
    if (idx >= this.heap.length) return;
    const last = this.heap.pop()!;
    if (idx === this.heap.length) return;
    this.heap[idx] = last;
    this.siftDown(idx);
    this.siftUp(idx);
  }

  private compare(a: InternalTask, b: InternalTask): number {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.seq - b.seq;
  }

  private siftUp(idx: number): void {
    const heap = this.heap;
    const item = heap[idx];
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      const parent = heap[parentIdx];
      if (this.compare(item, parent) >= 0) break;
      heap[idx] = parent;
      idx = parentIdx;
    }
    heap[idx] = item;
  }

  private siftDown(idx: number): void {
    const heap = this.heap;
    const len = heap.length;
    const item = heap[idx];
    while (true) {
      let left = (idx << 1) + 1;
      let right = left + 1;
      let smallest = idx;
      if (left < len && this.compare(heap[left], heap[smallest]) < 0) smallest = left;
      if (right < len && this.compare(heap[right], heap[smallest]) < 0) smallest = right;
      if (smallest === idx) break;
      heap[idx] = heap[smallest];
      idx = smallest;
    }
    heap[idx] = item;
  }
}

/* ================================ 单例 + Vue3 composable ================================ */
let singletonExecutor: IdleTaskExecutor | null = null;

export function useIdleTaskExecutor(options?: ExecutorOptions) {
  if (!singletonExecutor) {
    singletonExecutor = new IdleTaskExecutor(options);
  }

  return {
    addTask: (cb: TaskCallback, opts?: TaskOptions) => singletonExecutor!.addTask(cb, opts),
    cancelTask: (taskId: number) => singletonExecutor!.cancelTask(taskId),
    cancelAllTasks: () => singletonExecutor!.cancelAllTasks(),
    pause: () => singletonExecutor!.pause(),
    resume: () => singletonExecutor!.resume(),
    runAllTasksImmediately: () => singletonExecutor!.runAllTasksImmediately(),
    getQueueLength: () => singletonExecutor!.getQueueLength(),
    getQueueLengthComputed: () => computed(() => singletonExecutor!.getQueueLength())
  } as const;
}
