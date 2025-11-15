import { info } from "@tauri-apps/plugin-log";

/**
 * 日志工具类，支持彩色控制台输出及写入插件日志（仅在开发模式下生效）。
 */
class Log {
  /** 定义可用的颜色样式 */
  private readonly colors: Record<string, string> = {
    primary: "#2d8cf0",
    success: "#19be6b",
    info: "#909399",
    warn: "#ff9900",
    error: "#f03f14",
    default: "#35495E"
  };

  /** 是否将日志写入插件日志系统（仅在开发模式下为真） */
  private write: boolean = false;

  constructor() {
    // 仅在开发模式且在浏览器环境中启用写入功能
    if (
      import.meta.env.MODE === "development" &&
      typeof window !== "undefined"
    ) {
      this.write = true;
    }
  }

  /**
   * 打印日志到控制台（并可写入插件日志）。
   * @param text - 日志内容，可以是任意类型
   * @param type - 日志类型，对应颜色（"primary" | "success" | "info" | "warn" | "error" | "default"）
   * @param background - 是否使用背景色样式
   */
  public async print(
    text: unknown,
    type: keyof typeof this.colors = "default",
    background = false
  ): Promise<void> {
    // 如果启用了写入，则将日志写入 Tauri 插件日志
    if (this.write) {
      await info(`[${type}] ${text}`);
    }

    // 根据日志类型获取颜色值
    const color = this.colors[type] || this.colors.default;
    // 生成对应的 CSS 样式
    const style = background
      ? `background: ${color}; padding: 2px; border-radius: 4px; color: #fff;`
      : `border: 1px solid ${color}; padding: 2px; border-radius: 4px; color: ${color};`;

    // 输出到浏览器控制台
    console.log(`%c ${String(text)} `, style);
  }

  /**
   * 打印带背景色的标题日志。
   * @param type - 背景颜色类型
   * @param title - 日志标题
   */
  public printBack(type: keyof typeof this.colors, title: unknown): void {
    // 不需写入插件日志，仅调用 print 方法
    this.print(title, type, true);
  }

  /**
   * 以分组形式美化打印复杂对象或数组。
   * @param type - 日志类型，对应颜色
   * @param title - 分组标题
   * @param data - 要打印的内容，可以是对象或数组或其他类型
   */
  public async pretty(
    type: keyof typeof this.colors = "primary",
    title: unknown,
    data: unknown
  ): Promise<void> {
    // 写入插件日志
    if (this.write) {
      await info(`[${title}] ${data}`);
    }

    const color = this.colors[type] || this.colors.default;

    if (typeof data === "object" && data !== null) {
      // 对象或数组时，使用 console.group 分组打印
      console.group(
        `%c ${String(title)}`,
        `background: ${color}; border: 1px solid ${color}; padding: 1px; border-radius: 4px; color: #fff;`
      );
      Array.isArray(data) ? console.table(data) : console.dir(data);
      console.groupEnd();
    } else {
      // 基本类型时，将标题与内容分段打印，先标题后内容
      console.log(
        `%c ${String(title)} %c ${String(data)} %c`,
        `background: ${color}; border: 1px solid ${color}; padding: 1px; border-radius: 4px 0 0 4px; color: #fff;`,
        `border: 1px solid ${color}; padding: 1px; border-radius: 0 4px 4px 0; color: ${color};`,
        "background: transparent"
      );
    }
  }

  /**
   * 快捷打印 "primary" 类型的分组日志。
   */
  public async prettyPrimary(
    title: unknown,
    ...data: unknown[]
  ): Promise<void> {
    for (const item of data) {
      await this.pretty("primary", title, item);
    }
  }

  /**
   * 快捷打印 "success" 类型的分组日志。
   */
  public async prettySuccess(
    title: unknown,
    ...data: unknown[]
  ): Promise<void> {
    for (const item of data) {
      await this.pretty("success", title, item);
    }
  }

  /**
   * 快捷打印 "warn" 类型的分组日志。
   */
  public async prettyWarn(title: unknown, ...data: unknown[]): Promise<void> {
    for (const item of data) {
      await this.pretty("warn", title, item);
    }
  }

  /**
   * 快捷打印 "error" 类型的分组日志。
   */
  public async prettyError(title: unknown, ...data: unknown[]): Promise<void> {
    for (const item of data) {
      await this.pretty("error", title, item);
    }
  }

  /**
   * 快捷打印 "info" 类型的分组日志。
   */
  public async prettyInfo(title: unknown, ...data: unknown[]): Promise<void> {
    for (const item of data) {
      await this.pretty("info", title, item);
    }
  }

  /**
   * 彩色化打印日志，用于区分提示和值内容。
   * @param hint - 提示文字
   * @param content - 具体内容
   * @param type - 日志类型（决定颜色）
   */
  public async colorLog(
    hint: unknown,
    content: unknown,
    type: "success" | "info" | "warn" | "error" | "trace" = "info"
  ): Promise<void> {
    // 定义直观提示颜色，与 this.colors 可重复使用或自定义
    const colorMap: Record<string, string> = {
      success: "#75c41a",
      info: "#52c41a",
      warn: "#faad14",
      error: "#f5222d",
      trace: "#66ccff"
    };
    const bgColor = colorMap[type] || this.colors.default;

    // 写入插件日志
    if (this.write) {
      await info(`[${hint}] ${content}`);
    }

    // 打印时，第一个 %c 应用背景色样式，第二个参数为内容
    const hintStyle = `
      vertical-align: middle;
      display: inline-block;
      background: ${bgColor};
      color: #fff;
      border-radius: 3px 0 0 3px;
      font-size: 14px;
      padding: 0 5px;
      line-height: 1.5;
    `;

    (console as any)[type](`%c${String(hint)}`, hintStyle, content);
  }
}

export default new Log();
