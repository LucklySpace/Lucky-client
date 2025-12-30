import { onBeforeUnmount, shallowReactive } from "vue";
import { useLogger } from "./useLogger";
import { ProtocolMode } from "@/types/env";

// --- Types ---
type WorkerCmd =
  | { type: "connect"; url: string; payload?: any; heartbeat?: any; interval?: number; protocol?: ProtocolMode }
  | { type: "send"; payload: any }
  | { type: "disconnect" };

type WorkerEvent =
  | { event: "open" }
  | { event: "message"; data: any }
  | { event: "error"; error: any }
  | { event: "close"; code?: number; reason?: string }
  | { event: "log"; level: string; msg: any[] };

type ClientState = {
  connected: boolean;
  status: "idle" | "connecting" | "open" | "closed" | "error";
  lastMessage: any;
  messages: any[];
  error: any;
};

// --- Singleton Client ---
class WebSocketClient {
  private worker: Worker | null = null;
  private subscribers = new Set<(data: any) => void>();
  private sendBuffer: any[] = [];
  private autoReleaseTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly AUTO_RELEASE_TIMEOUT = 30_000;
  private readonly log = useLogger();

  private lastConnectArgs: {
    url: string;
    options?: { payload?: any; heartbeat?: any; interval?: number; protocol?: ProtocolMode };
    workerPath: URL;
  } | null = null;

  public readonly state = shallowReactive<ClientState>({
    connected: false,
    status: "idle",
    lastMessage: null,
    messages: [],
    error: null,
  });

  public connect(
    url: string,
    options?: { payload?: any; heartbeat?: any; interval?: number; protocol?: ProtocolMode },
    workerPath = new URL("@/worker/Websocket.worker.ts", import.meta.url)
  ) {
    this.lastConnectArgs = { url, options, workerPath };
    this.cancelAutoRelease();
    this.ensureWorker(workerPath);
    
    this.updateStatus("connecting");
    this.postToWorker({
      type: "connect",
      url,
      ...options
    });
  }

  public send(payload: any) {
    if (this.state.status === "open" && this.worker) {
      this.postToWorker({ type: "send", payload });
    } else {
      this.bufferMessage(payload);
    }
  }

  public disconnect() {
    this.postToWorker({ type: "disconnect" });
    this.updateStatus("closed");
    this.state.connected = false;
  }

  public destroy() {
    this.subscribers.clear();
    this.terminateWorker();
    this.lastConnectArgs = null;
    this.state.messages = [];
  }

  public subscribe(handler: (data: any) => void) {
    this.subscribers.add(handler);
    this.cancelAutoRelease();

    return () => {
      this.subscribers.delete(handler);
      this.scheduleAutoRelease();
    };
  }

  private ensureWorker(workerPath: URL) {
    if (this.worker) return;
    this.worker = new Worker(workerPath, { type: "module" });
    this.worker.onmessage = (evt) => this.handleWorkerEvent(evt.data);
    this.worker.onerror = (err) => this.handleWorkerError(err);
  }

  private terminateWorker() {
    this.worker?.terminate();
    this.worker = null;
    this.state.connected = false;
    this.state.status = "closed";
    this.sendBuffer = [];
  }

  private postToWorker(cmd: WorkerCmd) {
    try {
      this.worker?.postMessage(cmd);
    } catch (e) {
      this.log.error("Worker postMessage failed", e);
    }
  }

  private handleWorkerEvent(ev: WorkerEvent) {
    switch (ev.event) {
      case "open":
        this.updateStatus("open");
        this.state.connected = true;
        this.state.error = null;
        this.flushBuffer();
        break;
      case "message":
        this.handleIncomingMessage(ev.data);
        break;
      case "error":
        this.state.error = ev.error;
        this.updateStatus("error");
        break;
      case "close":
        this.state.connected = false;
        break;
    }
  }

  private handleIncomingMessage(data: any) {
    this.state.lastMessage = data;
    this.state.messages.push(data);
    if (this.state.messages.length > 200) this.state.messages.shift();
    
    this.subscribers.forEach(handler => {
      try { handler(data); } catch (e) { this.log.error("Subscriber error", e); }
    });
  }

  private handleWorkerError(err: Event) {
    this.log.error("Worker process error", err);
    this.state.status = "error";
    this.state.error = err;
    
    // Attempt restart if crashed
    this.terminateWorker();
    if (this.lastConnectArgs) {
      setTimeout(() => {
        if (this.lastConnectArgs) {
          const { url, options, workerPath } = this.lastConnectArgs;
          this.connect(url, options, workerPath);
        }
      }, 5000);
    }
  }

  private updateStatus(status: ClientState["status"]) {
    this.state.status = status;
  }

  private bufferMessage(payload: any) {
    if (this.sendBuffer.length < 2000) {
      this.sendBuffer.push(payload);
    } else {
      this.log.warn("Buffer full, dropping message");
    }
  }

  private flushBuffer() {
    if (!this.sendBuffer.length) return;
    const pending = [...this.sendBuffer];
    this.sendBuffer = [];
    pending.forEach(p => this.postToWorker({ type: "send", payload: p }));
  }

  private scheduleAutoRelease() {
    if (this.subscribers.size === 0 && !this.autoReleaseTimer) {
      this.autoReleaseTimer = setTimeout(() => {
        if (this.subscribers.size === 0) {
          this.terminateWorker();
          this.log.info("Worker auto-released");
        }
        this.autoReleaseTimer = null;
      }, this.AUTO_RELEASE_TIMEOUT);
    }
  }

  private cancelAutoRelease() {
    if (this.autoReleaseTimer) {
      clearTimeout(this.autoReleaseTimer);
      this.autoReleaseTimer = null;
    }
  }

  public get _debug() {
    return { worker: this.worker, subscribers: this.subscribers.size };
  }
}

const client = new WebSocketClient();

export function useWebSocketWorker() {
  onBeforeUnmount(() => {
    // Optional: Add component-level cleanup if needed
  });

  return {
    state: client.state,
    connect: client.connect.bind(client),
    send: client.send.bind(client),
    disconnect: client.disconnect.bind(client),
    onMessage: client.subscribe.bind(client),
    destroy: client.destroy.bind(client),
    _internal: client._debug
  };
}
