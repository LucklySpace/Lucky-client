type TaskCallback = (deadline: IdleDeadline) => void | Promise<void>;

interface TaskOptions {
  /** 数值越小优先级越高，默认 0 */
  priority?: number;
  /** 任务最大等待时间（ms），超过则 next 执行时传递 didTimeout = true */
  timeout?: number;
}

interface InternalTask {
  id: number;
  callback: TaskCallback;
  priority: number;
  timeout?: number;
  enqueueTime: number;
  seq: number; // 稳定排序（相同优先级）
}

interface ExecutorOptions {
  /** 单次空闲周期最多花费多少毫秒，默认 10ms（可调） */
  maxWorkTimePerIdle?: number;
  /** 单次空闲周期最多执行多少个任务，默认 50 */
  maxTasksPerIdle?: number;
  /** requestIdleCallback 超时时间（ms），用于浏览器原生 rIC 的 timeout 参数（可选） */
  ricTimeout?: number;
}

/**
 * 高性能空闲任务执行器
 */
export default class IdleTaskExecutor {
  private heap: InternalTask[] = [];
  private isRunning = false;
  private paused = false;
  private taskIdCounter = 1;
  private seqCounter = 0;
  private scheduledHandle: number | null = null; // requestIdleCallback id 或 setTimeout id
  private options: Required<ExecutorOptions>;

  constructor(options: ExecutorOptions = {}) {
    this.options = {
      maxWorkTimePerIdle: options.maxWorkTimePerIdle ?? 10,
      maxTasksPerIdle: options.maxTasksPerIdle ?? 50,
      ricTimeout: options.ricTimeout ?? 50
    };
  }

  /* ----------------------------
     公共 API
     ---------------------------- */

  /**
   * 添加任务，返回任务 id（用于取消）
   */
  public addTask(callback: TaskCallback, opts: TaskOptions = {}): number {
    const task: InternalTask = {
      id: this.taskIdCounter++,
      callback,
      priority: opts.priority ?? 0,
      timeout: opts.timeout,
      enqueueTime: performance.now(),
      seq: this.seqCounter++
    };
    this.pushHeap(task);
    this.scheduleRun();
    return task.id;
  }

  /**
   * 取消单个任务（如果还在队列中）
   */
  public cancelTask(taskId: number): boolean {
    // 线性查找并删除（因为取消不是高频操作）
    const idx = this.heap.findIndex(t => t.id === taskId);
    if (idx === -1) return false;
    this.removeAt(idx);
    return true;
  }

  /**
   * 取消所有任务
   */
  public cancelAllTasks(): IdleTaskExecutor {
    this.heap = [];
    this.stopScheduled();
    this.isRunning = false;
    return this;
  }

  /**
   * 强制立即执行队列中的所有任务（同步执行——可能阻塞主线程，慎用）
   */
  public runAllTasksImmediately(): IdleTaskExecutor {
    // 以优先顺序同步执行所有任务（该操作会阻塞）
    while (this.heap.length > 0) {
      const task = this.popHeap()!;
      try {
        // 传入一个永远有 timeRemaining 的简易 deadline（didTimeout=true if waited too long）
        const now = performance.now();
        const didTimeout = task.timeout !== undefined && now - task.enqueueTime >= task.timeout;
        const deadline: IdleDeadline = {
          didTimeout,
          timeRemaining: () => Infinity
        };
        // await 如果 callback 返回 Promise，会阻塞当前 async 调用者；这里同步调用、但仍支持 Promise (not awaited)
        const res = task.callback(deadline);
        // 将异步错误捕获（防止未捕获 rejection）
        if (res instanceof Promise) res.catch(err => console.error("Task error", err));
      } catch (err) {
        console.error("Task execution failed", err);
      }
    }
    return this;
  }

  /**
   * 暂停执行（不会清空队列），恢复后会继续调度
   */
  public pause(): void {
    this.paused = true;
    this.stopScheduled();
  }

