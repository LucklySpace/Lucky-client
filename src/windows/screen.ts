import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Window } from "@tauri-apps/api/window";
import { StoresEnum } from "@/constants/index";

export async function CreateScreenWindow(width: number, height: number) {
  try {
    const mainWindow = await Window.getByLabel(StoresEnum.MAIN);
    const existingWindow = await Window.getByLabel(StoresEnum.SCREEN);

    // 关闭已有窗口，防止重复创建
    if (existingWindow) {
      await existingWindow.close();
    }

    await mainWindow?.minimize();

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
      await mainWindow?.maximize();
      await mainWindow?.show();
      await mainWindow?.setFocus();
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