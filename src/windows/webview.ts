import { Webview } from "@tauri-apps/api/webview";
import { Window } from "@tauri-apps/api/window";

export const createWeb = async () => {
  const appWindow = (await Window.getByLabel("uniqueLabel")) ?? new Window("uniqueLabel");

  // 创建并显示一个新的子 WebView
  const child = new Webview(appWindow, "child-label", {
    url: "https://github.com/tauri-apps/tauri",
    x: 0,
    y: 0,
    width: 200,
    height: 200
  });
  child.once("tauri://created", () => {
    console.log("子 WebView 已创建");
  });

  return child;
};