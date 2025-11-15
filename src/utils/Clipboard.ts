import { clear, readImage, readText, writeHtml, writeImage, writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { Image } from "@tauri-apps/api/image";
import { invoke } from "@tauri-apps/api/core";

/**
 * ClipboardManager 工具类
 * 封装 Tauri 插件的剪贴板操作，提供统一的错误处理和便捷 API。
 */
export default class ClipboardManager {
  /**
   * 写入纯文本到剪贴板
   * @param text 要写入的文本
   * @param label 可选标签，用于原生剪贴板管理
   */
  static async writeText(text: string, label?: string): Promise<void> {
    try {
      await writeText(text, { label });
    } catch (err) {
      console.error("ClipboardManager.writeText failed:", err);
      throw err;
    }
  }

  /**
   * 从剪贴板读取纯文本
   * @returns 剪贴板中的文本
   */
  static async readText(): Promise<string> {
    try {
      return await readText();
    } catch (err) {
      console.error("ClipboardManager.readText failed:", err);
      throw err;
    }
  }

  /**
   * 写入图像数据到剪贴板
   * @param image 图像数据，可以是 base64 字符串、Image 对象、Uint8Array、ArrayBuffer、或 number 数组
   */
  static async writeImage(image: string | Image | Uint8Array | ArrayBuffer | number[]): Promise<void> {
    try {
      await writeImage(image);
    } catch (err) {
      console.error("ClipboardManager.writeImage failed:", err);
      throw err;
    }
  }


  /**
   * 使用rust 复制图片
   */
  static async copyImage(path: string): Promise<void> {
    try {
      await invoke("clipboard_image", { url: path });
      console.log("✅ 图片已复制到剪贴板");
    } catch (e) {
      console.error("⚠️ 复制失败:", e);
    }
  }

  /**
   * 从剪贴板读取图像数据
   * @returns 包含字节数据和元信息的 Image 对象
   */
  static async readImage(): Promise<Image> {
    try {
      return await readImage();
    } catch (err) {
      console.error("ClipboardManager.readImage failed:", err);
      throw err;
    }
  }

  /**
   * 写入 HTML 到剪贴板，如果不支持 HTML，则回退为纯文本
   * @param html 要写入的 HTML 字符串
   * @param altHtml 可选的纯文本回退内容
   */
  static async writeHtml(html: string, altHtml?: string): Promise<void> {
    try {
      await writeHtml(html, altHtml);
    } catch (err) {
      console.error("ClipboardManager.writeHtml failed:", err);
      throw err;
    }
  }

  /**
   * 清空剪贴板内容
   */
  static async clear(): Promise<void> {
    try {
      await clear();
    } catch (err) {
      console.error("ClipboardManager.clear failed:", err);
      throw err;
    }
  }
}
