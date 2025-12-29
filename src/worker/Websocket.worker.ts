/**
 * WebSocket Worker
 * Handles connection, heartbeat, reconnection, and protocol (Proto/JSON) codec.
 */
import { IMConnectMessage } from "../proto/im_connect";
import { Any } from "../proto/google/protobuf/any";
import { ListValue, Struct, Value } from "@/proto/google/protobuf/struct";
import { ProtocolMode } from "@/types/env";

// --- Types ---
type WorkerCommand =
  | { type: "connect"; url: string; payload?: any; heartbeat?: any; interval?: number; protocol?: ProtocolMode }
  | { type: "send"; payload: any; options?: { protocol?: ProtocolMode; sendAsRawBytes?: boolean } }
  | { type: "disconnect" };

type WorkerEvent =
  | { event: "open" }
  | { event: "message"; data: any }
  | { event: "error"; error: any }
  | { event: "close"; code?: number; reason?: string }
  | { event: "log"; level: LogLevel; msg: any[] };

type LogLevel = "info" | "warn" | "error" | "debug";

// --- Constants ---
const CONSTANTS = {
  DEFAULT_PROTOCOL: "proto" as ProtocolMode,
  RECONNECT: {
    MAX_ATTEMPTS: 10,
    BASE_DELAY: 1000,
    MAX_DELAY: 30000,
  },
  HEARTBEAT_DEFAULT: "ping",
  INTERVAL_DEFAULT: 30000,
};

// --- Worker Class ---
class WebSocketWorker {
  private ws: WebSocket | null = null;
  private timers = {
    heartbeat: null as number | null,
    reconnect: null as number | null,
  };
  
  private state = {
    reconnectAttempts: 0,
    isExplicitlyDisconnected: false,
    activeProtocol: CONSTANTS.DEFAULT_PROTOCOL,
  };

  private config: {
    url: string;
    payload?: any;
    heartbeat?: any;
    interval: number;
    protocol: ProtocolMode;
  } | null = null;

  constructor(private readonly ctx: Worker) {
    this.ctx.onmessage = (e) => this.handleCommand(e.data);
    this.log("info", "Worker Ready");
  }

  private handleCommand(cmd: WorkerCommand) {
    try {
      switch (cmd.type) {
        case "connect":
          this.initConnection(cmd);
          break;
        case "send":
          this.send(cmd.payload, cmd.options);
          break;
        case "disconnect":
          this.disconnect(true);
          break;
        default:
          this.log("warn", "Unknown command", cmd);
      }
    } catch (err) {
      this.emit("error", { error: String(err) });
    }
  }

  private initConnection(cmd: Extract<WorkerCommand, { type: "connect" }>) {
    this.config = {
      url: cmd.url,
      payload: cmd.payload,
      heartbeat: cmd.heartbeat ?? CONSTANTS.HEARTBEAT_DEFAULT,
      interval: cmd.interval ?? CONSTANTS.INTERVAL_DEFAULT,
      protocol: cmd.protocol ?? CONSTANTS.DEFAULT_PROTOCOL,
    };
    this.state.isExplicitlyDisconnected = false;
    this.state.reconnectAttempts = 0;
    this.connect();
  }

  private connect() {
    if (!this.config) return;
    this.cleanup();

    try {
      this.log("info", `Connecting to ${this.config.url} [${this.config.protocol}]`);
      this.ws = new WebSocket(this.config.url, [this.config.protocol]);
      this.ws.binaryType = "arraybuffer";
      
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
    } catch (err) {
      this.emit("error", { error: String(err) });
      this.scheduleReconnect();
    }
  }

  private handleOpen() {
    if (!this.ws || !this.config) return;
    
    this.state.reconnectAttempts = 0;
    this.state.activeProtocol = this.normalizeProtocol(this.ws.protocol, this.config.protocol);
    
    this.log("info", `Connected. Protocol: ${this.state.activeProtocol}`);

    if (this.config.payload != null) {
      this.sendData(this.config.payload);
    }

    this.startHeartbeat();
    this.emit("open", {});
  }

