import { onMounted, ref } from "vue";
import { size } from "@tauri-apps/plugin-fs";
import { appCacheDir, appDataDir, appLogDir, cacheDir } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";

/**
 * 存储明细信息
 */
export interface StorageDetail {
  title: string;
  formatted: string;
}

/**
 * 存储总览信息
 */
export interface StorageInfo {
  used: number; // 已用总字节
  usedPercent: number; // 已用百分比
  total: number; // 磁盘空间
  details: any;
}

/**
 * useStorageSpace - 管理应用存储空间统计
 *
 * 自动统计：
 *   - 聊天数据：存于 AppData/chat
 *   - 缓存数据：存于 Cache 目录
 *   - 日志数据：存于 Log 目录
 */
export function useStorageSpace() {
  const info = ref<StorageInfo>({ used: 0, usedPercent: 0, total: 0, details: null });

  async function refresh() {
    // 获取各目录绝对路径
    const appDataPath = await appDataDir();
    const appCachePath = await appCacheDir();
    const logPath = await appLogDir();
    const cachePath = await cacheDir();
    //const bytes = await size(getRootPath(cachePath));
    // 分类映射
    const categories: { title: string; path: string }[] = [
      { title: "data", path: appDataPath },
      //{ title: "缓存", path: cachePath },
      { title: "cache", path: appCachePath },
      { title: "other", path: logPath }
    ];

    let usedSum = 0;
    const details: any = {};

    for (const cat of categories) {
      // size() 会自动在 BaseDirectory 以外路径正常使用
      const bytes = await size(cat.path);
      usedSum += bytes;
      details[cat.title] = { title: cat.title, formatted: formatBytes(bytes) };
      //details.set(cat.title, { title: cat.title, formatted: formatBytes(bytes) });
    }

    // 示例：total=usedSum，计算百分比
    // const totalPath: any = (await getPath(cachePath)) || cachePath;
    const total = usedSum;
    const usedPercent = total ? (usedSum / total) * 100 : 0;

    info.value = { used: usedSum, total, usedPercent, details };
  }

  onMounted(refresh);

  return { info, refresh, formatBytes };
}

/**
 * 格式化字节数
 */
function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let num = bytes;
  let i = 0;
  while (num >= 1024 && i < units.length - 1) {
    num /= 1024;
    i++;
  }
  return `${num.toFixed(1)} ${units[i]}`;
}

async function loadAppdataDisk() {
  try {
    const info = (await invoke("get_appdata_disk_info")) as {
      total: number;
      available: number;
      used: number;
      used_percent: number;
      mount_point: string;
      fs_type: string;
      name: string;
    };

    console.log("Disk info", info);
    // 格式化显示
    const totalStr = formatBytes(info.total);
    const availStr = formatBytes(info.available);
    const usedStr = formatBytes(info.used);
    const percent = info.used_percent.toFixed(1) + "%";

    // 在 UI 中展示这些值
  } catch (e) {
    console.error("get_appdata_disk_info failed", e);
  }
}

// async function getPath(cachePath: string) {
//   const path = getRootPath(cachePath);
//   const response = await invoke("get_folder_size", {
//     path: path
//   });
//   return response;
// }

/**
 * 获取路径的根路径（第一级目录）
 * @param path 路径字符串，如 "/a/b/c"、"C:/Users/Admin"、"./src/utils"
 * @returns 根路径，如 "/a"、"C:/"、"./src"
 */
function getRootPath(path: string): string {
  if (!path) return "";

  // 去除 URL 参数和 hash
  path = path.split("?")[0].split("#")[0];

  // 统一使用正斜杠
  const normalized = path.replace(/\\/g, "/").trim();

  // Windows 驱动器根路径（C:/）
  const windowsRootMatch = normalized.match(/^([a-zA-Z]:\/)/);
  if (windowsRootMatch) {
    return windowsRootMatch[1];
  }

  // 相对路径 ./xxx/yyy
  if (normalized.startsWith("./") || normalized.startsWith("../")) {
    const parts = normalized.split("/");
    return parts.length >= 2 ? parts.slice(0, 2).join("/") : normalized;
  }

  // 绝对路径 /a/b/c
  const parts = normalized.split("/").filter(Boolean);
  return parts.length > 0 ? "/" + "/" + parts[0] : "/";
}
