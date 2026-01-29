import { StoresEnum } from "@/constants/index";
import { listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Window } from "@tauri-apps/api/window";

type MaybeWindow = Window | null;
type MaybeWebview = WebviewWindow | null;

/** 配置常量集中管理 */
const ACCEPT_WINDOW_SIZE = { width: 280, height: 120 };
const CALL_WINDOW_SIZE = { width: 720, height: 480 };

/** 创建通话接受窗口，返回 WebviewWindow（或 null） */
export async function CreateCallAcceptWindow(): Promise<MaybeWebview> {
  try {
    const position = calculatePopupPosition(ACCEPT_WINDOW_SIZE.width, ACCEPT_WINDOW_SIZE.height);
    const webview = new WebviewWindow(StoresEnum.CALLACCEPT, {
      url: "/accept",
      width: ACCEPT_WINDOW_SIZE.width,
      height: ACCEPT_WINDOW_SIZE.height,
      x: position.x,
      y: position.y,
      resizable: false,
      decorations: false,
      skipTaskbar: false,
      transparent: true,
      visible: true,
      shadow: false
    });

    // safer: 尝试监听两个可能的创建事件，任一触发即 show & focus
    const handler = () => {
      try {
        // show/setFocus 不保证必须 await（依赖 Tauri 实现），但我们还是 await 以捕获异常
        webview.show();
        webview.setFocus();
      } catch (err) {
        console.warn("CreateCallAcceptWindow: show/focus failed", err);
      }
    };

    // 尽量用 once 防止重复触发
    webview.once("tauri://webview-created", handler);
    webview.once("tauri://window-created", handler);

    return webview;
  } catch (err) {
    console.error("CreateCallAcceptWindow error:", err);
    return null;
  }
}

/** 关闭接听窗口（安全包装） */
export async function CloseCallAcceptWindow(): Promise<void> {
  try {
    const w = await tryGetWindowByLabel(StoresEnum.CALLACCEPT);
    if (w) {
      await w.close();
    }
  } catch (err) {
    console.warn("CloseCallAcceptWindow failed:", err);
  }
}

/** 创建通话主窗口，可控制是否可见 & 是否最大化（全屏） */
export async function CreateCallWindow(
  title: string,
  url: string,
  visible = true,
  isFullScreen = false
): Promise<MaybeWebview> {
  try {
    const webview = new WebviewWindow(StoresEnum.CALL, {
      title,
      url,
      width: CALL_WINDOW_SIZE.width,
      height: CALL_WINDOW_SIZE.height,
      center: true,
      decorations: false,
      visible,
      shadow: false
    });

    if (visible) {
      // 等待窗口创建事件再 show & focus；若事件没触发也 fallback（polling）
      const onCreated = async () => {
        try {
          await webview.show();
          await webview.setFocus();
          if (isFullScreen) {
            // toggleMaximize 可能是同步/异步，包裹 try/catch
            try {
              webview.setFullscreen(true);
            } catch (e) {
              console.warn("toggleMaximize failed", e);
            }
          }
        } catch (err) {
          console.warn("CreateCallWindow: show/focus failed", err);
        }
      };

      webview.once("tauri://window-created", onCreated);
      webview.once("tauri://webview-created", onCreated);
    }

    return webview;
  } catch (err) {
    console.error("CreateCallWindow error:", err);
    return null;
  }
}

/** 关闭主通话窗口 */
export async function CloseCallWindow(): Promise<void> {
  try {
    const w = await tryGetWindowByLabel(StoresEnum.CALL);
    if (w) {
      await w.close();
    }
  } catch (err) {
    console.warn("CloseCallWindow failed:", err);
  }
}

/** 显示主通话窗口（安全） */
export async function ShowCallWindow(): Promise<void> {
  try {
    const w = await tryGetWindowByLabel(StoresEnum.CALL);
    if (w) {
      await w.show();
      await w.setFocus();
    }
  } catch (err) {
    console.warn("ShowCallWindow failed:", err);
  }
}

/** ------- 辅助函数 ------- */

/** 更稳健的 detectOS（结合 navigator.platform/userAgent） */
function detectOS(): "Windows" | "macOS" | "Linux" | "iOS" | "Android" | "Unknown" {
  const ua = navigator.userAgent || "";
  const p = navigator.platform || "";

  if (/Windows/i.test(ua) || /Win/i.test(p)) return "Windows";
  if (/Mac/i.test(ua) || /Macintosh/i.test(ua)) return "macOS";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Linux/i.test(ua)) return "Linux";
  return "Unknown";
}

/** 计算弹窗位置 - 支持 Windows（右下角）和默认居中 */
function calculatePopupPosition(popupWidth = 250, popupHeight = 80) {
  const os = detectOS();
  if (os === "Windows") {
    const screenWidth = window.screen?.availWidth ?? 0;
    const screenHeight = window.screen?.availHeight ?? 0;
    const x = Math.max(0, screenWidth - popupWidth - 30);
    const y = Math.max(0, screenHeight - popupHeight - 40);
    return { x, y };
  }

  // macOS / Linux / mobile: 在屏幕右下可能被系统菜单遮挡 -> 返回居中或 (0,0) 由调用方决定
  const cx = Math.max(0, Math.floor((window.screen?.availWidth ?? popupWidth) / 2 - popupWidth / 2));
  const cy = Math.max(0, Math.floor((window.screen?.availHeight ?? popupHeight) / 2 - popupHeight / 2));
  return { x: cx, y: cy };
}

/** promise 轮询，等待 Window.getByLabel 成功返回（或超时） */
async function waitForWindowLabel(label: string, timeout = 3000, interval = 100): Promise<Window> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const w = await Window.getByLabel(label);
      if (w) return w;
    } catch {
      // getByLabel 可能会抛异常表示不存在，忽略并继续轮询
    }
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error("timeout waiting for window label: " + label);
}

/** 尝试获取窗口，不存在返回 null（对外用） */
async function tryGetWindowByLabel(label: string): Promise<MaybeWindow> {
  try {
    const w = await Window.getByLabel(label);
    return w ?? null;
  } catch {
    return null;
  }
}

/**
 * 等待某个窗口发来 ready 事件（使用全局事件 'call-ready'）
 * @param childLabel 子窗口 label
 * @param timeout 毫秒
 */
export async function waitForWindowReady(childLabel: string, timeout = 3000): Promise<void> {
  return new Promise(async (resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const unlistenP = listen("call-ready", e => {
      const payload = e.payload as any;
      if (payload && payload.label === childLabel) {
        unlistenP.then(un => un());
        if (timeoutId) clearTimeout(timeoutId);
        resolve();
      }
    });

    timeoutId = setTimeout(async () => {
      const un = await unlistenP;
      un();
      reject(new Error("timeout waiting for window ready"));
    }, timeout);
  });
}
