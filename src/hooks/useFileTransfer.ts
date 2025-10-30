import { ref } from "vue";
import { upload } from "@tauri-apps/plugin-upload";
import { stat } from "@tauri-apps/plugin-fs";
import { Channel, invoke } from "@tauri-apps/api/core";


interface ProgressPayload {
  progress: number;
  progressTotal: number;
  total: number;
  transferSpeed: number; // 每秒字节数
}

type ProgressHandler = (progress: ProgressPayload) => void;

// 支持断点续传
async function download(url: string, filePath: string, progressHandler?: ProgressHandler, headers?: Map<string, string>, body?: string): Promise<void> {
  const ids = new Uint32Array(1);
  window.crypto.getRandomValues(ids);
  const id = ids[0];
  const onProgress: any = new Channel();
  if (progressHandler) {
    onProgress.onmessage = progressHandler;
  }
  await invoke("plugin:upload|download", {
    id,
    url,
    filePath,
    headers: headers ?? {},
    onProgress,
    body
  });
}

/**
 * 格式化字节为可读单位
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(2)} ${units[i]}`;
}

/**
 * 格式化速度为 MB/s 等
 */
function formatSpeed(bytesPerSec: number): string {
  return `${(bytesPerSec / 1024 / 1024).toFixed(2)} MB/s`;
}

/**
 * 文件传输 Hook（上传 + 下载），支持断点续传
 */
export function useFileTransfer() {
  const isDownloading = ref(false);
  const isUploading = ref(false);
  const progress = ref(0);
  const progressText = ref("");
  const speedText = ref("");
  const duration = ref(0);

  let startTime = 0;

  /**
   * 下载文件（支持断点续传）
   */
  async function startDownload(
    url: string,
    savePath: string,
    headers?: Map<string, string>
  ) {
    isDownloading.value = true;
    progress.value = 0;
    progressText.value = "0 B / 0 B";
    speedText.value = "0 MB/s";
    duration.value = 0;
    startTime = Date.now();

    try {
      // 检查本地是否已有文件，用于断点续传
      let resumeOffset = 0;
      try {
        const fileInfo = await stat(savePath);
        resumeOffset = fileInfo.size ?? 0;
        console.log(`已存在文件大小：${resumeOffset}`);
      } catch (err) {
        console.log("错误", err);

        // 文件不存在时忽略
      }

      const customHeaders = headers || new Map<string, string>();
      if (resumeOffset > 0) {
        // 添加 Range 头部实现断点续传
        customHeaders.set("Range", `bytes=${resumeOffset}-`);
      }

      await download(
        url,
        savePath,
        (payload: ProgressPayload) => {
          const total = resumeOffset + payload.total;
          const loaded = resumeOffset + payload.progressTotal;

          // 百分比
          progress.value = parseFloat(((loaded / total) * 100).toFixed(2));

          // 进度文本
          progressText.value = `${formatBytes(loaded)} / ${formatBytes(total)}`;

          // 速度文本
          speedText.value = formatSpeed(payload.transferSpeed);

          // 耗时
          duration.value = parseFloat(((Date.now() - startTime) / 1000).toFixed(1));
        },
        customHeaders
      );

      progress.value = 100;
      progressText.value = "下载完成！";
    } catch (err: any) {
      console.error("下载失败:", err);
      progressText.value = `下载失败: ${err.message || err}`;
    } finally {
      isDownloading.value = false;
    }
  }

  /**
   * 上传文件
   */
  async function startUpload(
    url: string,
    filePath: string,
    headers?: Map<string, string>
  ) {
    isUploading.value = true;
    progress.value = 0;
    progressText.value = "0 B / 0 B";
    speedText.value = "0 MB/s";
    duration.value = 0;
    startTime = Date.now();

    try {
      await upload(
        url,
        filePath,
        (payload: ProgressPayload) => {
          const pct = (payload.progressTotal / payload.total) * 100;
          progress.value = parseFloat(pct.toFixed(2));
          progressText.value = `${formatBytes(payload.progressTotal)} / ${formatBytes(payload.total)}`;
          speedText.value = formatSpeed(payload.transferSpeed);
          duration.value = parseFloat(((Date.now() - startTime) / 1000).toFixed(1));
        },
        headers
      );

      progress.value = 100;
      progressText.value = "上传完成！";
    } catch (err: any) {
      console.error("上传失败:", err);
      progressText.value = `上传失败: ${err.message || err}`;
    } finally {
      isUploading.value = false;
    }
  }

  return {
    // 状态
    isDownloading,
    isUploading,
    progress,
    progressText,
    speedText,
    duration,

    // 方法
    startDownload,
    startUpload
  };
}


// interface ProgressPayload {
//   progress: number;
//   progressTotal: number;
//   total: number;
//   transferSpeed: number;
// }

