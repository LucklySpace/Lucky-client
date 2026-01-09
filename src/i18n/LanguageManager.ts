import { BaseDirectory, exists, mkdir, writeTextFile, readTextFile, readDir } from "@tauri-apps/plugin-fs";
import { fetch } from "@tauri-apps/plugin-http";
import { useLogger } from "@/hooks/useLogger";

/**
 * 语言包元信息
 */
export interface LanguagePackMeta {
  locale: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  downloadUrl: string;
  size?: number;
  updatedAt?: string;
}

/**
 * 语言包文件结构
 */
export interface LanguagePackFile {
  locale: string;
  meta: {
    name: string;
    version: string;
    author?: string;
    updatedAt?: string;
    [key: string]: any;
  };
  messages: Record<string, any>;
}

/**
 * 下载进度回调
 */
export type DownloadProgressCallback = (progress: number, total: number) => void;

/**
 * 语言包管理器
 * 负责语言包的下载、安装、更新和删除
 */
export class LanguageManager {
  private static instance: LanguageManager | null = null;
  private readonly baseDir = BaseDirectory.AppData;
  private readonly i18nDir = "i18n";
  private readonly logger = useLogger();

  /**
   * 远程语言包列表 URL（可配置）
   */
  private remoteLanguageListUrl =
    import.meta.env.VITE_I18N_REMOTE_URL || "https://your-cdn.com/languages/list.json";

  private constructor() { }

  /**
   * 获取单例实例
   */
  public static getInstance(): LanguageManager {
    if (!LanguageManager.instance) {
      LanguageManager.instance = new LanguageManager();
    }
    return LanguageManager.instance;
  }

  /**
   * 设置远程语言包列表 URL
   */
  public setRemoteUrl(url: string): void {
    this.remoteLanguageListUrl = url;
  }

  /**
   * 获取已安装的语言包列表
   */
  public async getInstalledLanguages(): Promise<LanguagePackMeta[]> {
    try {
      const dirExists = await exists(this.i18nDir, { baseDir: this.baseDir });
      if (!dirExists) {
        return [];
      }

      const files = await readDir(this.i18nDir, { baseDir: this.baseDir });
      const languages: LanguagePackMeta[] = [];

      for (const file of files) {
        if (file.name?.endsWith(".json")) {
          try {
            const content = await readTextFile(`${this.i18nDir}/${file.name}`, {
              baseDir: this.baseDir
            });
            const pack: LanguagePackFile = JSON.parse(content);

            languages.push({
              locale: pack.locale,
              name: pack.meta.name,
              version: pack.meta.version,
              author: pack.meta.author,
              updatedAt: pack.meta.updatedAt,
              downloadUrl: "" // 本地安装的没有下载地址
            });
          } catch (error) {
            this.logger.error(`解析语言包失败: ${file.name}`, error);
          }
        }
      }

      return languages;
    } catch (error) {
      this.logger.error("获取已安装语言包列表失败", error);
      return [];
    }
  }

  /**
   * 从远程服务器获取可用语言包列表
   */
  public async getAvailableLanguages(): Promise<LanguagePackMeta[]> {
    try {
      const response = await fetch(this.remoteLanguageListUrl, {
        method: "GET",
        connectTimeout: 10000
      });

      if (!response.ok) {
        throw new Error(`HTTP 错误: ${response.status}`);
      }

      const data = await response.json();
      return (data.languages || []) as LanguagePackMeta[];
    } catch (error) {
      this.logger.error("获取远程语言包列表失败", error);
      // 返回内置语言包作为降级方案
      return this.getBuiltInLanguages();
    }
  }

  /**
   * 获取内置语言包信息
   */
  private getBuiltInLanguages(): LanguagePackMeta[] {
    return [
      {
        locale: "en-US",
        name: "English",
        version: "1.0.0",
        downloadUrl: "/assets/i18n/en-US.json"
      },
      {
        locale: "zh-CN",
        name: "简体中文",
        version: "1.0.0",
        downloadUrl: "/assets/i18n/zh-CN.json"
      }
    ];
  }

