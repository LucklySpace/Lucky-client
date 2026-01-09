import { clear, readImage, readText, writeHtml, writeImage, writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { Image } from "@tauri-apps/api/image";
import { invoke } from "@tauri-apps/api/core";

/**
 * ClipboardManager 工具类
 * 封装 Tauri 插件的剪贴板操作，提供统一的错误处理和便捷 API
 */
export default class ClipboardManager {
  /**
   * 写入纯文本到剪贴板
   * @param text 要写入的文本
   * @param label 可选标签，用于原生剪贴板管理
   * @throws 写入失败时抛出错误
   */
  static async writeText(text: string, label?: string): Promise<void> {
    try {
      await writeText(text, { label });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "写入文本到剪贴板失败";
      console.error("ClipboardManager.writeText failed:", error);
      throw new Error(errorMsg);
    }
  }

  /**
   * 从剪贴板读取纯文本
   * @returns 剪贴板中的文本
   * @throws 读取失败时抛出错误
   */
  static async readText(): Promise<string> {
    try {
      return await readText();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "从剪贴板读取文本失败";
      console.error("ClipboardManager.readText failed:", error);
      throw new Error(errorMsg);
    }
  }

  /**
   * 写入图像数据到剪贴板
   * @param image 图像数据，可以是 base64 字符串、Image 对象、Uint8Array、ArrayBuffer 或 number 数组
   * @throws 写入失败时抛出错误
   */
  static async writeImage(image: string | Image | Uint8Array | ArrayBuffer | number[]): Promise<void> {
    try {
      await writeImage(image);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "写入图片到剪贴板失败";
      console.error("ClipboardManager.writeImage failed:", error);
      throw new Error(errorMsg);
    }
  }

  /**
   * 使用 Rust 复制图片到剪贴板
   * @param path 图片路径
   * @throws 复制失败时抛出错误
   */
  static async copyImage(path: string): Promise<void> {
    try {
      await invoke("clipboard_image", { url: path });
      console.info("图片已复制到剪贴板");
    } catch (error) {
      console.error("复制图片失败:", error);
      throw error;
    }
  }

  /**
   * 从剪贴板读取图像数据
   * @returns 包含字节数据和元信息的 Image 对象
   * @throws 读取失败时抛出错误
   */
  static async readImage(): Promise<Image> {
    try {
      return await readImage();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "从剪贴板读取图片失败";
      console.error("ClipboardManager.readImage failed:", error);
      throw new Error(errorMsg);
    }
  }

  /**
   * 写入 HTML 到剪贴板，如果不支持 HTML，则回退为纯文本
   * @param html 要写入的 HTML 字符串
   * @param altHtml 可选的纯文本回退内容
   * @throws 写入失败时抛出错误
   */
  static async writeHtml(html: string, altHtml?: string): Promise<void> {
    try {
      await writeHtml(html, altHtml);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "写入 HTML 到剪贴板失败";
      console.error("ClipboardManager.writeHtml failed:", error);
      throw new Error(errorMsg);
    }
  }

  /**
   * 清空剪贴板内容
   * @throws 清空失败时抛出错误
   */
  static async clear(): Promise<void> {
    try {
      await clear();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "清空剪贴板失败";
      console.error("ClipboardManager.clear failed:", error);
      throw new Error(errorMsg);
    }
  }
}