// export function useFileTransfer() {
//   const isUploading = ref(false);
//   const isDownloading = ref(false);
//   const currentProgress = ref<ProgressPayload>({
//     progress: 0,
//     progressTotal: 1,
//     total: 0,
//     transferSpeed: 0,
//   });

//   // 用于计算速度
//   let lastProgress = 0;
//   let lastTimestamp = Date.now();

//   const progressPercent = computed(() => {
//     const { progress, progressTotal } = currentProgress.value;
//     return Math.floor((progress / progressTotal) * 100);
//   });

//   function handleProgressUpdate(newProgress: Omit<ProgressPayload, 'transferSpeed'>) {
//     const now = Date.now();
//     const deltaTime = (now - lastTimestamp) / 1000; // 秒
//     const deltaBytes = newProgress.progress - lastProgress;

//     const speed = deltaTime > 0 ? deltaBytes / deltaTime : 0;

//     currentProgress.value = {
//       ...newProgress,
//       transferSpeed: speed,
//     };

//     lastProgress = newProgress.progress;
//     lastTimestamp = now;
//   }

//   async function uploadFile(
//     url: string,
//     filePath: string,
//     headers?: Map<string, string>
//   ): Promise<string | null> {
//     isUploading.value = true;
//     resetProgress();

//     try {
//       const result = await upload(
//         url,
//         filePath,
//         (progress) => handleProgressUpdate(progress),
//         headers
//       );
//       return result;
//     } catch (err) {
//       console.error('Upload failed:', err);
//       return null;
//     } finally {
//       isUploading.value = false;
//     }
//   }

//   async function downloadFile(
//     url: string,
//     savePath: string,
//     headers?: Map<string, string>,
//     body?: string
//   ): Promise<boolean> {
//     isDownloading.value = true;
//     resetProgress();

//     try {
//       await download(
//         url,
//         savePath,
//         (progress) => handleProgressUpdate(progress),
//         headers,
//         body
//       );
//       return true;
//     } catch (err) {
//       console.error('Download failed:', err);
//       return false;
//     } finally {
//       isDownloading.value = false;
//     }
//   }

//   function resetProgress() {
//     currentProgress.value = {
//       progress: 0,
//       progressTotal: 1,
//       total: 0,
//       transferSpeed: 0,
//     };
//     lastProgress = 0;
//     lastTimestamp = Date.now();
//   }

//   return {
//     isUploading,
//     isDownloading,
//     currentProgress,
//     progressPercent,
//     uploadFile,
//     downloadFile,
//   };
// }


// import { download, upload } from '@tauri-apps/plugin-upload';
// import { ref, computed, onUnmounted } from 'vue';

// // 定义传输状态类型
// type TransferStatus = 'idle' | 'uploading' | 'downloading' | 'success' | 'error';

// // 定义进度信息结构（与 ProgressPayload 一致）
// export interface TransferProgress {
//     progress: number;       // 已传输字节数
//     progressTotal: number;  // 当前文件总字节数
//     total: number;          // 整个传输任务总字节数（多文件时有用）
//     transferSpeed: number;  // 传输速度（字节/秒）
// }

// // 定义Hook的配置选项
// interface UseFileTransferOptions {
//     autoReset?: boolean;    // 传输完成后是否自动重置状态
//     resetTimeout?: number;  // 自动重置前的延迟时间（毫秒）
// }

// /**
//  * Tauri 文件传输 Hook
//  * 提供统一的上传/下载接口，支持：
//  * - 进度监控
//  * - 多传输状态管理
//  * - 错误处理
//  * - 自动重置状态
//  * - 取消传输功能
//  */
// export function useFileTransfer(options: UseFileTransferOptions = {}) {
//     // 合并默认选项
//     const { autoReset = true, resetTimeout = 3000 } = options;

//     // 传输状态
//     const status = ref<TransferStatus>('idle');

//     // 进度信息
//     const progress = ref<TransferProgress>({
//         progress: 0,
//         progressTotal: 0,
//         total: 0,
//         transferSpeed: 0
//     });

//     // 错误信息
//     const error = ref<string | null>(null);

//     // 取消标志
//     const cancelFlag = ref(false);

//     // 计算属性：传输进度百分比 (0-100)
//     const progressPercent = computed(() => {
//         if (progress.value.progressTotal === 0) return 0;
//         return (progress.value.progressTotal / progress.value.total) * 100;
//     });

//     // 计算属性：是否正在传输中
//     const isTransferring = computed(() =>
//         status.value === 'uploading' || status.value === 'downloading'
//     );

//     /**
//      * 重置传输状态
//      */
//     const reset = () => {
//         status.value = 'idle';
//         error.value = null;
//         cancelFlag.value = false;
//         progress.value = {
//             progress: 0,
//             progressTotal: 0,
//             total: 0,
//             transferSpeed: 0
//         };
//     };

