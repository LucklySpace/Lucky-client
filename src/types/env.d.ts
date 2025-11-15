// https://cn.vitejs.dev/guide/env-and-mode

// TypeScript 类型提示都为 string： https://github.com/vitejs/vite/issues/6930
interface ImportMetaEnv {
  VITE_BASE_API: string;

  VITE_API_SERVER: string;

  VITE_API_SERVER_WS: string;

  VITE_API_SERVER_WEBRTC: string;

  VITE_API_SERVER_SRS: string;

  VITE_APP_NAME: string;

  VITE_APP_STORE: string;

  VITE_APP_DATABASE: string;

  VITE_APP_DATABASE_INDEX: string;

  VITE_APP_LIST_REFRESH_TIME: string;

  VITE_APP_AUDIT_FILE: string;

  VITE_API_PROTOCOL_TYPE: string;

  VITE_API_SERVER_HEARTBEAT: number;

  VITE_DEVICE_TYPE: string;

  VITE_MESSAGE_RECALL_TIME: number;

  /** 是否开启 Mock 服务 */
  VITE_MOCK_DEV_SERVER: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * 平台的名称、版本、运行所需的`node`版本、依赖、构建时间的类型提示
 */
declare const __APP_INFO__: {
  pkg: {
    name: string;
    version: string;
    engines: {
      node: string;
    };
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  buildTimestamp: number;
};

/**
 * 布局模式
 * - grid:      网格模式（所有参会者均匀排列）
 * - speaker:   主讲模式（一个大画面 + 侧边小画面）
 * - right-list:右侧成员列表模式（视频区域 + 右侧列表）
 */
export type LayoutMode = "grid" | "speaker" | "right-list";

/**
 * 会议参与者对象
 */
export interface Participant {
  /** 参与者唯一标识（通常为用户 ID 或连接 ID） */
  userId: string;
  /** 参与者显示名称 */
  name: string;
  /** 头像 URL，可选 */
  avatar?: string;
  /** 是否为本地用户（true 表示当前设备用户自己） */
  isLocal: boolean;
  /** 是否已静音（true 表示关闭麦克风） */
  muted: boolean;
  /** 是否开启摄像头（true 表示正在发送视频流） */
  cameraOn: boolean;
  /** 是否正在共享屏幕 */
  screenShareOn: boolean;
  /** 角色：主持人 (host) 或 普通参会者 (participant) */
  role: "host" | "participant";
  /**
   * 当前连接状态：
   * - connected:      正常连接
   * - reconnecting:   网络异常，正在尝试重连
   * - disconnected:   已断开连接
   */
  connectionState: "connected" | "reconnecting" | "disconnected";
  /** 媒体流对象（本地或远端），可能为空 */
  stream?: MediaStream | null;
}

/**
 * 房间状态
 */
export interface RoomState {
  /** 房间 ID，若未加入则为 null */
  roomId: string | null;
  /** 当前房间使用的布局模式 */
  layoutMode: LayoutMode;
  /** 房间内所有参与者列表 */
  participants: Participant[];
  /** 房间是否存在屏幕共享（true 表示有人在共享） */
  isScreenShared: boolean;
  /** 房主（主持人）的 ID，可选 */
  hostId?: string;
}

// 基础字段
interface WSBase {
  type: string;
  roomId?: string;
  userId?: string;
  body?: string;
  users?: any[]; // 有时服务端直接返回 users 数组
  user?: any; // 单个 user 对象（可能字段名为 id 或 userId）
  time?: number;
}

// 常见的 type：'join'|'leave'|'update'|'signal'|'heartbeat'
type WSMessage = WSBase & {
  type: "join" | "leave" | "update" | "signal" | "heartbeat";
};

// 序列化模式
type ProtocolMode = "proto" | "json";

/**
 * 托盘配置接口
 */
type TrayConfig = {
  id: string; // 托盘唯一 ID
  tooltip: string; // 提示文字
  icon: string | Image; // 默认图标
  empty_icon: string | Image; // 闪烁时的空图标
  flashTime?: number; // 闪烁间隔（毫秒）
  menuItems?: { id: string; text: string; action: () => void }[]; // 右键菜单项
  trayClick?: (event: TrayIconEvent) => void;
  trayEnter?: (event: TrayIconEvent) => void;
  trayMove?: (event: TrayIconEvent) => void;
  trayLeave?: (event: TrayIconEvent) => void;
};
