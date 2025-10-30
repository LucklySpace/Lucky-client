import { exists } from "@tauri-apps/plugin-fs";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { downloadFile as download, getEnumByExtension, getFileType, saveFileDialog } from "@/utils/FileUpload";
import { ShowPreviewFileWindow } from "@/windows/preview";
import ObjectUtils from "@/utils/ObjectUtils";
import { useSettingStore } from "@/store/modules/setting";
import { downloadDir, resolve } from "@tauri-apps/api/path";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { ElMessage } from "element-plus";
import { useLogger } from "./useLogger";

/**
 * 文件气泡 功能
 * @returns
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
      await download(path, localPath);

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
      await download(path, localPath);

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
