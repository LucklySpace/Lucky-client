/**
 * Scheduler Worker - 定时任务调度器
 * 在 Web Worker 中运行定时器，避免主线程阻塞和页面不可见时的节流问题
 */

// ========================= 类型定义 =========================
interface TaskConfig {
  id: string;
  interval: number;
  immediate?: boolean;
  maxRuns?: number;
  data?: unknown;
}

type WorkerCommand =
  | { type: "start"; task: TaskConfig }
  | { type: "stop"; taskId: string }
  | { type: "stopAll" }
  | { type: "pause"; taskId: string }
  | { type: "resume"; taskId: string }
  | { type: "update"; taskId: string; interval: number };

type WorkerEvent =
  | { event: "tick"; taskId: string; runCount: number; data?: unknown }
  | { event: "started"; taskId: string }
  | { event: "stopped"; taskId: string }
  | { event: "paused"; taskId: string }
  | { event: "resumed"; taskId: string }
  | { event: "completed"; taskId: string; totalRuns: number }
  | { event: "error"; taskId?: string; message: string };

// ========================= 任务状态 =========================
interface TaskState {
  config: TaskConfig;
  timerId: number | null;
  runCount: number;
  isPaused: boolean;
}

// ========================= Scheduler 类 =========================
class SchedulerWorker {
  private tasks = new Map<string, TaskState>();

  constructor(private readonly ctx: Worker) {
    this.ctx.onmessage = (e: MessageEvent<WorkerCommand>) => this.handleCommand(e.data);
  }

  private handleCommand(cmd: WorkerCommand) {
    try {
      switch (cmd.type) {
        case "start":
          this.startTask(cmd.task);
          break;
        case "stop":
          this.stopTask(cmd.taskId);
          break;
        case "stopAll":
          this.stopAllTasks();
          break;
        case "pause":
          this.pauseTask(cmd.taskId);
          break;
        case "resume":
          this.resumeTask(cmd.taskId);
          break;
        case "update":
          this.updateTask(cmd.taskId, cmd.interval);
          break;
      }
    } catch (err) {
      this.emit({ event: "error", message: String(err) });
    }
  }

  private startTask(config: TaskConfig) {
    const { id, interval, immediate = false, maxRuns, data } = config;

    // 如果任务已存在，先停止
    if (this.tasks.has(id)) {
      this.stopTask(id);
    }

    const state: TaskState = {
      config: { id, interval, immediate, maxRuns, data },
      timerId: null,
      runCount: 0,
      isPaused: false,
    };

    this.tasks.set(id, state);

    // 立即执行一次
    if (immediate) {
      this.tick(id);
    }

    // 启动定时器
    state.timerId = self.setInterval(() => this.tick(id), interval) as unknown as number;
    this.emit({ event: "started", taskId: id });
  }

  private tick(taskId: string) {
    const state = this.tasks.get(taskId);
    if (!state || state.isPaused) return;

    state.runCount++;

    this.emit({
      event: "tick",
      taskId,
      runCount: state.runCount,
      data: state.config.data,
    });

    // 检查是否达到最大运行次数
    if (state.config.maxRuns && state.runCount >= state.config.maxRuns) {
      this.emit({ event: "completed", taskId, totalRuns: state.runCount });
      this.stopTask(taskId);
    }
  }

  private stopTask(taskId: string) {
    const state = this.tasks.get(taskId);
    if (!state) return;

    if (state.timerId !== null) {
      clearInterval(state.timerId);
    }

    this.tasks.delete(taskId);
    this.emit({ event: "stopped", taskId });
  }

  private stopAllTasks() {
    const taskIds = Array.from(this.tasks.keys());
    taskIds.forEach((id) => this.stopTask(id));
  }

  private pauseTask(taskId: string) {
    const state = this.tasks.get(taskId);
    if (!state || state.isPaused) return;

    state.isPaused = true;
    this.emit({ event: "paused", taskId });
  }

  private resumeTask(taskId: string) {
    const state = this.tasks.get(taskId);
    if (!state || !state.isPaused) return;

    state.isPaused = false;
    this.emit({ event: "resumed", taskId });
  }

  private updateTask(taskId: string, interval: number) {
    const state = this.tasks.get(taskId);
    if (!state) return;

    // 清除旧定时器
    if (state.timerId !== null) {
      clearInterval(state.timerId);
    }

    // 更新配置并重新启动
    state.config.interval = interval;
    state.timerId = self.setInterval(() => this.tick(taskId), interval) as unknown as number;
  }

  private emit(event: WorkerEvent) {
    this.ctx.postMessage(event);
  }
}

new SchedulerWorker(self as unknown as Worker);
export {};

