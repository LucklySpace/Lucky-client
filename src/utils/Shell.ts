import { Command } from "@tauri-apps/plugin-shell";

/**
 * Shell 命令工具类
 * 封装 Tauri Shell 插件功能，提供跨平台 Shell 命令执行
 */
class Shell {
  /**
   * 执行 Shell 命令
   * @param command 要执行的命令字符串
   * @param args 命令参数数组
   * @returns Promise<void>
   * @throws 执行失败时抛出错误
   */
  async executeCommand(command: string, args: string[] = []): Promise<void> {
    try {
      await Command.create(command, args).execute();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "未知错误";
      console.error(`执行命令失败: ${command}`, error);
      throw new Error(`执行命令 '${command}' 失败。错误: ${errorMsg}`);
    }
  }

  /**
   * 打开文件或目录（根据平台自动选择命令）
   * @param path 文件或目录路径
   * @returns Promise<void>
   * @throws 不支持的平台或执行失败时抛出错误
   */
  async openPath(path: string): Promise<void> {
    try {
      const platform = this.detectPlatform();
      const commandMap: Record<string, string> = {
        windows: "win_open",
        macos: "mac_open",
        linux: "linux_open"
      };

      const command = commandMap[platform];
      if (!command) {
        throw new Error(`不支持的平台: ${platform}`);
      }

      await Command.create(command, [path]).execute();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "未知错误";
      console.error(`打开路径失败: ${path}`, error);
      throw new Error(`打开路径失败。错误: ${errorMsg}`);
    }
  }

  /**
   * 检测当前操作系统平台
   * @returns 平台标识字符串 ("windows" | "macos" | "linux")
   */
  private detectPlatform(): string {
    const platform = navigator.platform.toLowerCase();
    
    if (platform.includes("win")) return "windows";
    if (platform.includes("mac")) return "macos";
    if (platform.includes("linux")) return "linux";
    
    // 默认返回 linux（兼容未知平台）
    return "linux";
  }
}

export default Shell;
