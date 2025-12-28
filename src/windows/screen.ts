import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Window } from "@tauri-apps/api/window";
import { StoresEnum } from "@/constants/index";
import { emit } from "@tauri-apps/api/event";

let creating = false;

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function closeSafely(win: Window, timeout = 300) {
  try {
    const waitClosed = new Promise<void>(resolve => {
      // webview 关闭事件
      (win as any).once?.("tauri://webview-close", () => resolve());
      // 某些平台也可兼听 tauri://destroyed
      (win as any).once?.("tauri://destroyed", () => resolve());
    });
    await Promise.race([win.close(), waitClosed, wait(timeout)]);
  } catch {}
}

export async function CreateScreenWindow(width: number, height: number) {
  if (creating) return;
  creating = true;
  try {
    const existing = await Window.getByLabel(StoresEnum.SCREEN);
    if (existing) {
      await closeSafely(existing, 300);
      // 超时兜底：广播“自杀”事件再等一小会
      await emit("screen:dispose");
      await wait(150);
    }

    const webview = new WebviewWindow(StoresEnum.SCREEN, {
      url: "/screen",
      width: width,
      title: StoresEnum.SCREEN,
      height: height,
      center: true,
      resizable: false,
      decorations: false,
      alwaysOnTop: false,
      transparent: true,
      fullscreen: true,
      maximized: true,
      shadow: false,
      skipTaskbar: false,
      focus: true,
      visible: false
    });

    webview.once("tauri://webview-created", async () => {
      console.log("Webview created");
      await webview.show(); // 确保窗口显示
      await webview.setFocus(); // 确保窗口聚焦
    });

    webview.once("tauri://webview-close", async () => {
      const mainWindow = await Window.getByLabel(StoresEnum.MAIN);
      await mainWindow?.maximize();
      await mainWindow?.show();
      await mainWindow?.setFocus();
    });
  } catch (error) {
    console.error("Error creating screen window:", error);
  } finally {
    creating = false;
  }
}

/**
 * 关闭窗口
 */
export const CloseScreenWindow = async () => {
  try {
    const screenWindow = await Window.getByLabel(StoresEnum.SCREEN);
    if (screenWindow) {
      await screenWindow.close();
    } else {
      console.warn("Screen window is not available to close.");
    }
  } catch (error) {
    console.error("Error closing screen window:", error);
  }
};

/**
 * 隐藏窗口
 */
export const HideScreenWindow = async () => {
  try {
    const screenWindow = await Window.getByLabel(StoresEnum.SCREEN);
    if (screenWindow) {
      await screenWindow.hide();
    } else {
      console.warn("Screen window is not available to hide.");
    }
  } catch (error) {
    console.error("Error hiding screen window:", error);
  }
};

/**
 * 显示窗口
 */
export const ShowScreenWindow = async () => {
  try {
    const screenWindow = await Window.getByLabel(StoresEnum.SCREEN);
    if (screenWindow) {
      await screenWindow.show();
      await screenWindow.setFocus();
    } else {
      console.warn("Screen window is not available to show.");
    }
  } catch (error) {
    console.error("Error showing screen window:", error);
  }
};

export default { CreateScreenWindow, CloseScreenWindow, HideScreenWindow, ShowScreenWindow };
