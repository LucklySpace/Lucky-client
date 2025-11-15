import { StoresEnum } from "@/constants";
import { tauriStorage } from "@/store/plugins/TauriStorage";
import { defineStore } from "pinia";
import { ref, computed } from "vue";

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

// 使用 setup 语法重构 Pinia store
export const useSettingStore = defineStore(StoresEnum.SETTING, () => {
  // 语言
  const language = ref<string>("en-US");
  // 主题
  const theme = ref<"light" | "dark" | "auto">("auto");
  // 快捷键
  const shortcuts = ref<Shortcut[]>([]);

  // 通知
  const notification = ref({
    message: true,
    media: true
  });

  // 水印
  const watermark = ref<Watermark>({
    enable: false,
    text: ""
  });

  // 文件下载
  const file = ref<Flie>({
    enable: false,
    readonly: false,
    path: ""
  });

  // 应用更新
  const update = ref<Upadate>({
    enable: false
  });

  // 关闭方式
  const close = ref<"ask" | "minimize" | "exit">("ask");

  // Getters
  /**
   * 判断是否暗黑模式
   */
  const getIsDark = computed((): boolean => theme.value === "dark");

  /**
   * 根据名称获取快捷键
   */
  const getShortcut = computed(() => (name: string): string | undefined =>
    shortcuts.value.find(s => s.name === name)?.combination
  );

  // 导出状态和方法
  return {
    // 状态
    language,
    theme,
    shortcuts,
    notification,
    watermark,
    file,
    update,
    close,

    // Getters
    getIsDark,
    getShortcut
  };
}, {
  persist: [
    {
      key: `${StoresEnum.SETTING}_store`,
      paths: ["language", "theme", "notification", "shortcuts", "file", "close"],
      storage: tauriStorage
    }
  ]
});