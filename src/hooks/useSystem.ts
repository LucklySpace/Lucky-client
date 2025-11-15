import { getCurrentWindow } from "@tauri-apps/api/window";
import { ElMessageBox } from "element-plus";
import { exit } from "@tauri-apps/plugin-process";
import type { Platform } from "@tauri-apps/plugin-os";
import { platform as appPlatform } from "@tauri-apps/plugin-os";
import { useSettingStore } from "@/store/modules/setting";
import { useLogger } from "./useLogger";

interface CloseOptions {
  force?: boolean;
}

/* ---------- 单例状态 ---------- */
let instance: {
  close: (options?: CloseOptions) => Promise<void>;
  currPlatform: Platform;
  forceClose: () => Promise<void>;
} | null = null;

/* ---------- 内部工具 ---------- */
function detectPlatform() {
  return appPlatform();
}

/* ---------- 对外工厂：始终返回同一个实例 ---------- */
export function useSystemClose(emitClose?: () => void) {
  if (instance) return instance;

  const log = useLogger();
  const settingStore = useSettingStore();

  /** 平台值：首次使用时异步填充 */
  let _platform: Platform;

  const getPlatform = async () => {
    _platform = detectPlatform();
    //_platform = "macos";
    return _platform;
  };

  const handleMainClose = async () => {
    const pref = settingStore.close;

    if (pref === "minimize") return getCurrentWindow().hide();
    if (pref === "exit") return exit(0);

    try {
      const isMac = _platform === "macos";
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
      await exit(0);
    } catch {
      settingStore.close = "minimize";
      await getCurrentWindow().hide();
    }
  };

  const handleSpecialClose = async (label: string) => {
    if (label.includes("preview")) return getCurrentWindow().hide();
    if (label === "call") return emitClose?.();
  };

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
    }, // 同步读取，首次可能 undefined
    forceClose: () => close({ force: true })
  };

  // 第一次使用时就异步填充平台
  getPlatform();

  return instance;
}
