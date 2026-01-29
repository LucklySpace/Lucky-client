import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { closeWindow } from "@/windows/utils";

export async function openOverlay(x: number, y: number) {
  await closeWindow("overlay");

  const overlay = new WebviewWindow("overlay", {
    url: "/overlay", // 你的 Vue 页面
    width: 300,
    height: 200,
    x,
    y,
    transparent: true, // 背景透明
    decorations: false, // 去掉标题栏
    resizable: false,
    alwaysOnTop: true, // 永远置顶
    skipTaskbar: true, // 不显示在任务栏
    shadow: false // 不要窗口阴影（更像浮层）
  });

  overlay.once("tauri://webview-created", () => {
    console.log("Overlay created");
  });

  return overlay;
}
