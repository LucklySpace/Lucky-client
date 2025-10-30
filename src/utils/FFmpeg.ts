/**
 * 降噪： https://blog.csdn.net/hongszh/article/details/129160874
 */

// `binaries/my-sidecar` 是在 `tauri.conf.json > tauri > bundle > externalBin` 指定的确切值。
const ffmpeg = Command.sidecar("bin/ffmpeg");

const comand = "ffmpeg.exe -f gdigrab -i desktop -r 10 -pix_fmt yuv420p output.mp4";

import { Command } from "@tauri-apps/plugin-shell";

export class ScreenCaptureTool {
  private platform: string;

  constructor() {
    this.platform = "";
  }

  // 执行自定义命令
  public async executeCustomCommand(command: string) {
    try {
      const customCommand = Command.sidecar("bin/ffmpeg", command);
      const output = await customCommand.execute();
      return output.stdout;
    } catch (error) {
      console.error("Failed to execute command:", error);
    }
  }

  // 执行录屏命令
  public async recordScreen(outputFile: string, x: number, y: number, width: number, height: number) {
    const command = this.generateRecordingCommand(outputFile, x, y, width, height);
    return this.executeCustomCommand(command);
  }

  // 执行截图命令
  public async captureScreenshot(outputFile: string, x: number, y: number, width: number, height: number) {
    const command = this.generateScreenshotCommand(outputFile, x, y, width, height);
    return this.executeCustomCommand(command);
  }

  // 初始化时获取平台信息
  private async init() {
    // return await os.platform();
  }

  // 根据平台生成录屏命令
  private generateRecordingCommand(outputFile: string, x: number, y: number, width: number, height: number) {
    let command = "";

    if (this.platform === "linux") {
      // Linux 使用 X11
      command = `ffmpeg -f x11grab -i :0.0+${x},${y} -video_size ${width}x${height} -framerate 30 ${outputFile}`;
    } else if (this.platform === "darwin") {
      // macOS 使用 AVFoundation
      command = `ffmpeg -f avfoundation -framerate 30 -i "1" -vf "crop=${width}:${height}:${x}:${y}" ${outputFile}`;
    } else if (this.platform === "win32") {
      // Windows 使用 GDI 或 DXGI
      command = `ffmpeg -f gdigrab -framerate 30 -offset_x ${x} -offset_y ${y} -video_size ${width}x${height} -i desktop ${outputFile}`;
    }

    return command;
  }

  // 根据平台生成截图命令
  private generateScreenshotCommand(outputFile: string, x: number, y: number, width: number, height: number) {
    let command = "";

    if (this.platform === "linux") {
      // Linux 使用 X11 截图
      command = `ffmpeg -f x11grab -video_size ${width}x${height} -i :0.0+${x},${y} -frames:v 1 ${outputFile}`;
    } else if (this.platform === "darwin") {
      // macOS 使用 AVFoundation 截图
      command = `ffmpeg -f avfoundation -i "1" -vf "crop=${width}:${height}:${x}:${y}" -frames:v 1 ${outputFile}`;
    } else if (this.platform === "win32") {
      // Windows 使用 GDI 截图
      command = `ffmpeg -f gdigrab -offset_x ${x} -offset_y ${y} -video_size ${width}x${height} -i desktop -frames:v 1 ${outputFile}`;
    }

    return command;
  }
}


//   ffmpeg -f gdigrab -framerate 30 -offset_x 0 -offset_y 0 -video_size 900x600 -i desktop output.mp4