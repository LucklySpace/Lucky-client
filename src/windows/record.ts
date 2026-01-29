import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { StoresEnum } from "@/constants/index";
import { closeWindow, getWindow, showAndFocus, withWindow } from "@/windows/utils";

/**
 * 创建截屏界面
 * @param width screen.availWidth
 * @param height screen.availHeight
 */
export async function CreateRecordWindow(width: number, height: number) {
  try {
    const [mainWindow, existingWindow] = await Promise.all([
      getWindow(StoresEnum.MAIN),
      getWindow(StoresEnum.RECORD)
    ]);

    // 关闭已有窗口，防止重复创建
    if (existingWindow) {
      await closeWindow(StoresEnum.RECORD);
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
        await showAndFocus(StoresEnum.MAIN);
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
    const closed = await closeWindow(StoresEnum.RECORD);
    if (closed) {
      await showAndFocus(StoresEnum.MAIN);
      console.log("录屏窗口已关闭，主窗口已恢复");
      return;
    }
    console.warn("录屏窗口不存在或已关闭");
  } catch (error) {
    console.error("关闭录屏窗口失败:", error);
  }
};

/**
 * 隐藏窗口
 */
export const HideRecordWindow = async () => {
  try {
    const ok = await withWindow(StoresEnum.RECORD, win => win.hide());
    if (!ok) console.warn("录屏窗口不存在，无法隐藏");
  } catch (error) {
    console.error("隐藏录屏窗口失败:", error);
  }
};

/**
 * 显示窗口
 */
export const ShowRecordWindow = async () => {
  try {
    const ok = await withWindow(StoresEnum.RECORD, async win => {
      await win.show();
      await win.setFocus();
      await win.setAlwaysOnTop(true);
    });
    if (!ok) console.warn("录屏窗口不存在，无法显示");
  } catch (error) {
    console.error("显示录屏窗口失败:", error);
  }
};

export default { CreateRecordWindow, CloseRecordWindow, HideRecordWindow, ShowRecordWindow };
