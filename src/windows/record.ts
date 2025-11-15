import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Window } from "@tauri-apps/api/window";
import { StoresEnum } from "@/constants/index";

/**
 * 创建截屏界面
 * @param width screen.availWidth
 * @param height screen.availHeight
 */
export async function CreateRecordWindow(width: number, height: number) {
  try {
    const mainWindow = await Window.getByLabel(StoresEnum.MAIN);
    const existingWindow = await Window.getByLabel(StoresEnum.RECORD);

    // 关闭已有窗口，防止重复创建
    if (existingWindow) {
      await existingWindow.close();
      // 等待窗口完全关闭
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 最小化主窗口
    await mainWindow?.minimize();

    const webview = new WebviewWindow(StoresEnum.RECORD, {
      url: "/record",
      width: width,
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
      console.log("录屏窗口已创建");
      try {
        // 设置窗口属性
        await webview.setAlwaysOnTop(true);
        await webview.setFullscreen(true);
        // await webview.setSkipTaskbar(true);
        // await webview.setIgnoreCursorEvents(true);

        // 显示并聚焦窗口
        await webview.show();
        await webview.setFocus();

        console.log("录屏窗口配置完成");
      } catch (setupError) {
        console.error("录屏窗口配置失败:", setupError);
      }
    });

    webview.once("tauri://webview-close", async () => {
      console.log("录屏窗口正在关闭");
      try {
        // 恢复主窗口
        await mainWindow?.unminimize();
        await mainWindow?.show();
        await mainWindow?.setFocus();
        console.log("主窗口已恢复");
      } catch (restoreError) {
        console.error("恢复主窗口失败:", restoreError);
      }
    });

    // 监听窗口错误
    webview.once("tauri://error", error => {
      console.error("录屏窗口错误:", error);
    });

    return webview;
  } catch (error) {
    console.error("创建录屏窗口失败:", error);
    throw error;
  }
}

/**
 * 关闭窗口
 */
export const CloseRecordWindow = async () => {
  try {
    const recordWindow = await Window.getByLabel(StoresEnum.RECORD);
    const mainWindow = await Window.getByLabel(StoresEnum.MAIN);

    if (recordWindow) {
      console.log("正在关闭录屏窗口...");
      await recordWindow.close();

      // 恢复主窗口
      if (mainWindow) {
        await mainWindow.unminimize();
        await mainWindow.show();
        await mainWindow.setFocus();
      }

      console.log("录屏窗口已关闭，主窗口已恢复");
    } else {
      console.warn("录屏窗口不存在或已关闭");
    }
  } catch (error) {
    console.error("关闭录屏窗口失败:", error);
  }
};

/**
 * 隐藏窗口
 */
export const HideRecordWindow = async () => {
  try {
    const recordWindow = await Window.getByLabel(StoresEnum.RECORD);
    if (recordWindow) {
      console.log("隐藏录屏窗口");
      await recordWindow.hide();
    } else {
      console.warn("录屏窗口不存在，无法隐藏");
    }
  } catch (error) {
    console.error("隐藏录屏窗口失败:", error);
  }
};

/**
 * 显示窗口
 */
export const ShowRecordWindow = async () => {
  try {
    const recordWindow = await Window.getByLabel(StoresEnum.RECORD);
    if (recordWindow) {
      console.log("显示录屏窗口");
      await recordWindow.show();
      await recordWindow.setFocus();
      await recordWindow.setAlwaysOnTop(true);
    } else {
      console.warn("录屏窗口不存在，无法显示");
    }
  } catch (error) {
    console.error("显示录屏窗口失败:", error);
  }
};

export default { CreateRecordWindow, CloseRecordWindow, HideRecordWindow, ShowRecordWindow };