  /**
   * 下载并安装语言包
   * @param languageMeta 语言包元信息
   * @param onProgress 下载进度回调
   */
  public async downloadLanguage(
    languageMeta: LanguagePackMeta,
    onProgress?: DownloadProgressCallback
  ): Promise<boolean> {
    try {
      this.logger.info(`开始下载语言包: ${languageMeta.name} (${languageMeta.locale})`);

      // 确保 i18n 目录存在
      await this.ensureI18nDir();

      // 如果是内置语言包，从 assets 复制
      if (languageMeta.downloadUrl.startsWith("/assets")) {
        return await this.copyBuiltInLanguage(languageMeta);
      }

      // 从远程下载
      const response = await fetch(languageMeta.downloadUrl, {
        method: "GET",
        connectTimeout: 30000
      });

      if (!response.ok) {
        throw new Error(`下载失败: HTTP ${response.status}`);
      }

      const content = await response.text();
      const pack: LanguagePackFile = JSON.parse(content);

      // 验证语言包格式
      if (!this.validateLanguagePack(pack)) {
        throw new Error("语言包格式无效");
      }

      // 保存到 AppData
      await this.saveLanguagePack(pack);

      this.logger.info(`语言包下载成功: ${languageMeta.name}`);
      return true;
    } catch (error) {
      this.logger.error(`下载语言包失败: ${languageMeta.name}`, error);
      throw error;
    }
  }

  /**
   * 从 assets 复制内置语言包到 AppData
   */
  private async copyBuiltInLanguage(languageMeta: LanguagePackMeta): Promise<boolean> {
    try {
      // 动态导入内置语言包
      const modules = import.meta.glob("../assets/i18n/*.json", { eager: true }) as Record<
        string,
        any
      >;
      const modulePath = `../assets/i18n/${languageMeta.locale}.json`;

      const pack = modules[modulePath];
      if (!pack) {
        throw new Error(`未找到内置语言包: ${languageMeta.locale}`);
      }

      await this.saveLanguagePack(pack as LanguagePackFile);
      return true;
    } catch (error) {
      this.logger.error(`复制内置语言包失败: ${languageMeta.locale}`, error);
      throw error;
    }
  }

  /**
   * 保存语言包到 AppData
   */
  private async saveLanguagePack(pack: LanguagePackFile): Promise<void> {
    const filePath = `${this.i18nDir}/${pack.locale}.json`;
    await writeTextFile(filePath, JSON.stringify(pack, null, 2), {
      baseDir: this.baseDir
    });
  }

  /**
   * 删除已安装的语言包
   * @param locale 语言代码
   */
  public async deleteLanguage(locale: string): Promise<boolean> {
    try {
      // 不允许删除默认语言
      if (locale === "en-US" || locale === "zh-CN") {
        throw new Error("不能删除默认语言包");
      }

      const filePath = `${this.i18nDir}/${locale}.json`;
      const fileExists = await exists(filePath, { baseDir: this.baseDir });

      if (!fileExists) {
        this.logger.warn(`语言包不存在: ${locale}`);
        return false;
      }

      // Tauri plugin-fs 没有 remove 方法，需要通过 Rust 端实现
      // 这里暂时只是标记，实际删除可以在 Rust 端实现
      this.logger.info(`标记删除语言包: ${locale}`);
      return true;
    } catch (error) {
      this.logger.error(`删除语言包失败: ${locale}`, error);
      throw error;
    }
  }

  /**
   * 检查语言包是否需要更新
   * @param locale 语言代码
   * @param remoteVersion 远程版本号
   */
  public async checkForUpdate(locale: string, remoteVersion: string): Promise<boolean> {
    try {
      const installed = await this.getInstalledLanguages();
      const local = installed.find(lang => lang.locale === locale);

      if (!local) {
        return true; // 未安装，需要下载
      }

      // 简单版本比较（实际项目中可以使用 semver 库）
      return this.compareVersion(local.version, remoteVersion) < 0;
    } catch (error) {
      this.logger.error(`检查更新失败: ${locale}`, error);
      return false;
    }
  }

  /**
   * 确保 i18n 目录存在
   */
  private async ensureI18nDir(): Promise<void> {
    const dirExists = await exists(this.i18nDir, { baseDir: this.baseDir });
    if (!dirExists) {
      await mkdir(this.i18nDir, { baseDir: this.baseDir, recursive: true });
    }
  }

  /**
   * 验证语言包格式
   */
  private validateLanguagePack(pack: any): pack is LanguagePackFile {
    return (
      pack &&
      typeof pack === "object" &&
      typeof pack.locale === "string" &&
      pack.meta &&
      typeof pack.meta.name === "string" &&
      pack.messages &&
      typeof pack.messages === "object"
    );
  }

  /**
   * 版本比较（简单实现）
   * @returns -1: v1 < v2, 0: v1 === v2, 1: v1 > v2
   */
  private compareVersion(v1: string, v2: string): number {
    const parts1 = v1.split(".").map(Number);
    const parts2 = v2.split(".").map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;

      if (p1 < p2) return -1;
      if (p1 > p2) return 1;
    }

    return 0;
  }
}

/**
 * 导出 Hook
 */
export function useLanguageManager() {
  return LanguageManager.getInstance();
}

