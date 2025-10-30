import { defineStore } from "pinia";

export interface ProgressPayload {
  progress: number;
  progressTotal: number;
  total: number;
  transferSpeed: number;
}

export const useProgressStore = defineStore("progress", {
  state: () => ({
    uploading: false,
    downloading: false,
    progress: <ProgressPayload>{
      progress: 0,
      progressTotal: 100,
      total: 0,
      transferSpeed: 0
    }
  }),
  actions: {
    startUpload() {
      this.uploading = true;
      this.reset();
    },
    endUpload() {
      this.uploading = false;
    },
    startDownload() {
      this.downloading = true;
      this.reset();
    },
    endDownload() {
      this.downloading = false;
    },
    updateProgress(payload: ProgressPayload) {
      this.progress = { ...payload };
    },
    reset() {
      this.progress = {
        progress: 0,
        progressTotal: 100,
        total: 0,
        transferSpeed: 0
      };
    }
  }
});
