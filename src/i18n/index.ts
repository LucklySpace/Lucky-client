import { useLogger } from "@/hooks/useLogger";
import { useSettingStore } from "@/store/modules/setting";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { BaseDirectory, exists, mkdir, readDir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { onBeforeUnmount, Ref, ref, shallowRef } from "vue";
import { createI18n, I18n } from "vue-i18n";

/** i18n 文件结构定义 */
interface I18nFile {
  locale: string;
  meta: {
    name: string;
    version?: string;
    author?: string;
    updatedAt?: string;
    [key: string]: any;
  };
  messages: Record<string, any>;
}

interface LocaleMeta {
  locale: string;
  name: string;
}

/** AppData 目录 */
const baseDir = BaseDirectory.AppData;

/** 默认 i18n 配置 */
const i18nOptions = {
  legacy: false,
  locale: "en-US", // 默认语言
  fallbackLocale: "en-US",
  messages: {} as Record<string, any>
};

/** 全局 vue-i18n 实例（单例） */
const i18n: I18n = createI18n(i18nOptions);

/** 导出全局 i18n 实例，用于非组件环境（如 store、工具函数等） */
export { useI18n, i18n as globalI18n };

/**
 * I18n 管理器（单例）
 * - 管理全局 i18n 状态，响应式更新 locale、meta 和语言选项
 * - 支持从 AppData 或 assets 加载语言文件，保存到 AppData
 * - 跨窗口语言同步（Tauri 事件）
 * - 优化：不使用缓存，每次加载从文件系统读取，适合多语言场景
 */
class I18nManager {
  private static instance: I18nManager | null = null;

  // 响应式状态
  public i18n: I18n = i18n;
  public locale: Ref<string> = shallowRef(i18nOptions.locale);
  public meta: Ref<I18nFile["meta"] | null> = ref(null);
  public languageOptions: Ref<LocaleMeta[]> = ref([]);

  private settingStore = useSettingStore();
  private initialized = false;
  private winLabel = getCurrentWebviewWindow().label;
  private logger = useLogger();

  private constructor() {
    // 私有构造，确保单例
  }

  /** 获取单例实例 */
  public static getInstance(): I18nManager {
    if (!I18nManager.instance) {
      I18nManager.instance = new I18nManager();
    }
    return I18nManager.instance;
  }

  /**
   * 加载指定语言并应用到 vue-i18n
   * @param lang 目标语言
   */
  public async loadLocale(lang: string) {
    try {
      // 优先从 AppData 加载指定语言
      let file: I18nFile | undefined;
      const appDataFiles = await this.loadI18nFiles("appdata", lang);
      file = appDataFiles[0];

      // 如果 AppData 中没有，fallback 到 assets
      if (!file) {
        const assetFiles = await this.loadI18nFiles("assets", lang);
        file = assetFiles[0];
      }

      if (!file) {
        this.logger.warn(`语言包未找到: ${lang}`);
        if (lang !== i18nOptions.fallbackLocale) {
          await this.loadLocale(i18nOptions.fallbackLocale);
        }
        return;
      }

      // 更新 vue-i18n
      this.i18n.global.setLocaleMessage(lang, file.messages);
      try {
        const maybeRef = (this.i18n.global as any).locale;
        if (maybeRef && "value" in maybeRef) {
          maybeRef.value = lang;
        } else {
          (this.i18n.global as any).locale = lang;
        }
      } catch {
        this.locale.value = lang;
      }

      this.locale.value = lang;
      this.meta.value = file.meta ?? null;
      this.settingStore.language = lang;

      this.logger.info(`成功加载语言: ${lang}`, file.meta);
    } catch (error) {
      this.logger.error(`加载语言失败: ${lang}`, error);
      if (lang !== i18nOptions.fallbackLocale) {
        await this.loadLocale(i18nOptions.fallbackLocale);
      }
    }
  }

  /**
   * 保存语言文件到 AppData（仅当不存在时写入）
   * @param lang 语言代码
   * @param file I18nFile 对象
   */
  /**
   * 保存语言文件到 AppData（仅当不存在时写入）
   * @param lang 语言代码
   * @param file I18nFile 对象
   */
  public async saveLocaleFile(lang: string, file: I18nFile) {
    const filePath = `i18n/${lang}.json`;
    try {
      const fileExists = await exists(filePath, { baseDir });
      if (!fileExists) {
        const dirExists = await exists("i18n", { baseDir });
        if (!dirExists) {
          await mkdir("i18n", { baseDir, recursive: true });
        }
        await writeTextFile(filePath, JSON.stringify(file, null, 2), { baseDir });
        this.logger.info(`语言文件已保存: ${filePath}`);
      } else {
        this.logger.debug(`语言文件已存在，跳过保存: ${filePath}`);
      }
    } catch (error) {
      this.logger.error(`保存语言文件失败: ${lang}`, error);
    }
  }

  /**
   * 构建语言选项（优先 AppData，补充 assets）
   */
  public async loadLocaleOptions() {
    const files = await this.loadI18nFiles("appdata");
    const results = files.length > 0 ? files : await this.loadI18nFiles("assets");
    this.languageOptions.value = results.map(f => ({ locale: f.locale, name: f.meta?.name ?? f.locale }));
    if (this.settingStore.language && !this.languageOptions.value.some(x => x.locale === this.settingStore.language)) {
      this.languageOptions.value.unshift({ locale: this.settingStore.language, name: this.settingStore.language });
    }
  }

  /**
   * 切换语言并广播
   * @param lang 目标语言
   */
  /**
   * 切换语言并广播
   * @param lang 目标语言
   */
  public async setLocale(lang: string) {
    await this.loadLocale(lang);
    try {
      await emit("i18n:update", { label: this.winLabel, lang });
      this.logger.info(`语言切换成功: ${lang}`);
    } catch (error) {
      this.logger.warn("语言切换广播失败", error);
    }
  }

  /**
   * 监听语言切换事件（跨窗口同步）
   */
  public async listenI18n() {
    const unlisten = await listen("i18n:update", (event: any) => {
      const payload = event.payload as { label?: string; lang?: string };
      if (payload?.label !== this.winLabel && payload?.lang && payload.lang !== this.locale.value) {
        this.loadLocale(payload.lang);
      }
    });
    onBeforeUnmount(() => unlisten());
  }

  /**
   * 初始化 i18n（仅调用一次）
   * @param preferred 默认语言
   */
  public async initI18n(preferred: string = "en-US") {
    if (this.initialized) return;
    await this.loadLocaleOptions();
    const lang = this.settingStore.language || preferred || i18nOptions.locale;
    await this.loadLocale(lang);
    await this.listenI18n();
    this.initialized = true;
  }

  /**
   * 解析 i18n 文件（支持 JSON 字符串或模块对象）
   * @param raw 原始数据（string 或模块对象）
   * @param sourceLabel 来源标签（用于日志）
   * @returns 解析后的 I18nFile 或 undefined
   */
  /**
   * 解析 i18n 文件（支持 JSON 字符串或模块对象）
   * @param raw 原始数据（string 或模块对象）
   * @param sourceLabel 来源标签（用于日志）
   * @returns 解析后的 I18nFile 或 undefined
   */
  private parseI18nFile(raw: any, sourceLabel: string): I18nFile | undefined {
    if (!raw) return undefined;

    let parsed: any = raw;
    if (typeof raw === "string") {
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        this.logger.warn(`JSON 解析失败 (${sourceLabel})`, error);
        return undefined;
      }
    }

    if (parsed.locale && parsed.messages) {
      return parsed as I18nFile;
    }

    this.logger.warn(`无效的 i18n 文件结构 (${sourceLabel}), 缺少 locale 或 messages 字段`);
    return undefined;
  }

  /**
   * 加载 i18n 文件
   * @param source 来源：'appdata' 或 'assets'
   * @param lang 可选：指定语言（仅加载该语言）；不指定加载全部
   * @returns 解析后的 I18nFile 数组
   */
  private async loadI18nFiles(source: "appdata" | "assets", lang?: string): Promise<I18nFile[]> {
    const results: I18nFile[] = [];

    if (source === "appdata") {
      try {
        const files = await readDir("i18n", { baseDir }).catch(() => []);
        if (!files.length) return [];

        const tasks = files
          .filter(f => f.name?.endsWith(".json") && (!lang || f.name.replace(".json", "") === lang))
          .map(async f => {
            try {
              const raw = await readTextFile(`i18n/${f.name}`, { baseDir });
              const parsed = this.parseI18nFile(raw, `appdata/${f.name}`);
              if (parsed) results.push(parsed);
            } catch (error) {
              this.logger.warn(`读取/解析 AppData 语言文件失败: ${f.name}`, error);
            }
          });
        await Promise.all(tasks); // 并行加载
      } catch (error) {
        this.logger.warn("读取 AppData i18n 目录失败", error);
      }
    } else if (source === "assets") {
      try {
        const modules = import.meta.glob("../assets/i18n/*.json", { eager: true }) as Record<string, any>;
        for (const [key, mod] of Object.entries(modules)) {
          const fileLang = key.split("/").pop()?.replace(".json", "");
          if (lang && fileLang !== lang) continue;
          const parsed = this.parseI18nFile(mod, `asset:${key}`);
          if (parsed) results.push(parsed);
        }
      } catch (error) {
        this.logger.warn("加载 assets i18n 文件失败", error);
      }
    }
    return results;
  }
}

/** 导出 hook，返回单例管理器的接口 */
function useI18n() {
  const mgr = I18nManager.getInstance();
  return {
    i18n: mgr.i18n,
    locale: mgr.locale,
    meta: mgr.meta,
    languageOptions: mgr.languageOptions,
    initI18n: mgr.initI18n.bind(mgr),
    loadLocale: mgr.loadLocale.bind(mgr),
    saveLocaleFile: mgr.saveLocaleFile.bind(mgr),
    loadLocaleOptions: mgr.loadLocaleOptions.bind(mgr),
    setLocale: mgr.setLocale.bind(mgr)
  };
}
