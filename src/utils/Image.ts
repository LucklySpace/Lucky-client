import { appCacheDir, join } from "@tauri-apps/api/path";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";

/**
 * 缓存或读取网络图片
 * @param url 图片网络地址
 * @param cacheDir 缓存目录名称
 * @returns 可访问的本地 URL 地址
 */
export async function cacheMedia(url: string, cacheDir: string): Promise<string> {
  const path = await getPath(url, cacheDir);
  return convertFileSrc(path);
}

/**
 * 获取图片尺寸
 * @param url 图片路径
 * @returns 图片的宽度和高度
 */
export async function getImageSize(url: string): Promise<{ width: number; height: number }> {
  try {
    const [width, height]: [number, number] = await invoke("get_image_size", { path: url });
    return { width, height };
  } catch (error) {
    console.error("获取图片尺寸失败:", error);
    return { width: 0, height: 0 };
  }
}

/**
 * 获取图片缓存路径
 * @param url 图片网络地址
 * @param cacheDir 缓存目录名称
 * @returns 本地文件路径
 */
export async function getPath(url: string, cacheDir: string): Promise<string> {
  try {
    const baseDir = await appCacheDir();
    const imgCacheDir = await join(baseDir, cacheDir);

    const path: string = await invoke("cache_image_to_path", {
      url,
      cacheBase: imgCacheDir
    });
    
    return path;
  } catch (error) {
    console.error("获取图片路径失败:", error);
    throw error;
  }
}

/**
 * 将本地图片转换为 RGBA 数组
 * @param url 本地图片路径
 * @returns RGBA 数据及图片尺寸
 */
export async function url2rgba(url: string): Promise<{
  width: number;
  height: number;
  rgba: Uint8Array;
}> {
  try {
    const [width, height, rgbaArr] = await invoke<[number, number, number[]]>(
      "local_image_to_rgba",
      { url }
    );
    
    return {
      width,
      height,
      rgba: new Uint8Array(rgbaArr)
    };
  } catch (error) {
    console.error("图片转 RGBA 失败:", error);
    throw error;
  }
}

/**
 * 清空图片缓存
 * @todo 实现删除缓存目录下所有文件的逻辑
 */
export async function clearImageCache(): Promise<void> {
  // TODO: 调用 fs.removeDir 或 removeFile 遍历删除
  console.warn("clearImageCache 功能尚未实现");
}

/**
 * 将图片 URL 转换为 Base64
 * @param url 图片 URL
 * @param type MIME 类型，默认 "image/jpeg"
 * @returns Base64 字符串
 */
export function url2Base64(url: string, type = "image/jpeg"): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement("canvas");
    
    img.crossOrigin = "anonymous";
    
    img.onload = function () {
      const { width, height } = img;
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("无法获取 Canvas 上下文"));
        return;
      }

      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      try {
        const base64 = canvas.toDataURL(type);
        resolve(base64);
      } catch (error) {
        reject(new Error("转换 Base64 失败"));
      }
    };

    img.onerror = function () {
      reject(new Error("图片加载失败"));
    };

    img.src = url;
  });
}

/**
 * 将图片 URL 转换成 RGBA 数组
 * @param url 图片地址（支持跨域）
 * @returns RGBA 数组及图片尺寸
 */
export async function url2Array(url: string): Promise<{
  width: number;
  height: number;
  rgba: number[];
}> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("无法获取 Canvas 上下文");
    }

    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, img.width, img.height);

    return {
      width: img.width,
      height: img.height,
      rgba: Array.from(data)
    };
  } catch (error) {
    console.error("图片转数组失败:", error);
    throw error;
  }
}

/**
 * Blob 转 Base64
 * @param blob Blob 对象
 * @returns Base64 字符串
 */
export function blob2Base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      const base64 = reader.result?.toString() || "";
      resolve(base64);
    });

    reader.addEventListener("error", () => {
      reject(new Error("Blob 转 Base64 失败"));
    });

    reader.readAsDataURL(blob);
  });
}

/**
 * Base64 转 Blob URL
 * @param data Base64 字符串
 * @returns Blob URL
 */
export function base642Url(data: string): string {
  try {
    const parts = data.split(";base64,");
    const contentType = parts[0].split(":")[1];
    const raw = window.atob(parts[1]);
    const length = raw.length;
    const arr = new Uint8Array(length);

    for (let i = 0; i < length; i++) {
      arr[i] = raw.charCodeAt(i);
    }

    const blob = new Blob([arr], { type: contentType });
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error("Base64 转 URL 失败:", error);
    throw new Error("Base64 转 URL 失败");
  }
}
