import { appCacheDir, join } from "@tauri-apps/api/path";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";

/**
 * 缓存或读取网络图片
 * @param url 图片网络地址
 * net::ERR_CONNECTION_REFUSED 报错  https://github.com/tauri-apps/tauri/issues/9359
 * tauri.conf.json "csp":  "default-src 'self'; img-src 'self'; asset: https://asset.localhost"
 */
export async function cacheMedia(url: string, cacheDir: string): Promise<string> {
  // 获取应用缓存目录
  let path = await getPath(url, cacheDir);
  // 转为可访问的本地url地址
  //return `${convertFileSrc(path)}?t=${Date.now()}`
  return `${convertFileSrc(path)}`;
}


export async function getImageSize(url: string) {
  try {
    const [width, height]: [number, number] = await invoke("get_image_size", {
      path: url
    });
    return { width, height };
  } catch (err) {
    console.log(err);
  }

  return { width: 0, height: 0 };
}


export async function getPath(url: string, cacheDir: string) {
  // 获取应用缓存目录
  const baseDir = await appCacheDir();

  const imgCacheDir = await join(baseDir, cacheDir);

  // 获取文件地址
  const path: string = await invoke("cache_image_to_path", {
    url,
    cacheBase: imgCacheDir
  });
  return path;
}


export async function url2rgba(url: string) {
  const [width, height, rgbaArr] = await invoke<[number, number, number[]]>(
    "local_image_to_rgba",
    { url }
  );
  return {
    width,
    height,
    rgba: new Uint8Array(rgbaArr)
  };
}


// export async function cacheImage(url: string): Promise<string> {
//     // 获取应用缓存目录
//     const baseDir = await appCacheDir()
//     // 获取文件地址
//     const path: string = await invoke('cache_image_to_path', {
//         url,
//         cacheBase: await join(baseDir, 'image_cache')
//     })
//     // 4. 读取本地二进制并生成 Blob URL
//     const data = await readFile(path)
//     const uint8 = Uint8Array.from(data)

//     // 根据后缀猜 MIME
//     const ext = url.split('.').pop()!
//     const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
//     const blob = new Blob([uint8], { type: mime })
//     return URL.createObjectURL(blob)
// }

// function joinPath(...paths: string[]): string {
//     return paths
//         .map((s, i) => i === 0 ? s.replace(/[\/\\]+$/, '') : s.replace(/^[\/\\]+|[\/\\]+$/g, ''))
//         .join('/');
// }

// /**
//  * 根据 URL 生成带后缀的 SHA-256 哈希文件名
//  * @param url 图片 URL
//  */
// async function urlToFilename(url: string): Promise<string> {
//     const match = url.match(/\.(\w+)(\?.*)?$/);
//     const ext = match ? match[1] : 'jpg';
//     const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url));
//     const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
//     return `${hex}.${ext}`;
// }

// /**
//  * 获取并创建缓存目录，返回绝对本地目录
//  */
// async function getCacheDir(): Promise<string> {
//     const base = await appCacheDir();
//     const dir = await join(base, 'image_cache');
//     const dirExists = await exists(dir);
//     if (!dirExists) {
//         await mkdir(dir, { recursive: true });
//     }
//     return dir;
// }

// /**
//  * 构造可直接用于 <img src> 的本地 URL，并附加时间戳防止缓存
//  */
// function toCacheUrl(filePath: string): string {
//     return `${convertFileSrc(filePath)}?t=${Date.now()}`;
// }

// /**
//  * 缓存或读取网络图片
//  * @param url 图片网络地址
//  */
// export async function cacheImage(url: string): Promise<string> {
//     const cacheDir = await getCacheDir();
//     const filename = await urlToFilename(url);
//     const fullPath = await join(cacheDir, filename);

//     if (await exists(fullPath)) {
//         return toCacheUrl(fullPath);
//     }

//     // 下载并写入
//     const resp = await fetch(url);
//     if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
//     const data = new Uint8Array(await resp.arrayBuffer());
//     await writeFile(
//         fullPath,
//         data,
//     );
//     return toCacheUrl(fullPath);
// }


/**
 * 清空整表缓存（删除缓存目录下所有文件）
 */
export async function clearImageCache(): Promise<void> {
  //  const cacheDir = await ensureCacheDir();
  //const entries: DirEntry[] = await readTextFile(cacheDir as any) // read dir not text; placeholder
  // TODO: 调用 fs.removeDir 或 removeFile 遍历删除
}


/**
 * 图片url 转 base64
 * @param url 图片url
 * @param type  类型
 * @returns
 */
export function url2Base64(url: string, type = "image/jpeg") {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement("canvas");
    img.crossOrigin = "*";
    img.onload = function() {
      const width = img.width, height = img.height;
      canvas.width = width;
      canvas.height = height;

      const ctx: any = canvas.getContext("2d");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, width, height);
      const base64 = canvas.toDataURL(type);
      resolve(base64);
    };
    img.onerror = function() {
      reject(new Error("message"));
    };
    img.src = url;
  });
}


/**
 * 将图片 URL 转换成 RGBA 数组
 * @param url 图片地址（支持跨域）
 * @returns Promise<number[]>，每 4 个数字代表一个像素的 [R, G, B, A]
 */
export async function url2Array(url: string): Promise<{ width: number; height: number; rgba: number[] }> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  const { data } = ctx.getImageData(0, 0, img.width, img.height);
  return { width: img.width, height: img.height, rgba: Array.from(data) };
}


/**
 * blob转base64
 * @param blob
 * @returns
 */
export function blob2Base64(blob: any) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const base64 = reader.result?.toString() || "";
      resolve(base64);
    });
    reader.addEventListener("error", () => {
      reject(new Error("message"));
    });
    reader.readAsDataURL(blob);
  });
}


/**
 * base转url
 * @param data base64
 * @returns
 */
function base642Url(data: string) {
  var parts = data.split(";base64,"),
    contentType = parts[0].split(":")[1],
    raw = window.atob(parts[1]),
    length = raw.length,
    arr = new Uint8Array(length);
  for (var i = 0; i < length; i++) {
    arr[i] = raw.charCodeAt(i);
  }
  var blob = new Blob([arr], { type: contentType });
  return URL.createObjectURL(blob);
};