//     /**
//      * 更新进度处理器
//      */
//     const handleProgress = (payload: TransferProgress) => {
//         // 如果已取消则忽略进度更新
//         if (cancelFlag.value) return;
//         progress.value = {
//             ...payload,
//             // 确保进度不会超过总量
//         };
//         console.log("下载进度:", progress.value)
//     };

//     /**
//      * 处理传输成功
//      */
//     const handleSuccess = () => {
//         status.value = 'success';

//         // 自动重置逻辑
//         if (autoReset) {
//             setTimeout(reset, resetTimeout);
//         }
//     };

//     /**
//      * 处理传输错误
//      * @param err - 错误对象
//      */
//     const handleError = (err: unknown) => {
//         // 如果是取消操作，不标记为错误状态
//         if (cancelFlag.value) {
//             reset();
//             return;
//         }

//         status.value = 'error';
//         error.value = err instanceof Error
//             ? err.message
//             : 'Unknown transfer error';

//         // 自动重置逻辑
//         if (autoReset) {
//             setTimeout(reset, resetTimeout);
//         }
//     };

//     /**
//      * 取消当前传输
//      */
//     const cancel = () => {
//         if (isTransferring.value) {
//             cancelFlag.value = true;
//             status.value = 'idle';
//             // 注意：实际网络请求无法取消，但会停止状态更新
//         }
//     };

//     /**
//      * 文件上传
//      * @param url - 目标API地址
//      * @param filePath - 本地文件路径
//      * @param headers - 自定义请求头
//      * @returns 服务器响应数据
//      */
//     const uploadFile = async (
//         url: string,
//         filePath: string,
//         headers?: Map<string, string>
//     ): Promise<string> => {
//         try {
//             // 重置状态并标记为上传中
//             reset();
//             status.value = 'uploading';

//             // 执行上传操作
//             const result = await upload(
//                 url,
//                 filePath,
//                 handleProgress,
//                 headers
//             );

//             handleSuccess();
//             return result;
//         } catch (err) {
//             handleError(err);
//             throw err; // 重新抛出错误供调用者处理
//         }
//     };

//     /**
//      * 文件下载
//      * @param url - 文件资源地址
//      * @param filePath - 本地保存路径
//      * @param headers - 自定义请求头
//      * @param body - 请求体数据（如需要）
//      */
//     const downloadFile = async (
//         url: string,
//         filePath: string,
//         headers?: Map<string, string>,
//         body?: string
//     ): Promise<void> => {
//         try {
//             // 重置状态并标记为下载中
//             reset();
//             status.value = 'downloading';

//             // 执行下载操作
//             await download(
//                 url,
//                 filePath,
//                 handleProgress,
//                 headers,
//                 body
//             );

//             handleSuccess();
//         } catch (err) {
//             handleError(err);
//             throw err; // 重新抛出错误供调用者处理
//         }
//     };

//     // 组件卸载时自动重置
//     onUnmounted(reset);

//     return {
//         // 状态属性
//         status,
//         progress,
//         progressPercent,
//         error,
//         isTransferring,

//         // 操作方法
//         uploadFile,
//         downloadFile,
//         cancel,
//         reset
//     };
// }


// // import { useState } from 'react';
// // import { download } from '@tauri-apps/plugin-upload';
// // import './Home.css'; export default
// //     function Home() {
// //     const [progress, setProgress] = useState(0);
// //     const [progressText, setProgressText] = useState('0 / 0 bytes');
// //     const [isDownloading, setIsDownloading] = useState(false);
// //     const clicked = async () => {
// //         setIsDownloading(true);
// //         setProgress(0); setProgressText('0 / 0 bytes');
// //         const url = 'https://github.com/yaklang/yakit/releases/download/v1.4.1-0530/Yakit-1.4.1-0530-windows-amd64.exe';
// //         const filePath = 'C:\\Users\\26644\\Downloads\\yakit.exe';
// //         const headers = new Map([['User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'],]);
// //         try {
// //             await download(url, filePath, ({ progressTotal, total }) => {
// //                 let percentage = (progressTotal / total) * 100

// //                 setProgress(percentage);
// //                 setProgressText(`${progressTotal} / ${total} bytes`);
// //             }, headers);
// //             setProgress(100);
// //             setProgressText('下载完成！');
// //         } catch (error: { message?: string } | any) {
// //             console.error('下载失败:', JSON.stringify(error, null, 2));
// //             setProgressText(`下载失败: ${error.message || error}`);
// //         } finally {
// //             setIsDownloading(false);
// //         }
// //     };
// //     return (文件下载 { progressText } );
// // }