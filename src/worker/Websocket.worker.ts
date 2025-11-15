/**
 * WebSocket Worker (支持 proto/json 两种序列化协议)
 *
 * 特性：
 * - 心跳、指数退避重连、日志、与主线程通信
 * - 支持两种序列化协议：'proto'（默认）与 'json'
 *   - 'proto'：使用 IMConnectMessage protobuf 二进制帧（优先）
 *   - 'json'：发送文本 JSON（用于服务端不接受 protobuf 的情况）
 * - 对收到的 Any 做稳健解析：先尝试 protobuf Struct/Value/ListValue 解码（若可用），
 *   否则把 Any.value 当作 UTF-8 JSON 文本解析（能兼容 value 为 "\"registrar\"" 的情况）
 *
 * 使用：
 * worker.postMessage({ type: 'connect', url, protocol: 'proto' | 'json', payload: ..., heartbeat: ..., interval: 25000 })
 * worker.postMessage({ type: 'send', payload: {...}, options: { protocol: 'json' } })
 */
import { IMConnectMessage } from "../proto/im_connect"; // 请按项目路径调整
import { Any } from "../proto/google/protobuf/any"; // 请按项目路径调整
// Optional: 如果你有用 protoc 生成 struct.ts，请保留此 import；否则解码会回退到文本解析。
// 若没有这文件，可把下面一行注释掉或保持（TypeScript 编译若找不到，需要先添加 struct.ts）
import { ListValue, Struct, Value } from "@/proto/google/protobuf/struct"; // 可选，按项目路径调整
import { ProtocolMode } from "@/types/env";

/*********************
 * 类型与配置
 *********************/

type WorkerCommand =
  | {
      type: "connect";
      url: string;
      payload?: any;
      heartbeat?: any;
      interval?: number;
      protocol?: ProtocolMode; // 建立连接时的默认协议
    }
  | { type: "send"; payload: any; options?: { protocol?: ProtocolMode; sendAsRawBytes?: boolean } }
  | { type: "disconnect" };

type WorkerEvent =
  | { event: "open" }
  | { event: "message"; data: any }
  | { event: "error"; error: any }
  | { event: "close"; code?: number; reason?: string }
  | { event: "log"; level: "info" | "warn" | "error" | "debug"; msg: any };

const ctx: Worker & typeof globalThis = self as any;

/*********************
 * 序列化协议（可被 connect 时的 protocol 覆盖）
 *********************/
const DEFAULT_PROTOCOL: ProtocolMode = "proto";

/*********************
 * 主体：InnerWebSocketWorker（心跳 / 重连 / send / receive）
 *********************/
class InnerWebSocketWorker {
  private ws: WebSocket | null = null;
  private heartbeatTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private reconnectCount = 0;
  private readonly maxReconnects = 10;
  private readonly baseDelay = 5000; // ms
  private isReconnecting = false;
  private connConfig: {
    url: string;
    payload?: any;
    heartbeat?: any;
    interval?: number;
    protocol?: ProtocolMode;
  } | null = null;

