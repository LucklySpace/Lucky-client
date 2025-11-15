import { Command } from "@tauri-apps/plugin-shell";


class Shell {

  // Execute a shell command
  async executeCommand(command: string): Promise<any> {
    try {
      Command.create(command).execute();

    } catch (error: any) {
      throw new Error(`Failed to execute command '${command}'. Error: ${error.message}`);
    }
  }

  /**
   * @description 打开文件
   * @param {string} path - 文件路径
   * @returns {Promise<void>} 无返回值
   */
  async openPath(path: string): Promise<void> {
    const plat = navigator.platform;
    let command: string;
    if (plat === "windows") command = "win_open";
    else if (plat === "macos") command = "mac_open";
    else {
      return;
    }
    await Command.create(command, [path]).execute();
  }

}

export default Shell;