  private handleMessage(evt: MessageEvent) {
    let data = evt.data;
    try {
      data = Codec.decode(evt.data);
    } catch (e) {
      // Decode failed, keep raw data
    }
    this.emit("message", { data });
  }

  private handleError(evt: Event) {
    this.log("error", "WebSocket Error", evt);
    this.emit("error", { error: "WebSocket connection error" });
  }

  private handleClose(evt: CloseEvent) {
    this.log("warn", `WebSocket Closed: ${evt.code} - ${evt.reason}`);
    this.emit("close", { code: evt.code, reason: evt.reason });
    this.cleanup();
    this.scheduleReconnect();
  }

  private disconnect(explicit = false) {
    if (explicit) {
      this.state.isExplicitlyDisconnected = true;
      this.config = null;
      this.log("info", "Disconnected by user");
    }
    this.cleanup();
  }

  private cleanup() {
    this.stopHeartbeat();
    this.stopReconnect();
    
    if (this.ws) {
      this.ws.onopen = this.ws.onmessage = this.ws.onerror = this.ws.onclose = null;
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
  }

  private send(payload: any, options?: { protocol?: ProtocolMode; sendAsRawBytes?: boolean }) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return this.log("warn", "Cannot send: WebSocket not open");
    }

    if (options?.sendAsRawBytes) {
      return this.sendRaw(payload);
    }

    this.sendData(payload, options?.protocol);
  }

  private sendRaw(payload: any) {
    try {
      const data = (typeof payload === 'object' && !ArrayBuffer.isView(payload) && !(payload instanceof ArrayBuffer))
        ? JSON.stringify(payload)
        : payload;
      this.ws?.send(data instanceof Uint8Array ? data.buffer : data);
    } catch (e) {
      this.log("error", "Raw send failed", e);
    }
  }

  private sendData(payload: any, protocolOverride?: ProtocolMode) {
    const proto = protocolOverride ?? this.state.activeProtocol;
    try {
      if (proto === "json") {
        this.ws?.send(JSON.stringify(payload));
      } else {
        this.ws?.send(Codec.encodeIMMessage(payload).buffer);
      }
    } catch (e) {
      this.log("error", "Send failed", e);
    }
  }

  private scheduleReconnect() {
    if (this.state.isExplicitlyDisconnected || !this.config) return;
    if (this.state.reconnectAttempts >= CONSTANTS.RECONNECT.MAX_ATTEMPTS) {
      return this.log("error", "Max reconnect attempts reached");
    }

    const delay = Math.min(
      CONSTANTS.RECONNECT.BASE_DELAY * Math.pow(2, this.state.reconnectAttempts), 
      CONSTANTS.RECONNECT.MAX_DELAY
    );
    
    this.log("info", `Reconnecting in ${delay}ms (Attempt ${this.state.reconnectAttempts + 1})`);
    
    this.timers.reconnect = self.setTimeout(() => {
      this.state.reconnectAttempts++;
      this.connect();
    }, delay) as unknown as number;
  }

  private stopReconnect() {
    if (this.timers.reconnect) {
      clearTimeout(this.timers.reconnect);
      this.timers.reconnect = null;
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    if (!this.config?.interval) return;

    this.timers.heartbeat = self.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendData(this.config?.heartbeat ?? CONSTANTS.HEARTBEAT_DEFAULT);
      }
    }, this.config.interval) as unknown as number;
  }

  private stopHeartbeat() {
    if (this.timers.heartbeat) {
      clearInterval(this.timers.heartbeat);
      this.timers.heartbeat = null;
    }
  }

  private normalizeProtocol(raw: string | null, preferred?: ProtocolMode): ProtocolMode {
    const r = (raw || "").toLowerCase();
    if (r.includes("proto")) return "proto";
    if (r.includes("json")) return "json";
    return preferred ?? CONSTANTS.DEFAULT_PROTOCOL;
  }

  private emit(event: WorkerEvent["event"], payload: Omit<WorkerEvent, "event">) {
    this.ctx.postMessage({ event, ...payload });
  }

  private log(level: LogLevel, ...args: any[]) {
    this.emit("log", { level, msg: args });
  }
}

