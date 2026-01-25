import { useSettingStore } from "@/store/modules/setting";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Platform } from "@tauri-apps/plugin-os";
import { platform as appPlatform } from "@tauri-apps/plugin-os";
import { exit } from "@tauri-apps/plugin-process";
import { ElMessageBox } from "element-plus";
import { useLogger } from "./useLogger";

interface CloseOptions {
  force?: boolean;
}

/* ---------- 单例状态 ---------- */
let instance: {
  /** 统一的关闭入口 */
  close: (options?: CloseOptions) => Promise<void>;
  /** 当前平台（首次可能为 undefined，内部会懒加载） */
  currPlatform: Platform | undefined;
  /** 强制关闭窗口（不触发交互） */
  forceClose: () => Promise<void>;
} | null = null;

/* ---------- 内部工具 ---------- */
function detectPlatform() {
  return appPlatform();
}

/**
 * useSystemClose
 * 应用窗口关闭逻辑统一入口：
 * - main 窗口：根据用户偏好（ask|minimize|exit）执行相应逻辑
 * - 其他窗口：按标签进行特殊处理（preview 隐藏、call 走外部关闭回调）
 * - 支持 force 强制关闭，绕过所有交互
 */
export function useSystemClose(emitClose?: () => void) {
  if (instance) return instance;

  const log = useLogger();
  const settingStore = useSettingStore();

  /** 平台值：懒加载缓存 */
  let _platform: Platform | undefined;

  /** 保证平台值已就绪（同步懒加载） */
  const ensurePlatform = (): Platform => {
    if (!_platform) {
      _platform = detectPlatform();
      log.info?.(`Platform detected: ${_platform}`);
    }
    return _platform;
  };

  /** 处理主窗口关闭逻辑（带交互） */
  const handleMainClose = async () => {
    const pref = settingStore.close;

    if (pref === "minimize") {
      log.info?.("Close preference: minimize → hide main window");
      return getCurrentWindow().hide();
    }
    if (pref === "exit") {
      log.info?.("Close preference: exit → terminating app");
      return exit(0);
    }

    try {
      const isMac = ensurePlatform() === "macos";
      const msg = isMac
        ? "关闭主窗口后应用会继续驻留在菜单栏，确定要退出程序吗？"
        : "关闭主窗口后将最小化到系统托盘，确定要退出程序吗？";

      await ElMessageBox.confirm(msg, "退出确认", {
        confirmButtonText: "退出程序",
        cancelButtonText: "最小化到托盘",
        type: "warning",
        distinguishCancelAndClose: true
      });

      settingStore.close = "exit";
      log.info?.("User confirmed exit → terminating app");
      await exit(0);
    } catch {
      settingStore.close = "minimize";
      log.info?.("User canceled exit → minimizing to tray");
      await getCurrentWindow().hide();
    }
  };

  /** 处理非主窗口关闭逻辑（按标签区分） */
  const handleSpecialClose = async (label: string) => {
    if (label.includes("preview")) {
      log.info?.(`Special window (${label}) → hide`);
      return getCurrentWindow().hide();
    }
    if (label === "call") {
      log.info?.(`Special window (${label}) → emit external close`);
      return emitClose?.();
    }
    log.info?.(`Special window (${label}) → default close`);
    return getCurrentWindow().close();
  };

  /** 统一关闭入口 */
  const close = async (options: CloseOptions = {}) => {
    const { force = false } = options;
    const win = getCurrentWindow();
    const label = win.label;

    if (force) return win.close();
    if (label !== "main") return handleSpecialClose(label);
    return handleMainClose();
  };

  instance = {
    close,
    get currPlatform() {
      return _platform;
    }, // 同步读取，首次可能 undefined（已通过 ensurePlatform 懒加载）
    forceClose: () => close({ force: true })
  };

  // 预热平台信息（不阻塞调用）
  ensurePlatform();

  return instance;
}
