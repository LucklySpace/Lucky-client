import { exists } from "@tauri-apps/plugin-fs";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { download as tauriDownload,  upload as tauriUpload } from "@tauri-apps/plugin-upload";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { ShowPreviewFileWindow } from "@/windows/preview";
import ObjectUtils from "@/utils/ObjectUtils";
import { useSettingStore } from "@/store/modules/setting";
import { appCacheDir, downloadDir, join, resolve } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ElMessage } from "element-plus";
import { useLogger } from "./useLogger";

/**
 * 文件类型枚举
 */
export enum FileEnum {
  MD = "md",
  JPG = "jpg",
  JPEG = "jpeg",
  PNG = "png",
  GIF = "gif",
  BMP = "bmp",
  SVG = "svg",
  WEBP = "webp",
  TXT = "txt",
  MP4 = "mp4",
  MOV = "mov",
  AVI = "avi",
  WMV = "wmv",
  MKV = "mkv",
  MPEG = "mpeg",
  FLV = "flv",
  WEBM = "webm",
  MP3 = "mp3",
  WAV = "wav",
  PDF = "pdf",
  DOC = "doc",
  DOCX = "docx",
  ODT = "odt",
  RTF = "rtf",
  XLS = "xls",
  XLSX = "xlsx",
  PPT = "ppt",
  PPTX = "pptx",
  ZIP = "zip",
  "7Z" = "7z",
  RAR = "rar",
  OTHER = "file"
}

/**
 * 默认文件类型集合（用于文件选择过滤）
 */
export const DEFAULT_FILE_TYPES: FileEnum[] = [
  FileEnum.JPG,
  FileEnum.PNG,
  FileEnum.TXT,
  FileEnum.BMP,
  FileEnum.MP4,
  FileEnum.MP3,
  FileEnum.PDF,
  FileEnum.DOCX,
  FileEnum.XLSX,
  FileEnum.PPTX,
  FileEnum.ZIP,
  FileEnum["7Z"],
  FileEnum.RAR,
  FileEnum.OTHER
];

/**
 * 下载进度回调参数
 */
interface ProgressPayload {
    progress: number;
    progressTotal: number;
    total: number;
    transferSpeed: number;
}

/**
 * 扩展名到枚举映射
 */
const extensionEnumMap: Record<string, FileEnum> = Object.values(FileEnum).reduce((map, fileEnum) => {
  if (fileEnum === FileEnum.OTHER) return map;
  map[fileEnum] = fileEnum;
  return map;
}, {} as Record<string, FileEnum>);

/**
 * 文件类型分类映射
 */
const enumCategoryMap: Record<FileEnum, string> = {
  [FileEnum.MD]: "markdown",
  [FileEnum.TXT]: "text",
  [FileEnum.OTHER]: "file",
  [FileEnum.JPG]: "image",
  [FileEnum.JPEG]: "image",
  [FileEnum.PNG]: "image",
  [FileEnum.GIF]: "image",
  [FileEnum.BMP]: "image",
  [FileEnum.SVG]: "image",
  [FileEnum.WEBP]: "image",
  [FileEnum.MP4]: "video",
  [FileEnum.MOV]: "video",
  [FileEnum.AVI]: "video",
  [FileEnum.WMV]: "video",
  [FileEnum.MKV]: "video",
  [FileEnum.MPEG]: "video",
  [FileEnum.FLV]: "video",
  [FileEnum.WEBM]: "video",
  [FileEnum.MP3]: "audio",
  [FileEnum.WAV]: "audio",
  [FileEnum.PDF]: "pdf",
  [FileEnum.DOC]: "word",
  [FileEnum.DOCX]: "word",
  [FileEnum.ODT]: "word",
  [FileEnum.RTF]: "word",
  [FileEnum.XLS]: "excel",
  [FileEnum.XLSX]: "excel",
  [FileEnum.PPT]: "powerpoint",
  [FileEnum.PPTX]: "powerpoint",
  [FileEnum.ZIP]: "zip",
  [FileEnum["7Z"]]: "zip",
  [FileEnum.RAR]: "zip"
};

/**
 * 提取文件扩展名（不含点，转小写）
 */
export function getFileExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  if (idx === -1 || idx === fileName.length - 1) return "";
  return fileName.slice(idx + 1).toLowerCase();
}

/**
 * 根据扩展名返回枚举
 */
