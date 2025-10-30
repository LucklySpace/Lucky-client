import { StoresEnum } from "@/constants";
import { tauriStorage } from "@/store/plugins/TauriStorage";
import { defineStore } from "pinia";

/**
 * 单个快捷键配置接口
 */
interface Shortcut {
  /** 唯一标识名称，用于在 Store 中查找 */
  name: string;
  /** 快捷键组合，例如 'Ctrl+S' */
  combination: string;
}

/**
 * 水印
 */
interface Watermark {
  /** 是否开启 */
  enable: boolean;
  /** 水印文本 */
  text: string;
}

/**
 * 应用更新
 */
interface Upadate {
  /** 是否开启自动更新 */
  enable: boolean;
}

/**
 * 文件下载
 */
interface Flie {
  /** 是否开启200m自动下载 */
  enable: boolean;
  readonly: boolean;
  /** 下载地址 */
  path: string;
}

interface State {
  // 语言
  language: string;
  // 主题
  theme: "light" | "dark" | "auto";
  // 快捷键
  shortcuts: Shortcut[];
  // 通知声音
  notification: {
    message: boolean;
    media: boolean;
  };
  // 水印
  watermark: Watermark;
  // 文件
  file: Flie;
  // 更新
  update: Upadate;
  // 主窗口关闭
  close: "ask" | "minimize" | "exit";
}

export const useSettingStore = defineStore(StoresEnum.SETTING, {
  state: (): State => ({
    language: "en-US",
    theme: "auto",
    shortcuts: [],
    notification: {
      message: true,
      media: true
    },
    watermark: {
      enable: false,
      text: ""
    },
    file: {
      enable: false,
      readonly: false,
      path: ""
    },
    update: {
      enable: false
    },
    close: "ask"
  }),
  getters: {
    // 判断是否暗黑模式
    getIsDark: state => (): boolean => state.theme == "dark",
    // 根据名称获取快捷键
    getShortcut:
      state =>
        (name: string): string | undefined =>
          state.shortcuts.find(s => s.name === name)?.combination
  },
  actions: {},
  persist: [
    {
      key: `${StoresEnum.SETTING}_store`,
      paths: ["language", "theme", "notification", "shortcuts", "file", "close"],
      storage: tauriStorage
    }
  ]
});
