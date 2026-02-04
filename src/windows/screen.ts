import { StoresEnum } from "@/constants/index";
import type { MultiScreenInfo } from "@/views/screen/hooks/types";
import { closeWindow, getWindow, showAndFocus, withWindow } from "@/windows/utils";
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

// 重新导出类型以便外部使用
export type { DisplayInfo, MultiScreenInfo } from "@/views/screen/hooks/types";

/**
 * 获取多屏幕信息
 */
export async function getMultiScreenInfo(): Promise<MultiScreenInfo> {
  return await invoke<MultiScreenInfo>("get_display_info");
}

/**
 * 创建截图窗口（根据鼠标所在屏幕）
 */
export async function CreateScreenWindow(width?: number, height?: number) {
  try {
    const [mainWindow, existingWindow, screenInfo, mousePos] = await Promise.all([
      getWindow(StoresEnum.MAIN),
      getWindow(StoresEnum.SCREEN),
      getMultiScreenInfo(),
      invoke<[number, number]>("get_mouse_position")
    ]);

    // 关闭已有窗口，防止重复创建
    if (existingWindow) {
      await closeWindow(StoresEnum.SCREEN);
    }

    await mainWindow?.minimize();

    // 选择鼠标所在屏幕
    const [mx, my] = mousePos;
    const target =
      screenInfo.screens.find(s => mx >= s.x && mx < s.x + s.width && my >= s.y && my < s.y + s.height) ||
      screenInfo.screens.find(s => s.is_primary) ||
      screenInfo.screens[0];

    // 按目标屏幕创建窗口
    const windowWidth = width ?? target.width;
    const windowHeight = height ?? target.height;
    const windowX = target.x;
    const windowY = target.y;

    const webview = new WebviewWindow(StoresEnum.SCREEN, {
      url: "/screen",
      width: windowWidth,
      height: windowHeight,
      x: windowX,
      y: windowY,
      title: StoresEnum.SCREEN,
      resizable: false,
      decorations: false,
      alwaysOnTop: true,
      transparent: true,
      fullscreen: false,
      maximized: false,
      shadow: false,
      skipTaskbar: true,
      focus: true,
      visible: false
    });

    webview.once("tauri://webview-created", async () => {
      console.log("Webview created for multi-screen capture");
      await webview.show();
      await webview.setFocus();
    });

    webview.once("tauri://webview-close", async () => {
      await showAndFocus(StoresEnum.MAIN);
    });
  } catch (error) {
    console.error("Error creating screen window:", error);
  }
}

/**
 * 关闭窗口
 */
export const CloseScreenWindow = async () => {
  try {
    const closed = await closeWindow(StoresEnum.SCREEN);
    if (!closed) console.warn("Screen window is not available to close.");
  } catch (error) {
    console.error("Error closing screen window:", error);
  }
};

/**
 * 隐藏窗口
 */
export const HideScreenWindow = async () => {
  try {
    const ok = await withWindow(StoresEnum.SCREEN, win => win.hide());
    if (!ok) console.warn("Screen window is not available to hide.");
  } catch (error) {
    console.error("Error hiding screen window:", error);
  }
};

/**
 * 显示窗口
 */
export const ShowScreenWindow = async () => {
  try {
    const ok = await withWindow(StoresEnum.SCREEN, async win => {
      await win.show();
      await win.setFocus();
    });
    if (!ok) console.warn("Screen window is not available to show.");
  } catch (error) {
    console.error("Error showing screen window:", error);
  }
};

export default { CreateScreenWindow, CloseScreenWindow, HideScreenWindow, ShowScreenWindow };
