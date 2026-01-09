import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Window } from "@tauri-apps/api/window";
import { emitTo, listen } from "@tauri-apps/api/event";
import { StoresEnum } from "@/constants/index";
import Log from "@/utils/Log";

/**
 * 创建图片预览页面
 * @param name 名称
 * @param url 预览地址
 */
export const CreatePreviewWindow = async (name: string, url: string, type: string) => {
  let webview = new WebviewWindow(StoresEnum.PREVIEW_MEDIA, {
    url: "/preview/media",
    width: 900,
    height: 650,
    center: true,
    decorations: false,
    resizable: false,
    focus: true
  });

  const unlisten = await listen("preview-media-create", () => {
    emitTo(StoresEnum.PREVIEW_MEDIA, "preview-media-load", { name, url, type });
    Log.prettySuccess("图片预览页面创建完成");
    unlisten();
  });

  webview.once("tauri://webview-created", function () {
    Log.prettySuccess("图片预览页面创建完成");
  });
};

/**
 * 显示图片预览页面
 * @param name 名称
 * @param url 预览地址
 */
export const ShowPreviewWindow = async (name: string, url: string, type: string) => {
  const previewWindow = await Window.getByLabel(StoresEnum.PREVIEW_MEDIA);
  if (previewWindow) {
    emitTo(StoresEnum.PREVIEW_MEDIA, "preview-media-load", { name, url, type }); // 执行相应的操作
    previewWindow.show();
    previewWindow.setFocus();
  } else {
    CreatePreviewWindow(name, url, type);
  }
};

/**
 * 隐藏图片预览窗口
 */
export const HidePreviewWindow = async () => {
  const previewWindow = await Window.getByLabel(StoresEnum.PREVIEW_MEDIA);
  if (previewWindow) previewWindow?.hide();
};

/**
 * 创建文件预览页面
 * @param name 名称
 * @param url 预览地址
 */
export const CreatePreviewFileWindow = async (name: string, url: string) => {
  let webview = new WebviewWindow(StoresEnum.PREVIEW_FILE, {
    url: "/preview/file",
    width: 900,
    height: 650,
    center: true,
    decorations: false,
    resizable: false,
    focus: true,
    title: name
  });

  const unlisten = await listen("preview-file-create", () => {
    emitTo(StoresEnum.PREVIEW_FILE, "preview-file-load", { name, url });
    Log.prettySuccess("文件预览页面创建完成");
    unlisten();
  });

  webview.once("tauri://webview-created", function () {
    Log.prettySuccess("文件预览页面创建完成");
  });
};

/**
 * 显示文件预览页面
 * @param name 文件名称
 * @param url 文件地址
 */
export const ShowPreviewFileWindow = async (name: string, url: string) => {
  const previewWindow = await Window.getByLabel(StoresEnum.PREVIEW_FILE);
  if (previewWindow) {
    emitTo(StoresEnum.PREVIEW_FILE, "preview-file-load", { name, url }); // 执行相应的操作
    previewWindow.setTitle(name);
    previewWindow.show();
    previewWindow.setFocus();
  } else {
    CreatePreviewFileWindow(name, url);
  }
};

/**
 * 隐藏文件预览页面
 */
export const HidePreviewFileWindow = async () => {
  const previewWindow = await Window.getByLabel(StoresEnum.PREVIEW_FILE);
  if (previewWindow) previewWindow?.hide();
};

export default { CreatePreviewWindow, ShowPreviewWindow, HidePreviewWindow, ShowPreviewFileWindow };