export function getEnumByExtension(fileName: string): FileEnum {
  const ext = getFileExtension(fileName);
  return extensionEnumMap[ext] ?? FileEnum.OTHER;
}

/**
 * 根据文件名返回通用类型字符串
 */
export function getFileType(fileName: string): string {
  const fileEnum = getEnumByExtension(fileName);
  return enumCategoryMap[fileEnum] ?? enumCategoryMap[FileEnum.OTHER];
}

/**
 * 文件图标映射
 */
const fileIconMap = {
  md: "#icon-Markdown",
  "7z": "#icon-file_rar",
  rar: "#icon-file_rar",
  zip: "#icon-file_rar",
  pdf: "#icon-file-b-3",
  doc: "#icon-file-b-5",
  docx: "#icon-file-b-5",
  xls: "#icon-file-b-9",
  xlsx: "#icon-file-b-9",
  ppt: "#icon-file-b-4",
  pptx: "#icon-file-b-4",
  txt: "#icon-file-b-2",
  default: "#icon-file_rar"
};

/**
 * 获取文件图标（供组件直接使用）
 */
export function fileIcon(extension: string = ""): string {
  return (fileIconMap as any)[extension] || fileIconMap.default;
}

/**
 * 打开文件选择框（按扩展名过滤）
 */
export async function openFileDialog(name: string, extensions: FileEnum[]): Promise<string | string[] | null> {
  try {
    const file = await openDialog({
      multiple: false,
      directory: false,
      filters: [{ name, extensions }]
    });
    return Array.isArray(file) ? (file[0] ?? null) : file;
  } catch (error) {
    console.error("打开文件对话框失败:", error);
    return null;
  }
}

/**
 * 保存文件对话框，返回用户选择的保存路径
 */
export async function saveFileDialog(filename: string, name: string, ...extensions: FileEnum[]): Promise<string> {
  try {
    const path = await saveDialog({
      defaultPath: filename,
      filters: [{ name, extensions }]
    });
    return path || "";
  } catch (error) {
    console.error("保存文件对话框失败:", error);
    return "";
  }
}

/**
 * 上传文件（简单包装）
 */
export async function uploadFile(url: string, path: string): Promise<void> {
  const progressHandler: any = (progress: number, total: number) => {
    console.log(`Uploaded ${progress} of ${total} bytes`);
  };
  const headers: any = { "Content-Type": "multipart/form-data" };
  await tauriUpload(url, path, progressHandler, headers);
}

/**
 * 下载到指定本地路径（简单包装）
 */
export async function downloadToPath(url: string, path: string): Promise<void> {
  const progressHandler: any = (progress: any, total: any) => {
    console.log(`Downloaded ${progress} of ${total} bytes`);
  };
  const headers: any = { "Content-Type": "multipart/form-data" };
  await tauriDownload(url, path, progressHandler, headers);
}

/**
 * 格式化文件大小（Bytes/KB/MB/...）
 */
export function formatFileSize(value: any | null): string {
  if (value == null || value === "") {
    return "0";
  }
  const units = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const size = parseFloat(value as any);
  const index = Math.floor(Math.log(size) / Math.log(1024));
  const formatted = (size / Math.pow(1024, index)).toFixed(2);
  return `${formatted} ${units[index]}`;
}

/**
 * 本地缓存目录文件转浏览器可用 src
 */
export async function localFileToSrc(path: string): Promise<string> {
  const cacheDir = await appCacheDir();
  const fullPath = await join(cacheDir, path);
  const timestamp = Date.now();
  return `${convertFileSrc(fullPath)}?t=${timestamp}`;
}

/**
 * 文件相关操作 Hook
 */
