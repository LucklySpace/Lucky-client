import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Window } from "@tauri-apps/api/window";
import { StoresEnum } from "@/constants/index";
import { closeWindow, getWindow, showAndFocus } from "@/windows/utils";

// 简单 logger（优先使用全局 useLogger，否则退回到 console）
function logger() {
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const l = (globalThis as any).useLogger?.();
    if (l) return l;
  } catch (e) {
    /* ignore */
  }
  return console;
}

const log = logger();

export async function CreateMainWindow() {
  const height = 650; // 初始高度
  const width = 950; // 初始宽度

  const webview = new WebviewWindow(StoresEnum.MAIN, {
    title: "Lucky",
    url: "/message",
    width: width,
    height: height,
    minWidth: width,
    minHeight: height,
    center: true,
    resizable: true,
    decorations: false,
    alwaysOnTop: false,
    visible: true,
    transparent: true,
    shadow: false
    // resizable: false,
    // decorations: false,
    // alwaysOnTop: true,
    // skipTaskbar: true,
    // transparent: true,
    // shadow: false
  });

  webview.once("tauri://webview-created", async () => {
    try {
      await webview.show();
      await webview.setFocus();
    } catch (error) {
      log.warn("show/focus main window failed", error);
    }
  });
}

/**
 * 获取主窗口实例，如果缓存中没有则从 API 获取
 */
const getMainWindow = async (): Promise<Window | null> => getWindow(StoresEnum.MAIN);

/**
 * 关闭主窗口
 */
export const CloseMainWindow = async () => {
  await closeWindow(StoresEnum.MAIN);
};

/**
 * 显示并恢复主窗口
 */
export const ShowMainWindow = async () => {
  await showAndFocus(StoresEnum.MAIN);
};

/**
 * 防截屏
 */
export const antiScreenshot = async () => {
  const mainWindow = await getMainWindow();
  if (mainWindow) {
    try {
      await mainWindow.setContentProtected(true);
    } catch (e) {
      log.warn("setContentProtected 可能在某些平台不可用", e);
    }
  }
};

/**
 * 判断窗口是否最小化或隐藏
 */
export const appIsMinimizedOrHidden = async (): Promise<boolean> => {
  try {
    const mainWindow = await getMainWindow();
    if (!mainWindow) return false;

    // 判断窗口是否最小化或不可见（隐藏）
    const isMinimized = await mainWindow.isMinimized();
    const isVisible = await mainWindow.isVisible();
    // 返回窗口是否最小化或不可见
    return isMinimized || !isVisible;
  } catch (error) {
    // 错误处理
    console.error("Error checking window minimized or hidden status:", error);
    return false;
  }
};

export default { CreateMainWindow, CloseMainWindow };
