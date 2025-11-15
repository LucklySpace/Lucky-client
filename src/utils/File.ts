import { open } from "@tauri-apps/plugin-dialog";
import {
  BaseDirectory,
  create,
  DirEntry,
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  rename,
  writeFile
} from "@tauri-apps/plugin-fs";
import { appCacheDir, join } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * 文件操作工具类
 */
export default class FileUtils {
  /**
   * 创建文件
   * @param path 文件路径
   * @param baseDir 基础目录，默认为 App 目录
   * @returns 文件内容
   */
  static async create(path: string, baseDir: BaseDirectory = BaseDirectory.AppData): Promise<void> {
    try {
      await create(path, { baseDir });
    } catch (error) {
      console.error(`创建文件失败: ${path}`, error);
      throw error;
    }
  }

  /**
   * 读取文本文件内容
   * @param path 文件路径
   * @param baseDir 基础目录，默认为 App 目录
   * @returns 文件内容
   */
  static async readFile(path: string, baseDir: BaseDirectory = BaseDirectory.AppData): Promise<string> {
    try {
      return await readTextFile(path, { baseDir });
    } catch (error) {
      console.error(`读取文件失败: ${path}`, error);
      throw error;
    }
  }

  /**
   * 写入文件
   * @param path 文件路径
   * @param content 文件内容
   * @param baseDir 基础目录，默认为 App 目录
   */
  static async writeFile(
    path: string,
    content: Uint8Array,
    baseDir: BaseDirectory = BaseDirectory.AppData
  ): Promise<void> {
    try {
      await writeFile(path, content, { baseDir });
    } catch (error) {
      console.error(`写入文件失败: ${path}`, error);
      throw error;
    }
  }

  /**
   * 检查文件或目录是否存在
   * @param path 路径
   * @param baseDir 基础目录，默认为 App 目录
   * @returns 是否存在
   */
  static async exists(path: string, baseDir: BaseDirectory = BaseDirectory.AppData): Promise<boolean> {
    try {
      return await exists(path, { baseDir });
    } catch (error) {
      console.error(`检查路径是否存在失败: ${path}`, error);
      throw error;
    }
  }

  /**
   * 创建目录
   * @param path 目录路径
   * @param recursive 是否递归创建，默认为 true
   * @param baseDir 基础目录，默认为 App 目录
   */
  static async createDirectory(
    path: string,
    recursive: boolean = true,
    baseDir: BaseDirectory = BaseDirectory.AppData
  ): Promise<void> {
    try {
      await mkdir(path, { recursive, baseDir: baseDir });
    } catch (error) {
      console.error(`创建目录失败: ${path}`, error);
      throw error;
    }
  }

  /**
   * 读取目录内容
   * @param path 目录路径
   * @param baseDir 基础目录，默认为 App 目录
   * @returns 目录条目列表
   */
  static async readDirectory(path: string, baseDir: BaseDirectory = BaseDirectory.AppData): Promise<DirEntry[]> {
    try {
      return await readDir(path, { baseDir: baseDir });
    } catch (error) {
      console.error(`读取目录失败: ${path}`, error);
      throw error;
    }
  }

  /**
   * 删除文件
   * @param path 文件路径
   * @param baseDir 基础目录，默认为 App 目录
   */
  static async delete(path: string, baseDir: BaseDirectory = BaseDirectory.AppData): Promise<void> {
    try {
      await remove(path, { baseDir: baseDir });
    } catch (error) {
      console.error(`删除文件失败: ${path}`, error);
      throw error;
    }
  }

  /**
   * 重命名文件或目录
   * @param oldPath 原路径
   * @param newPath 新路径
   * @param baseDir 基础目录，默认为 App 目录
   */
  static async rename(oldPath: string, newPath: string, baseDir: BaseDirectory = BaseDirectory.AppData): Promise<void> {
    try {
      await rename(oldPath, newPath, { oldPathBaseDir: baseDir });
    } catch (error) {
      console.error(`重命名失败: ${oldPath} -> ${newPath}`, error);
      throw error;
    }
  }

  /**
   * 获取文件扩展名
   * @param path 文件路径
   * @returns 扩展名（包含点号）
   */
  static getExtension(path: string): string {
    const match = path.match(/\.[^.]*$/);
    return match ? match[0] : "";
  }

  /**
   * 获取文件名（不含扩展名）
   * @param path 文件路径
   * @returns 文件名
   */
  static getFileName(path: string): string {
    const name = path.split("/").pop() || "";
    return name.replace(/\.[^.]*$/, "");
  }

  /**
   * 格式化文件大小
   *
   * @param {string|number} value 文件大小(字节)
   */
  static formatSize(value: any | null) {
    if (null == value || value == "") {
      return "0";
    }

    let unitArr = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    let index = 0;

    let srcsize: number = parseFloat(value);
    index = Math.floor(Math.log(srcsize) / Math.log(1024));

    let size: any = srcsize / Math.pow(1024, index);
    size = size.toFixed(2); //保留的小数位数
    return size + unitArr[index];
  }

  /**
   * 获取本地文件转src
   * https://xiaoshen.blog.csdn.net/article/details/143145713?fromshare=blogdetail&sharetype=blogdetail&sharerId=143145713&sharerefer=PC&sharesource=weixin_45357745&sharefrom=from_link
   * @param filePath
   * @returns
   */
  static async localFile2Src(path: string): Promise<string> {
    const appDataDirPath = await appCacheDir();
    const fullPath = await join(appDataDirPath, path);
    const timestamp = Date.now();
    return `${convertFileSrc(fullPath)}?t=${timestamp}`;
  }

  async openFileDialog() {
    return await open({
      multiple: true,
      filters: [
        {
          name: "Image",
          extensions: ["png", "jpeg"]
        }
      ]
    });
  }
}

// 使用示例:
/*
async function example() {
  // 读取文件
  const content = await FileUtils.readFile('config.json');
  
  // 写入文件
  await FileUtils.writeFile('data.txt', 'Hello World');
  
  // 检查文件是否存在
  const fileExists = await FileUtils.exists('test.txt');
  
  // 创建目录
  await FileUtils.createDirectory('images/thumbnails');
  
  // 读取目录内容
  const entries = await FileUtils.readDirectory('documents');
  
  // 删除文件
  await FileUtils.deleteFile('temp.txt');
  
  // 删除目录
  await FileUtils.deleteDirectory('old-files', true);
  
  // 重命名文件
  await FileUtils.rename('old.txt', 'new.txt');
}
*/