// --- Codec Helper ---
const Codec = {
  encodeIMMessage(msg: any): Uint8Array {
    if (msg instanceof Uint8Array) return msg;
    if (msg instanceof ArrayBuffer) return new Uint8Array(msg);

    const imMsg = {
      code: msg.code ?? 0,
      token: msg.token ?? "",
      metadata: msg.metadata ?? {},
      message: msg.message ?? "",
      requestId: msg.requestId ?? msg.request_id ?? "",
      timestamp: msg.timestamp ?? Date.now(),
      clientIp: msg.clientIp ?? msg.client_ip ?? "",
      userAgent: msg.userAgent ?? msg.user_agent ?? "",
      deviceName: msg.deviceName ?? msg.device_name ?? "",
      deviceType: msg.deviceType ?? msg.device_type ?? "",
      data: undefined as any
    };

    const source = msg.data ?? msg.payload;
    if (source !== undefined) {
      imMsg.data = Codec.isAnyLike(source) ? source : Codec.jsonToAny(source);
    }

    return (IMConnectMessage as any).encode(imMsg).finish();
  },

  decode(data: any): any {
    if (typeof data === "string") {
      try { return JSON.parse(data); } catch { return data; }
    }
    
    if (data instanceof ArrayBuffer) data = new Uint8Array(data);
    if (data instanceof Uint8Array) {
      try {
        const decoded = (IMConnectMessage as any).decode(data);
        const anyObj = decoded.payload ?? decoded.data;
        return {
          ...decoded,
          data: Codec.anyToJs(anyObj),
          _rawPayload: anyObj
        };
      } catch (e) {
        const text = new TextDecoder().decode(data);
        try { return JSON.parse(text); } catch { return text; }
      }
    }
    return data;
  },

  anyToJs(a?: Any | null): any {
    if (!a) return undefined;
    const typeUrl = (a as any).typeUrl ?? (a as any).type_url ?? "";
    const raw = (a as any).value ?? new Uint8Array(0);

    try {
      if (typeUrl.includes("Struct")) return Codec.unwrap(Struct.decode(raw), Codec.structToJs);
      if (typeUrl.includes("Value")) return Codec.unwrap(Value.decode(raw), Codec.valueToJs);
      if (typeUrl.includes("ListValue")) return Codec.unwrap(ListValue.decode(raw), Codec.listValueToJs);
    } catch {}

    try {
      const txt = new TextDecoder().decode(raw);
      if (Codec.looksLikeJson(txt)) return JSON.parse(txt);
    } catch {}
    
    return raw;
  },

  unwrap(obj: any, fallback: (v: any) => any) {
    return (obj.constructor as any).unwrap?.(obj) ?? fallback(obj);
  },

  jsonToAny(obj: any): Any {
    const bytes = new TextEncoder().encode(JSON.stringify(obj ?? null));
    return { typeUrl: "type.googleapis.com/json", value: bytes } as Any;
  },

  isAnyLike(x: any): boolean {
    return x && typeof x === "object" && 
           typeof (x.typeUrl ?? x.type_url) === "string" && 
           (x.value instanceof Uint8Array || x.value instanceof ArrayBuffer);
  },

  looksLikeJson(s: string): boolean {
    const t = s.trim();
    return t.length > 0 && (t.startsWith("{") || t.startsWith("[") || t.startsWith('"'));
  },

  structToJs(s: any): any {
    const out: any = {};
    for (const k in s?.fields ?? {}) {
      out[k] = Codec.valueToJs(s.fields[k]);
    }
    return out;
  },

  listValueToJs(lv: any): any[] {
    return (lv?.values ?? []).map((v: any) => Codec.valueToJs(v));
  },

  valueToJs(v: any): any {
    if (v == null) return null;
    if (v.stringValue !== undefined) return v.stringValue;
    if (v.numberValue !== undefined) return v.numberValue;
    if (v.boolValue !== undefined) return v.boolValue;
    if (v.structValue !== undefined) return Codec.structToJs(v.structValue);
    if (v.listValue !== undefined) return Codec.listValueToJs(v.listValue);
    if (v.nullValue !== undefined) return null;
    if (v.kind) return Codec.valueToJs(v.kind);
    return v;
  }
};

new WebSocketWorker(self as any);
export {}; 