export function useFile() {
  // 日志
  const log = useLogger();

  const settingStore = useSettingStore();

  /**
   * 打开文件
   * @param path 文件路径
   * @returns 成功打开返回 true，否则返回 false
   */
  async function openFile(path: string): Promise<boolean> {
    // 路径为空，直接返回
    if (ObjectUtils.isEmpty(path)) {
      ElMessage.info("文件路径不能为空");
      return false;
    }

    try {
      // 检查文件是否存在
      const fileExists = await exists(path);
      if (!fileExists) {
        ElMessage.info("文件不存在");
        return false;
      }

      // 调用系统默认应用打开文件
      await openPath(path);
      log.info(`文件 ${path} 已打开`);
      return true;
    } catch (err: any) {
      // 捕获任何异常，提示并记录日志
      log.error(`打开文件时出错:`, err);
      ElMessage.error("打开文件失败");
      return false;
    }
  }

  /**
   * 下载文件
   * @param name 文件名（含后缀）
   * @param path 文件远程 URL 或路径
   * @returns 成功时返回本地保存路径，否则返回 undefined
   */
  async function downloadFile(name: string, path: string): Promise<string | undefined> {
    // 必填校验
    if (ObjectUtils.isAllEmpty(name, path)) {
      ElMessage.info("文件名或路径不能为空");
      return;
    }

    try {
      // 保存文件弹窗
      const localPath = await saveFileDialog(name, getFileType(name), getEnumByExtension(name));

      // 用户取消保存
      if (ObjectUtils.isEmpty(localPath)) {
        ElMessage.info("已取消下载");
        return;
      }

      // 执行下载，并等待完成
      await tauriDownload(path, localPath, (progress: ProgressPayload) => {
        console.log(`Downloaded ${progress.progress} of ${progress.total} bytes`);
      });

      log.info(`文件 ${path} 已下载到 ${localPath}`);
      // 提示成功
      ElMessage.success(`文件已保存到：${localPath}`);
      return localPath;
    } catch (err: any) {
      log.error("下载文件失败：", err);
      ElMessage.error("下载文件失败，请重试");
      return;
    }
  }

  /**
   * 预览文件
   * @param path 文件路径
   */
  function previewFile(name: string, path: string) {
    if (ObjectUtils.isAllNotEmpty(name, path)) {
      try {
        ShowPreviewFileWindow(name, path);
        log.info(`预览文件 ${path} 已打开`);
      } catch (err) {
        ElMessage.info("文件不存在");
      }
    }
  }

  /**
   * 打开文件所在位置
   * @param path 文件路径
   */
  async function openFilePath(path: string) {
    if (ObjectUtils.isNotEmpty(path)) {
      try {
        await revealItemInDir(path);
        log.info(`文件所在位置 ${path} 已打开`);
      } catch (err) {
        ElMessage.info("文件不存在");
      }
    }
  }

  /**
   * 自动下载 200MB 以内的文件
   * @param name 文件名（含扩展名）
   * @param path 远程文件路径
   * @param size 文件大小（单位：字节）
   * @returns 成功时返回本地路径，否则返回 undefined
   */
  async function autoDownloadFile(name: string, path: string, size: number): Promise<string | undefined> {
    // 200MB 限制
    const MAX_SIZE = 200 * 1024 * 1024;

    // 超出大小则跳过
    if (size > MAX_SIZE) {
      log.warn(`跳过自动下载：文件大小 ${size} 超过 200MB 限制`);
      return;
    }

    // 设置中是否启用自动下载
    if (!settingStore.file.enable) {
      log.warn(`未开启自动下载`);
      return;
    }

    try {
      let downloadPath = settingStore.file.path;

      // 没设置下载路径则请求默认下载目录
      if (ObjectUtils.isEmpty(downloadPath)) {
        downloadPath = await downloadDir();
        if (!downloadPath) {
          ElMessage.warning("未获取到下载目录");
          return;
        }
        settingStore.file.path = downloadPath;
      }

      const localPath = await resolve(downloadPath, name);

      // 开始下载
      await tauriDownload(path, localPath, (progress: ProgressPayload) => {
        console.log(`Downloaded ${progress.progress} of ${progress.total} bytes`);
      });

      log.info(`自动下载成功: ${localPath}`);
      return localPath;
    } catch (err: any) {
      log.error("自动下载失败:", err);
      ElMessage.error("自动下载失败");
      return;
    }
  }

  /**
   * 打开文件所在位置
   * @param path 文件路径
   */
  async function openLocalPath(path: string) {
    if (ObjectUtils.isNotEmpty(path)) {
      try {
        await revealItemInDir(path);
        log.info(`文件所在位置 ${path} 已打开`);
      } catch (err) {
        ElMessage.info("文件不存在");
      }
    }
  }

  /**
   * 选择文件夹
   * @returns
   */
  async function selectFolder(): Promise<string | null> {
    // directory: true → 选择文件夹；multiple: false（默认）→ 单选
    const folder = await openDialog({
      directory: true
    });
    // 返回选中的文件夹路径，若用户取消则返回 null
    return Array.isArray(folder) ? folder[0] : folder;
  }

  return {
    openFile,
    downloadFile,
    previewFile,
    openFilePath,
    openLocalPath,
    autoDownloadFile,
    selectFolder
  };
}
