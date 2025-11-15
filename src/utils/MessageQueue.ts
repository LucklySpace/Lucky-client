/**
 * 独立的消息队列工具类，用于削峰填谷。
 */

type BatchHandler<T> = (batch: T[]) => Promise<void> | void;

/**
 * 极简批量合并器（支持 requestAnimationFrame 调度）
 *
 * 使用：
 *   const b = new SimpleBatcher<any>(30); // 用 RAF（默认不传 interval）
 *   b.push(msg).then(item => {})
 */
export class MessageQueue<T> {
  private items: T[] = [];
  private resolvers: ((v: T) => void)[] = [];
  private rejecters: ((e: any) => void)[] = [];

  private scheduled = false;
  private timerId: any = null;
  private rafId: number | null = null;

  /**
   * @param intervalMs 如果传入，使用 setTimeout(intervalMs) 调度；否则在浏览器优先使用 requestAnimationFrame（下一帧触发），不可用时退回到 setTimeout(16)
   * @param batchHandler 可选：在逐条 resolve 之前对整批做一次预处理（例如批量写 DB）
   */
  constructor(private intervalMs?: number, private batchHandler?: BatchHandler<T>) {}

  /**
   * 入队。返回 Promise，当本条在某次 flush 时被逐条 resolve。
   */
  push(item: T): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.items.push(item);
      this.resolvers.push(resolve);
      this.rejecters.push(reject);

      // 如果尚未安排调度，则安排一次（raf 或 timeout）
      if (!this.scheduled) this.schedule();
    });
  }

  /** 立即触发一次 flush（外部可调用） */
  public async flushNow(): Promise<void> {
    if (this.scheduled) {
      // 取消已安排的调度，我们马上处理
      this.cancelSchedule();
    }
    await this.doFlush();
  }

  /** 清理并拒绝所有未处理项（用于停用） */
  public stopAndClear(reason = "batcher stopped") {
    this.cancelSchedule();
    while (this.rejecters.length) {
      const r = this.rejecters.shift()!;
      try {
        r(new Error(reason));
      } catch {}
    }
    this.items = [];
    this.resolvers = [];
  }

  /** 当前队列长度 */
  public length(): number {
    return this.items.length;
  }

  /** 内部：安排一次调度（RAF 或定时） */
  private schedule() {
    this.scheduled = true;
    if (typeof this.intervalMs === "number" && this.intervalMs > 0) {
      this.timerId = setTimeout(() => void this.doFlush(), this.intervalMs);
      return;
    }
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        void this.doFlush();
      });
      return;
    }
    // 退回到微延迟（约 16ms）
    this.timerId = setTimeout(() => void this.doFlush(), 16);
  }

  /** 取消已安排的调度（如果有） */
  private cancelSchedule() {
    this.scheduled = false;
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.timerId != null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  /** 真正的 flush 实现：取出当前所有项，先调用 batchHandler（可选），再逐条 resolve；若 handler 失败则 reject 全批 */
  private async doFlush(): Promise<void> {
    if (!this.scheduled && this.items.length === 0) return;
    // 标记为不再调度（当前这次会处理）
    this.cancelSchedule();

    if (this.items.length === 0) return;

    // 取出 snapshot
    const batch = this.items.splice(0);
    const batchResolvers = this.resolvers.splice(0);
    const batchRejecters = this.rejecters.splice(0);

    try {
      if (this.batchHandler) {
        await this.batchHandler(batch);
      }
      // 逐条 resolve（保证 then 回调按单条收到）
      for (let i = 0; i < batch.length; i++) {
        try {
          batchResolvers[i](batch[i]);
        } catch (e) {
          // 用户 then 回调抛错，不影响其他项
          console.error("resolver error:", e);
        }
      }
    } catch (err) {
      // batchHandler 出错 -> reject 本批次所有 promise
      for (const rej of batchRejecters) {
        try {
          rej(err);
        } catch {}
      }
    } finally {
      // 若在 flush 后仍有未处理项（push 发生在 handler 期间），重新安排下一次调度
      if (this.items.length > 0) this.schedule();
    }
  }
}