  public resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.scheduleRun();
  }

  /* ----------------------------
     调度与执行实现（内部）
     ---------------------------- */

  private scheduleRun(): void {
    if (this.paused) return;
    if (this.isRunning) return;
    if (this.heap.length === 0) return;
    this.isRunning = true;

    // 使用兼容的 requestIdleCallback（带 timeout）
    if ("requestIdleCallback" in window) {
      this.scheduledHandle = (window as any).requestIdleCallback((d: IdleDeadline) => this.idleHandler(d), {
        timeout: this.options.ricTimeout
      });
    } else {
      // 回退：使用 setTimeout 模拟一个空闲窗口，尽量不阻塞主线程
      // 我们在回调中构造一个近似的 IdleDeadline（剩余时间基于 maxWorkTimePerIdle）
      this.scheduledHandle = setTimeout(() => {
        const start = performance.now();
        const fakeDeadline: IdleDeadline = {
          didTimeout: false,
          timeRemaining: () => {
            const elapsed = performance.now() - start;
            const remaining = this.options.maxWorkTimePerIdle - elapsed;
            return remaining > 0 ? remaining : 0;
          }
        };
        this.idleHandler(fakeDeadline);
      }, 0) as any;
    }
  }

  private stopScheduled(): void {
    if (this.scheduledHandle == null) return;
    if ("cancelIdleCallback" in window && typeof (window as any).cancelIdleCallback === "function") {
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

  /**
   * 空闲周期处理函数：在允许的时间预算内批量执行任务
   */
  private async idleHandler(deadline: IdleDeadline): Promise<void> {
    const start = performance.now();
    let tasksRun = 0;
    try {
      while (this.heap.length > 0 && tasksRun < this.options.maxTasksPerIdle) {
        // 检查剩余时间：优先使用原生 deadline.timeRemaining()
        const remaining =
          typeof deadline.timeRemaining === "function"
            ? deadline.timeRemaining()
            : this.options.maxWorkTimePerIdle - (performance.now() - start);
        if (remaining <= 0 && !deadline.didTimeout) break; // 没时间了，等下一次
        const task = this.popHeap()!;
        tasksRun++;

        // 如果该任务已经超时（等待时间超过指定 timeout），则传 didTimeout = true 给回调
        const now = performance.now();
        const waited = now - task.enqueueTime;
        const shouldMarkTimeout = task.timeout !== undefined && waited >= task.timeout;

        // 构造一个局部 deadline 给任务（确保 timeRemaining 不超预算）
        const perTaskStart = performance.now();
        const perTaskDeadline: IdleDeadline = {
          didTimeout: shouldMarkTimeout,
          timeRemaining: () => {
            // 以当前周期剩余为准，且不会返回 Infinity（安全）
            const globalRemaining =
              typeof deadline.timeRemaining === "function"
                ? deadline.timeRemaining()
                : Math.max(0, this.options.maxWorkTimePerIdle - (performance.now() - start));
            // 同时也考虑单个任务执行不要虚报过多时间
            const elapsedForThisTask = performance.now() - perTaskStart;
            return Math.max(0, globalRemaining - elapsedForThisTask);
          }
        };

        // 执行任务（await 允许任务是 async；但 await 会让出主线程以处理事件循环）
        try {
          const res = task.callback(perTaskDeadline);
          if (res instanceof Promise) {
            // 不要等太久：但我们仍然 await 以避免一次性启动太多 promise 导致内存增长
            await res;
          }
        } catch (err) {
          console.error("Task execution failed:", err);
        }

        // 如果我们已经超过本次周期目标时间，则停止以免阻塞
        const elapsed = performance.now() - start;
        if (elapsed >= this.options.maxWorkTimePerIdle) break;
      }
    } finally {
      // 若仍有任务，重新调度下一轮；否则标记为空闲
      if (this.heap.length > 0 && !this.paused) {
        this.isRunning = false; // allow scheduleRun to set a new handle
        this.scheduleRun();
      } else {
        this.isRunning = false;
        this.scheduledHandle = null;
      }
    }
  }

  /* ----------------------------
     最小堆（优先队列）实现：按 priority, 然后 seq 保持稳定性
     ---------------------------- */

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
    const last = this.heap.pop()!;
    if (idx === this.heap.length) return; // 刚好是最后一个
    this.heap[idx] = last;
    this.siftDown(idx);
    this.siftUp(idx);
  }

  private compare(a: InternalTask, b: InternalTask): number {
    // priority 小的优先；如果相等则按 seq（更早 enqueue 先出）
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

//import IdleTaskExecutor from './IdleTaskExecutor';

// const executor = new IdleTaskExecutor();

// // 添加第一个任务，优先级为 1，超时时间为 2000 毫秒
// executor.addTask((deadline) => {
//     if (deadline.didTimeout) {
//         console.log('Task 1 executed after timeout.');
//     } else {
//         console.log('Task 1 executed with time remaining:', deadline.timeRemaining());
//     }
// }, { priority: 1, timeout: 2000 });

// // 添加第二个任务，默认优先级为 0，没有超时时间
// executor.addTask((deadline) => {
//     console.log('Task 2 executed with time remaining:', deadline.timeRemaining());
// });

// // 链式调用添加更多任务并立即执行所有任务
// executor
//     .addTask((deadline) => {
//         console.log('Task 3 executed with time remaining:', deadline.timeRemaining());
//     })
//     .addTask((deadline) => {
//         console.log('Task 4 executed with time remaining:', deadline.timeRemaining());
//     })
//     .runAllTasksImmediately(); // 立即执行所有任务

// // 如果需要取消所有任务
// executor.cancelAllTasks();

// // 添加任务并链式调用
// executor
//     .addTask(async (deadline) => {
//         // 模拟一个异步任务
//         if (deadline.timeRemaining() > 0) {
//             // await someAsyncFunction();
//         }
//     }, { priority: 1, timeout: 1000 })
//     .addTask(() => {
//         console.log('Another task');
//     })
//     .runAllTasksImmediately();
