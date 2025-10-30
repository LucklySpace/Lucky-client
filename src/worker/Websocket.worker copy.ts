// src/workers/websocket.worker.ts
// Worker 脚本：负责实际的 WebSocket 连接、心跳、指数退避重连，并通过 postMessage 与主线程通信

type WorkerCommand =
  | { type: "connect"; url: string; payload?: any; heartbeat?: any; interval?: number }
  | { type: "send"; payload: any }
  | { type: "disconnect" };

type WorkerEvent =
  | { event: "open" }
  | { event: "message"; data: any }
  | { event: "error"; error: any }
  | { event: "close"; code?: number; reason?: string }
  | { event: "log"; level: "info" | "warn" | "error" | "debug"; msg: any };

// 在 worker 上下文中，self 指向 DedicatedWorkerGlobalScope
const ctx: Worker & typeof globalThis = self as any;

class InnerWebSocketWorker {
  private ws: WebSocket | null = null;
  private heartbeatTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private reconnectCount = 0;
  private readonly maxReconnects = 10;
  private readonly baseDelay = 5000; // ms
  private isReconnecting = false;
  private connConfig: { url: string; payload?: any; heartbeat?: any; interval?: number } | null = null;

  constructor() {
    ctx.onmessage = (e: MessageEvent<WorkerCommand>) => {
      try {
        this.handleCommand(e.data);
      } catch (err) {
        this.post({ event: "error", error: String(err) });
      }
    };
    this.postLog("info", "[Worker] 已就绪");
  }

  private handleCommand(cmd: WorkerCommand) {
    switch (cmd.type) {
      case "connect":
        if (!cmd.url) {
          this.postLog("warn", "[Worker] connect 缺少 url");
          return;
        }
        this.connConfig = {
          url: cmd.url,
          payload: cmd.payload,
          heartbeat: cmd.heartbeat ?? "ping",
          interval: cmd.interval ?? 30000
        };
        this.connect(cmd.url, cmd.payload, cmd.heartbeat ?? "ping", cmd.interval ?? 30000);
        break;
      case "send":
        this.send(cmd.payload);
        break;
      case "disconnect":
        this.disconnect();
        break;
      default:
        this.postLog("warn", "[Worker] 未知命令", cmd);
    }
  }

  private connect(url: string, initPayload?: any, heartbeatPayload: any = "ping", intervalMs: number = 30000) {
    // 清理原有
    this.clearTimers();
    if (this.ws) {
      try {
        this.ws.close(1000, "重连/新建连接");
      } catch {
      }
      this.ws = null;
    }

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      this.post({ event: "error", error: String(err) });
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectCount = 0;
      this.isReconnecting = false;
      this.postLog("info", "[Worker] WebSocket 已连接");
      if (initPayload !== undefined && initPayload !== null) {
        try {
          this.ws!.send(JSON.stringify(initPayload));
        } catch (e) {
          /* ignore */
        }
      }
      // 启动心跳
      this.startHeartbeat(heartbeatPayload, intervalMs);
      this.post({ event: "open" });
    };

    this.ws.onmessage = (evt: MessageEvent) => {
      let parsed: any = evt.data;
      try {
        parsed = JSON.parse(evt.data);
      } catch {
        /* keep raw */
      }
      // 将消息直接转发给主线程，由主线程决定如何处理
      this.post({ event: "message", data: parsed });
    };

    this.ws.onerror = err => {
      this.post({ event: "error", error: "websocket error" });
      this.postLog("error", "[Worker] websocket error", err);
      this.scheduleReconnect();
    };

    this.ws.onclose = closeEvt => {
      this.post({ event: "close", code: closeEvt.code, reason: closeEvt.reason });
      this.postLog("warn", `[Worker] websocket closed code=${closeEvt.code} reason=${closeEvt.reason}`);
      this.scheduleReconnect();
    };
  }

  private send(payload: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
      } catch (e) {
        this.post({ event: "error", error: String(e) });
      }
    } else {
      this.post({ event: "error", error: "WebSocket not open" });
    }
  }

  private disconnect() {
    this.clearTimers();
    if (this.ws) {
      try {
        this.ws.close(1000, "client disconnect");
      } catch {
      }
      this.ws = null;
    }
    // 不触发重连
    this.connConfig = null;
    this.postLog("info", "[Worker] 主动断开连接");
  }

  private startHeartbeat(payload: any, intervalMs: number) {
    // 先清理旧心跳
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.heartbeatTimer = self.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify(payload));
          this.postLog("debug", "[Worker] 心跳已发送");
        } catch (e) {
          this.postLog("error", "[Worker] 心跳发送失败", e);
        }
      }
    }, intervalMs) as unknown as number;
  }

  private scheduleReconnect() {
    if (!this.connConfig) return; // 如果是主动断开，则不重连
    if (this.isReconnecting) return;
    if (this.reconnectCount >= this.maxReconnects) {
      this.postLog("error", "[Worker] 已达到最大重连次数，停止重连");
      return;
    }
    this.isReconnecting = true;
    const delay = this.baseDelay * Math.pow(2, this.reconnectCount);
    this.postLog("warn", `[Worker] ${delay}ms 后尝试重连（第 ${this.reconnectCount + 1} 次）`);
    // 清理旧定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectTimer = self.setTimeout(() => {
      this.reconnectCount++;
      this.isReconnecting = false;
      // 重连使用保存的 connConfig
      if (this.connConfig) {
        const cfg = this.connConfig;
        this.connect(cfg.url, cfg.payload, cfg.heartbeat, cfg.interval);
      }
    }, delay) as unknown as number;
  }

  private clearTimers() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private post(payload: WorkerEvent) {
    try {
      ctx.postMessage(payload);
    } catch (e) {
      /* ignore */
    }
  }

  private postLog(level: "info" | "warn" | "error" | "debug", ...args: any[]) {
    this.post({ event: "log", level, msg: args });
  }
}

// 实例化单例
new InnerWebSocketWorker();
export {}; // keep module
