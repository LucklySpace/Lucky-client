import { TrayIcon, TrayIconEvent } from "@tauri-apps/api/tray";
import { Image } from "@tauri-apps/api/image";

// import { store } from './Store';

interface TrayConfig {
  id: string;
  tooltip: string;
  icon: string | Image;
  empty_icon: string | Image;
  flashTime?: number;
  trayClick?: (event: TrayIconEvent) => void;
  trayEnter?: (event: TrayIconEvent) => void;
  trayMove?: (event: TrayIconEvent) => void;
  trayLeave?: (event: TrayIconEvent) => void;
}


export default class TrayManager {
  private static instance: TrayManager;
  private trayIcon: TrayIcon | null = null;
  private flashTimer: any = null;
  private hasIcon: boolean = false;
  private config: TrayConfig | null = null;

  private constructor() {
  }

  public static getInstance(): TrayManager {
    if (!TrayManager.instance) {
      TrayManager.instance = new TrayManager();
    }
    return TrayManager.instance;
  }

  /**
   * 初始化托盘
   */
  public async init(config: TrayConfig) {
    this.config = config;
    try {
      this.trayIcon = this.trayIcon || await this.getTrayIconById(config.id);

      // 创建系统托盘
      if (!this.trayIcon) {
        this.trayIcon = await TrayIcon.new({
          id: config.id,
          icon: config.icon,
          tooltip: config.tooltip,
          menuOnLeftClick: true,
          action: this.handleTrayEvent.bind(this)
        });

        // store.set("taryId", this.trayIcon.rid)
      }
      // await this.destroy();

      return true;
    } catch (error) {
      console.error("创建托盘图标失败:", error);
      return false;
    }
  }

  /**
   * 获取托盘图标
   */
  async getTrayIconById(id?: string): Promise<TrayIcon | null> {
    if (!id) return null;
    if (this.trayIcon?.id == id) {
      return this.trayIcon;
    } else {
      return await TrayIcon.getById(id);
    }
  }

  /**
   * 更新托盘图标
   */
  public async updateIcon(icon: string | Image) {
    if (!this.trayIcon) return;
    await this.trayIcon.setIcon(icon);
  }

  /**
   * 更新托盘提示文本
   */
  public async updateTooltip(tooltip: string) {
    if (!this.trayIcon) return;
    await this.trayIcon.setTooltip(tooltip);
  }

  /**
   * 显示/隐藏托盘图标
   */
  public async setVisible(visible: boolean) {
    if (!this.trayIcon) return;
    await this.trayIcon.setVisible(visible);
  }

  /**
   * 开始/停止托盘图标闪烁
   */
  public async flash(flash: boolean) {
    if (!this.trayIcon || !this.config) return;

    if (flash) {
      if (this.flashTimer) return;
      this.flashTimer = setInterval(async () => {
        await this.trayIcon?.setIcon(
          this.hasIcon ? this.config!.icon : this.config!.empty_icon
        );
        this.hasIcon = !this.hasIcon;
      }, this.config.flashTime || 600);
    } else {
      if (this.flashTimer) {
        clearInterval(this.flashTimer);
        this.flashTimer = null;
      }
      await this.trayIcon.setIcon(this.config.icon);
    }
  }

  /**
   * 销毁托盘图标
   */
  public async destroy() {
    if (this.flashTimer) {
      clearInterval(this.flashTimer);
      this.flashTimer = null;
    }
    if (!this.trayIcon) return;
    await TrayIcon.removeById(this.trayIcon.id);
    this.trayIcon = null;
    this.config = null;
  }

  /**
   * 处理托盘事件
   */
  private handleTrayEvent(event: any) {
    const { type } = event;
    switch (type) {
      case "Click":
        this.config?.trayClick?.(event);
        break;
      case "Enter":
        this.config?.trayEnter?.(event);
        break;
      case "Move":
        this.config?.trayMove?.(event);
        break;
      case "Leave":
        this.config?.trayLeave?.(event);
        break;
    }
  }
}
