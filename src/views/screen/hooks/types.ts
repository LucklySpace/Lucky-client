// src/hooks/types.ts

// 工具类型：新增 'text' 以支持文字功能
export type ToolType = "rect" | "circle" | "line" | "arrow" | "mosaic" | "text" | "pen";

/** 单屏幕截图数据 */
export interface ScreenCapture {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  scale_factor: number;
  is_primary: boolean;
  data: number[];
}

/** 多屏幕截图结果 */
export interface MultiScreenCapture {
  screens: ScreenCapture[];
  virtual_x: number;
  virtual_y: number;
  virtual_width: number;
  virtual_height: number;
}

/** 屏幕信息 */
export interface DisplayInfo {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scale_factor: number;
  frequency: number;
  is_primary: boolean;
}

/** 多屏幕信息 */
export interface MultiScreenInfo {
  screens: DisplayInfo[];
  virtual_x: number;
  virtual_y: number;
  virtual_width: number;
  virtual_height: number;
}

export interface ScreenshotPluginContext {
  api: ScreenshotAPI;
}

/** 颜色映射到 CSS 字符串（可自定义为 hex 或 rgba） */
export const COLOR_MAP: Record<ColorType, string> = {
  red: "#ff4d4f",
  yellow: "#f2c94c",
  blue: "#2d9cdb",
  white: "#ffffff",
  black: "#1f2937",
  green: "#27ae60",
  grayLight: "#f0f0f0", // 浅灰色
  grayMedium: "#9e9e9e", // 中灰色
  grayDark: "#606266", // 深灰色
  purple: "#8a2be2", // 紫色
  orange: "#ff8c00" // 橙色
};

export type ColorType =
  | "red"
  | "yellow"
  | "blue"
  | "white"
  | "black"
  | "green"
  | "grayLight"
  | "grayMedium"
  | "grayDark"
  | "purple"
  | "orange";
/**
 * 笔设置信息
 */
export interface PenConfig {
  lastX: number | null;
  lastY: number | null;
  color: ColorType;
  size: number;
}

export interface ScreenshotPlugin {
  // 可选生命周期钩子（都为可选）
  onRegister?: (ctx: ScreenshotPluginContext) => void;
  onStart?: (state: any) => void;
  onCapture?: (meta: { width: number; height: number; image: HTMLImageElement }) => void;
  onStartDraw?: (state: any) => void;
  onStartMove?: (state: any) => void;
  onEndDraw?: (state: any) => void;
  onMove?: (state: any) => void;
  onEndMove?: (state: any) => void;
  onCancel?: (state: any) => void;
  onDestroy?: (state: any) => void;
  onExport?: (payload: { blob: Blob; uint8: Uint8Array; width: number; height: number }) => Promise<boolean> | boolean;
}

export interface ScreenshotAPI {
  refs: {
    canvasBox: any;
    imgCanvas: any;
    maskCanvas: any;
    drawCanvas: any;
    magnifier: any;
    magnifierCanvas: any;
    buttonGroup: any;
  };
  state: any;
  start: () => Promise<void>;
  confirmSelection: () => Promise<void>;
  cancelSelection: () => void;
  setTool: (t: ToolType) => void;
  undo: () => void;
  redo: () => void;
  registerPlugin: (p: ScreenshotPlugin) => void;
  setPenOptions: (p: any) => void;
}
