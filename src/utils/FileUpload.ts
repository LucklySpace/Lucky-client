import { download, upload } from "@tauri-apps/plugin-upload";
import { open, save } from "@tauri-apps/plugin-dialog";


const uploadFile = async (url: string, path: string) => {
  const progressHandler: any = (progress: number, total: number) => {
    console.log(`Uploaded ${progress} of ${total} bytes`);
  };
  const headers: any = { "Content-Type": "multipart/form-data" };
  upload(
    url,
    path,
    progressHandler, // 上传进度时调用的回调函数
    headers // 与请求一起发送的可选头信息
  );
};

const downloadFile = async (url: string, path: string) => {
  const progressHandler: any = (progress: any, total: any) => console.log(`Downloaded ${progress} of ${total} bytes`);
  const headers: any = { "Content-Type": "multipart/form-data" };
  return download(
    url,
    path,
    progressHandler, // 下载进度时调用的回调函数
    headers // 与请求一起发送的可选头信息
  );
};

/**
 * 打开文件对话框
 * @param name 文件类型名称
 * @param extensions 允许的文件扩展名数组
 */
const openFileDialog = async (name: string, extensions: FileEnum[]): Promise<any> => {
  try {
    const file = await open({
      multiple: false,
      directory: false,
      filters: [{ name, extensions }]
    });
    if (file) {
      console.log("File selected:", file);
      return file;
    } else {
      console.log("No file selected.");
    }
  } catch (error) {
    console.error("Failed to open file dialog:", error);
  }
};

/**
 * 保存文件对话框
 * @param name 文件类型名称
 * @param extensions 允许的文件扩展名数组
 */
const saveFileDialog = async (filename: string, name: string, ...extensions: FileEnum[]): Promise<string> => {
  try {
    const path = await save({
      defaultPath: filename,
      filters: [{ name, extensions }]
    });
    if (path) {
      console.log("File saved at:", path);
      return path;
    } else {
      console.log("Save operation canceled.");
    }
  } catch (error) {
    console.error("Failed to save file:", error);
  }
  return "";
};

/** 文件类型枚举：所有我们关心的扩展名都在这里列出，最后一个 OTHER 用作兜底 */
enum FileEnum {
  /** Markdown 文档 */
  MD = "md",
  /** 图片格式 */
  JPG = "jpg",
  JPEG = "jpeg",
  PNG = "png",
  GIF = "gif",
  BMP = "bmp",
  SVG = "svg",
  WEBP = "webp",
  /** 文本格式 */
  TXT = "txt",
  /** 视频格式 */
  MP4 = "mp4",
  MOV = "mov",
  AVI = "avi",
  WMV = "wmv",
  MKV = "mkv",
  MPEG = "mpeg",
  FLV = "flv",
  WEBM = "webm",
  /** 音频格式 */
  MP3 = "mp3",
  WAV = "wav",
  /** 文档格式 */
  PDF = "pdf",
  DOC = "doc",
  DOCX = "docx",
  ODT = "odt",
  RTF = "rtf",
  /** 表格格式 */
  XLS = "xls",
  XLSX = "xlsx",
  /** 演示文稿 */
  PPT = "ppt",
  PPTX = "pptx",
  /** 压缩包 */
  ZIP = "zip",
  "7Z" = "7z",
  RAR = "rar",
  /** 其它未知格式 */
  OTHER = "file",
}

/** 默认文件类型数组（示例，可以按需调整） */
const DEFAULT_FILE_TYPES: FileEnum[] = [
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

/** 扩展名 → FileEnum 的映射 */
const extensionEnumMap: Record<string, FileEnum> = Object.values(FileEnum).reduce(
  (map, fileEnum) => {
    // OTHER 不映射具体扩展名
    if (fileEnum === FileEnum.OTHER) return map;
    map[fileEnum] = fileEnum;
    return map;
  },
  {} as Record<string, FileEnum>
);

/** FileEnum → 通用文件类别 */
const enumCategoryMap: Record<FileEnum, string> = {
  // 文本
  [FileEnum.MD]: "markdown",
  [FileEnum.TXT]: "text",
  [FileEnum.OTHER]: "file",
  // 图片
  [FileEnum.JPG]: "image",
  [FileEnum.JPEG]: "image",
  [FileEnum.PNG]: "image",
  [FileEnum.GIF]: "image",
  [FileEnum.BMP]: "image",
  [FileEnum.SVG]: "image",
  [FileEnum.WEBP]: "image",
  // 视频
  [FileEnum.MP4]: "video",
  [FileEnum.MOV]: "video",
  [FileEnum.AVI]: "video",
  [FileEnum.WMV]: "video",
  [FileEnum.MKV]: "video",
  [FileEnum.MPEG]: "video",
  [FileEnum.FLV]: "video",
  [FileEnum.WEBM]: "video",
  // 音频
  [FileEnum.MP3]: "audio",
  [FileEnum.WAV]: "audio",
  // 文档
  [FileEnum.PDF]: "pdf",
  [FileEnum.DOC]: "word",
  [FileEnum.DOCX]: "word",
  [FileEnum.ODT]: "word",
  [FileEnum.RTF]: "word",
  // 表格
  [FileEnum.XLS]: "excel",
  [FileEnum.XLSX]: "excel",
  // 演示文稿
  [FileEnum.PPT]: "powerpoint",
  [FileEnum.PPTX]: "powerpoint",

  [FileEnum.ZIP]: "zip",
  [FileEnum["7Z"]]: "zip",
  [FileEnum.RAR]: "zip"
};

/**
 * 从文件名中提取扩展名（小写，不含点），没有则返回空字符串
 */
function getFileExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  if (idx === -1 || idx === fileName.length - 1) return "";
  return fileName.slice(idx + 1).toLowerCase();
}

/**
 * 根据文件名返回对应的 FileEnum
 * @param fileName 文件名或 URL（只取最后一个“.”后面的部分）
 * @returns FileEnum 枚举，未匹配到时返回 FileEnum.OTHER
 */
function getEnumByExtension(fileName: string): FileEnum {
  const ext = getFileExtension(fileName);
  return extensionEnumMap[ext] ?? FileEnum.OTHER;
}

/**
 * 根据文件名返回通用的文件类别字符串，如 'image'、'video'、'markdown' 等
 * @param fileName 文件名
 */
function getFileType(fileName: string): string {
  const fileEnum = getEnumByExtension(fileName);
  return enumCategoryMap[fileEnum] ?? enumCategoryMap[FileEnum.OTHER];
}


// 获取文件图标
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

const fileIcon = (extension: string) => {
  return (fileIconMap as any)[extension] || fileIconMap.default;
};


export {
  uploadFile,
  downloadFile,
  openFileDialog,
  saveFileDialog,
  getFileType,
  getEnumByExtension,
  fileIcon,
  FileEnum,
  DEFAULT_FILE_TYPES
};