  // 记录最终使用的协议（由服务端选择或回退到本端偏好）
  private protocolUsed: ProtocolMode | null = null;

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
          interval: cmd.interval ?? 30000,
          protocol: cmd.protocol ?? DEFAULT_PROTOCOL
        };
        this.connect(
          cmd.url,
          cmd.payload,
          cmd.heartbeat ?? "ping",
          cmd.interval ?? 30000,
          cmd.protocol ?? DEFAULT_PROTOCOL
        );
        break;
      case "send":
        this.send(cmd.payload, cmd.options?.protocol, !!cmd.options?.sendAsRawBytes);
        break;
      case "disconnect":
        this.disconnect();
        break;
      default:
        this.postLog("warn", "[Worker] 未知命令", cmd);
    }
  }

  private connect(
    url: string,
    initPayload?: any,
    heartbeatPayload: any = "ping",
    intervalMs: number = 30000,
    protocol: ProtocolMode = DEFAULT_PROTOCOL
  ) {
    // 清理原有
    this.clearTimers();
    if (this.ws) {
      try {
        this.ws.close(1000, "重连/新建连接");
      } catch {}
      this.ws = null;
    }

    try {
      this.ws = new WebSocket(url, [protocol]);
      this.ws.binaryType = "arraybuffer";
    } catch (err) {
      this.post({ event: "error", error: String(err) });
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectCount = 0;
      this.isReconnecting = false;
      // 读取服务端最终选定的 sub-protocol（可能为空字符串）
      const agreed = this.ws?.protocol ?? "";
      // 归一化并保存为后续使用的协议
      this.protocolUsed = this.normalizeProtocol(agreed, protocol);
      this.postLog("info", `[Worker] WebSocket 已连接, agreed protocol=${agreed}, using=${this.protocolUsed}`);

      // 发送初始 payload（如果有）
      if (initPayload !== undefined && initPayload !== null) {
        try {
          if (this.protocolUsed === "json") {
            // 文本协议：发送 JSON 字符串
            this.ws!.send(JSON.stringify(initPayload));
          } else {
            const u8 = encodeIMMessageToUint8(initPayload);
            this.ws!.send(u8.buffer);
          }
        } catch (e) {
          this.postLog("error", "[Worker] 初始 payload 发送失败", e);
        }
      }
      // 启动心跳（heartbeatPayload 可以是对象或 Uint8Array）
      this.startHeartbeat(heartbeatPayload, intervalMs, protocol);
      this.post({ event: "open" });
    };

    this.ws.onmessage = (evt: MessageEvent) => {
      let parsed: any = evt.data;
      try {
        parsed = decodeIncoming(evt.data);
      } catch (err) {
        parsed = evt.data;
      }
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

  private send(payload: any, protocolOverride?: ProtocolMode, sendAsRawBytes = false) {
    if (!this.ws) {
      this.post({ event: "error", error: "WebSocket not initialized" });
      return;
    }
    if (this.ws.readyState !== WebSocket.OPEN) {
      this.post({ event: "error", error: "WebSocket not open" });
      return;
    }
    try {
      // 优先使用显式 override，其次使用服务端协商到的 protocolUsed，再次回退到 connConfig 或默认
      const protocol = protocolOverride ?? this.protocolUsed ?? this.connConfig?.protocol ?? DEFAULT_PROTOCOL;

      if (sendAsRawBytes) {
        // 直接发送二进制
        if (payload instanceof Uint8Array) this.ws.send(payload.buffer);
        else if (payload instanceof ArrayBuffer) this.ws.send(payload);
        else if (typeof payload === "string") this.ws.send(payload);
        else this.ws.send(JSON.stringify(payload));
        return;
      }

      if (protocol === "json") {
        this.ws.send(JSON.stringify(payload));
      } else {
        const u8 = encodeIMMessageToUint8(payload);
        this.ws.send(u8.buffer);
      }
    } catch (e) {
      this.post({ event: "error", error: String(e) });
    }
  }

  private disconnect() {
    this.clearTimers();
    if (this.ws) {
      try {
        this.ws.close(1000, "client disconnect");
      } catch {}
      this.ws = null;
    }
    this.connConfig = null;
    this.postLog("info", "[Worker] 主动断开连接");
  }

  private startHeartbeat(payload: any, intervalMs: number, protocol: ProtocolMode) {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    // 使用 this.protocolUsed 优先（如果协商尚未完成，使用传入的 preferred）
    const proto = this.protocolUsed ?? protocol ?? DEFAULT_PROTOCOL;

    this.heartbeatTimer = self.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          if (proto === "json") {
            this.ws!.send(JSON.stringify(payload));
          } else {
            const bytes = encodeIMMessageToUint8(payload);
            this.ws!.send(bytes.buffer);
          }
          this.postLog("debug", "[Worker] 心跳已发送");
        } catch (e) {
          this.postLog("error", "[Worker] 心跳发送失败", e);
        }
      }
    }, intervalMs) as unknown as number;
  }

  private scheduleReconnect() {
    if (!this.connConfig) return; // 主动断开则不重连
    if (this.isReconnecting) return;
    if (this.reconnectCount >= this.maxReconnects) {
      this.postLog("error", "[Worker] 已达到最大重连次数，停止重连");
      return;
    }
    this.isReconnecting = true;
    const delay = this.baseDelay * Math.pow(2, this.reconnectCount);
    this.postLog("warn", `[Worker] ${delay}ms 后尝试重连（第 ${this.reconnectCount + 1} 次）`);
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectTimer = self.setTimeout(() => {
      this.reconnectCount++;
      this.isReconnecting = false;
      if (this.connConfig) {
        const cfg = this.connConfig;
        this.connect(cfg.url, cfg.payload, cfg.heartbeat, cfg.interval, cfg.protocol ?? DEFAULT_PROTOCOL);
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

  /** 帮助把服务端返回或客户端传入的协议名归一化为 'proto' | 'json' */
  private normalizeProtocol(raw: string | null | undefined, preferred: ProtocolMode): ProtocolMode {
    const r = (raw ?? "").toLowerCase().trim();
    if (r.includes("proto")) return "proto";
    if (r.includes("json")) return "json";
    // raw 为空或未知，使用客户端偏好作为回退
    return preferred ?? DEFAULT_PROTOCOL;
  }

  private post(payload: WorkerEvent) {
    try {
      ctx.postMessage(payload);
    } catch {
      /* ignore */
    }
  }

  private postLog(level: "info" | "warn" | "error" | "debug", ...args: any[]) {
    this.post({ event: "log", level, msg: args });
  }
}

/*********************
 * 实例化单例并导出（worker 模式）
 *********************/
new InnerWebSocketWorker();
export {}; // 保持为模块

/* =========================
   1) Any <-> JS 辅助（ts-proto 风格）
   ========================= */

/**
 * 把 Any 解为 JS 值（优先使用 ts-proto 生成的 decode/unwrap）
 * 策略：
 *  1. 如果 typeUrl 指向 Struct/Value/ListValue：用对应 decode -> unwrap（生成代码提供 unwrap）
 *  2. 否则尝试把 Any.value 当作 UTF-8 JSON 文本解析（兼容后端直接把 JSON bytes 放进 Any.value）
 *  3. 兜底返回原始 Uint8Array（上层可根据需求处理）
 */
function anyToJs(a?: Any | null): any {
  if (!a) return undefined;
  const typeUrl: string = (a as any).typeUrl ?? (a as any).type_url ?? "";
  const raw: Uint8Array = (a as any).value ?? new Uint8Array(0);

  // 1) 优先按 well-known types 走二进制 decode -> unwrap（性能最好）
  try {
    if (typeUrl.endsWith("google.protobuf.Struct") || typeUrl.endsWith("Struct")) {
      const s = Struct.decode(raw);
      // 生成的 Struct 提供 unwrap，返回普通 JS map
      if (typeof (Struct as any).unwrap === "function") return (Struct as any).unwrap(s);
      // 兜底手工转换（若没有 unwrap）
      return structToJs(s);
    }
    if (typeUrl.endsWith("google.protobuf.Value") || typeUrl.endsWith("Value")) {
      const v = Value.decode(raw);
      if (typeof (Value as any).unwrap === "function") return (Value as any).unwrap(v);
      return valueToJs(v);
    }
    if (typeUrl.endsWith("google.protobuf.ListValue") || typeUrl.endsWith("ListValue")) {
      const lv = ListValue.decode(raw);
      if (typeof (ListValue as any).unwrap === "function") return (ListValue as any).unwrap(lv);
      return listValueToJs(lv);
    }
  } catch {
    // decode 失败 -> 继续回退策略
  }

  // 2) 回退：尝试把 raw 当作 UTF-8 JSON 文本（适配后端把 JSON bytes 放入 Any.value 的情况）
  try {
    const txt = new TextDecoder().decode(raw);
    if (looksLikeJsonText(txt)) {
      try {
        return JSON.parse(txt);
      } catch {
        /* parse fail -> fallback */
      }
    }
  } catch {
    // ignore
  }

  // 3) 兜底返回原始 bytes
  return raw;
}

/** 判断字符串是否看起来像 JSON 的简单启发式函数 */
function looksLikeJsonText(s?: string | null): boolean {
  if (!s) return false;
  const t = s.trim();
  if (!t) return false;
  const c = t[0];
  return (
    c === "{" ||
    c === "[" ||
    c === '"' ||
    c === "-" ||
    (c >= "0" && c <= "9") ||
    t.startsWith("true") ||
    t.startsWith("false") ||
    t.startsWith("null")
  );
}

/* 下面三者在生成代码里已存在 unwrap/wrap，但这里做一层保证：若没有 unwrap 再行转换。 */

/** Struct -> JS（最简单的字段展开，ts-proto 生成通常是 fields map） */
function structToJs(s: any): any {
  if (!s) return {};
  const fields = (s as any).fields ?? {};
  const out: any = {};
  for (const k of Object.keys(fields)) {
    out[k] = valueToJs(fields[k]);
  }
  return out;
}

/** ListValue -> JS Array */
function listValueToJs(lv: any): any[] {
  if (!lv) return [];
  const arr = (lv as any).values ?? [];
  return (arr || []).map((v: any) => valueToJs(v));
}

/** Value -> JS 值（兼容 ts-proto 的 oneof 结构） */
function valueToJs(v: any): any {
  if (v == null) return null;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.numberValue !== undefined) return v.numberValue;
  if (v.boolValue !== undefined) return v.boolValue;
  if (v.structValue !== undefined) return structToJs(v.structValue);
  if (v.listValue !== undefined) return listValueToJs(v.listValue);
  if (v.nullValue !== undefined) return null;
  // 若生成器使用 kind 包装
  if (v.kind) return valueToJs(v.kind);
  return v;
}

/* =========================
   2) JS -> Any（发送端）
   ========================= */

/** 把任意 JS 值包装为 Any（将 JS -> JSON bytes，并把 typeUrl 设为 json） */
function jsonToAny(obj: any): Any {
  try {
    const enc = new TextEncoder();
    const bytes = enc.encode(JSON.stringify(obj ?? null));
    return { typeUrl: "type.googleapis.com/json", value: bytes } as Any;
  } catch {
    return { typeUrl: "type.googleapis.com/json", value: new Uint8Array(0) } as Any;
  }
}

/** 判断是否已经是 Any-like（直接传入 Any 时原样使用） */
function isAnyLike(x: any): x is Any {
  if (!x || typeof x !== "object") return false;
  const tv = x.typeUrl ?? x.type_url;
  const v = x.value;
  return typeof tv === "string" && (v instanceof Uint8Array || v instanceof ArrayBuffer);
}

/* =========================
   3) IMConnectMessage 编码/解码（核心）
   ========================= */

/**
 * 将任意 im 消息对象编码为 Uint8Array（用于发送）
 * 规则：
 *  - 优先支持 ts-proto IMConnectMessage.encode(...).finish()
 *  - payload/data 字段若为 Any-like 直接使用；否则把 JS 值包装为 JSON-in-Any
 */
function encodeIMMessageToUint8(msg: any): Uint8Array {
  if (msg instanceof Uint8Array) return msg;
  if (msg instanceof ArrayBuffer) return new Uint8Array(msg);

  const imMsg: any = {
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
    data: undefined // ts-proto 生成的字段名可能是 payload 或 data，按你的 proto 调整
  };

  // 支持 data 或 payload 两种命名约定；若传入 Any-like 则直接复用
  const source = msg.data ?? msg.data;
  if (source !== undefined) {
    imMsg.data = isAnyLike(source) ? source : jsonToAny(source);
  }

  // 使用 ts-proto 的 encode().finish()
  const writer = (IMConnectMessage as any).encode(imMsg);
  if (writer && typeof writer.finish === "function") return writer.finish();
  // 兜底：JSON bytes（非常不推荐，仅作最后手段）
  return new TextEncoder().encode(JSON.stringify(imMsg));
}

/**
 * 把收到的帧解码为标准对象
 * - 二进制（Uint8Array/ArrayBuffer）：使用 IMConnectMessage.decode -> anyToJs -> 返回 out.data 为已解析 payload
 * - 文本：JSON.parse
 */
function decodeIncoming(data: any): any {
  try {
    if (data instanceof ArrayBuffer) data = new Uint8Array(data);
    if (data instanceof Uint8Array) {
      const decoded = (IMConnectMessage as any).decode(data) as any;
      // 兼容 payload/data 字段命名：优先 payload（按 proto 定义），其次 data
      const anyObj: Any | undefined = decoded.payload ?? decoded.data ?? undefined;
      const parsedPayload = anyToJs(anyObj);
      const out: any = {
        ...decoded,
        data: parsedPayload ?? parsedPayload.value ?? parsedPayload.ListValue ?? undefined
      };
      out._rawPayload = anyObj; // 保留原始 Any（必要时可取出 typeUrl/value）
      return out;
    }
  } catch {
    // decode fail -> fall through to text handling
  }

  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }
  return data;
}
