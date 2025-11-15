/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 环境：development 或 production 等 */
  readonly ENV: string;

  /** 后端接口公共路径，用于代理或拼接路径 */
  readonly VITE_BASE_API: string;

  /** 后端接口地址（开发环境） */
  readonly VITE_API_SERVER: string;

  /** WebSocket 接口地址（IM 通道） */
  readonly VITE_API_SERVER_WS: string;

  /** WebSocket 接口地址（会议通道） */
  readonly VITE_API_MEET_SERVER_WS: string;

  /** WebRTC 推拉流地址 */
  readonly VITE_API_SERVER_WEBRTC: string;

  /** SRS RTC 服务地址 */
  readonly VITE_API_SERVER_SRS: string;

  /** 路由模式：hash 或 html5（可选） */
  readonly VITE_ROUTER_HISTORY?: string;

  /** 前端资源地址前缀，一般 `/` 或 `./` */
  readonly VITE_PUBLIC_PATH: string;

  /** 应用名称 */
  readonly VITE_APP_NAME: string;

  /** 应用描述 */
  readonly VITE_APP_DESCRIPTION: string;

  /** 应用图标路径 */
  readonly VITE_APP_ICON: string;

  /** 应用版权信息 */
  readonly VITE_APP_COPYRIGHT: string;

  /** 设备类型，例如 pc, mobile 等 */
  readonly VITE_APP_EQUIPMENT_TYPE: string;

  /** Tauri 本地存储文件名 */
  readonly VITE_APP_STORE: string;

  /** 数据库连接 URI（SQLite） */
  readonly VITE_APP_DATABASE: string;

  /** 索引库连接 URI */
  readonly VITE_APP_DATABASE_INDEX: string;

  /** 列表刷新时间，单位毫秒 */
  readonly VITE_APP_LIST_REFRESH_TIME: string;

  /** 声音文件路径 */
  readonly VITE_APP_AUDIT_FILE: string;

  /** 图片预览放大倍率 */
  readonly VITE_APP_PREVIEW_IMAGE_ZOOMIN: string;

  /** 图片预览缩小倍率 */
  readonly VITE_APP_PREVIEW_IMAGE_ZOOMOUT: string;

  /** 图片预览步进 */
  readonly VITE_APP_PREVIEW_IMAGE_STEP: string;

  /** 是否开启水印（true/false） */
  readonly VITE_API_WATERMARK: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

// xml文件
declare module "*.xml" {
  const content: string;
  export default content;
}

// 虚拟列表
declare module "vue-virtual-scroller";

// 加密
declare module "crypto-js";
declare module "encryptlong";

declare module "lodash-es";

