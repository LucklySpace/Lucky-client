import { download as tauriDownload, upload as tauriUpload } from "@tauri-apps/plugin-upload";
import { ProgressPayload, useProgressStore } from "@/store/modules/progress";

export class FileTransfer {
  static async uploadFile(url: string, filePath: string, headers?: Record<string, string>) {
    const store = useProgressStore();
    store.startUpload();

    try {
      const result = await tauriUpload(
        url,
        filePath,
        (progress: ProgressPayload) => store.updateProgress(progress),
        headers ? new Map(Object.entries(headers)) : undefined
      );
      store.endUpload();
      return result;
    } catch (err) {
      store.endUpload();
      console.error("[UPLOAD ERROR]", err);
      throw err;
    }
  }

  static async downloadFile(url: string, filePath: string, headers?: Record<string, string>, body?: string) {
    const store = useProgressStore();
    store.startDownload();

    try {
      await tauriDownload(
        url,
        filePath,
        (progress: ProgressPayload) => store.updateProgress(progress),
        headers ? new Map(Object.entries(headers)) : undefined,
        body
      );
      store.endDownload();
    } catch (err) {
      store.endDownload();
      console.error("[DOWNLOAD ERROR]", err);
      throw err;
    }
  }
}
