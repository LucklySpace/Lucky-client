import { onBeforeUnmount, ref, shallowRef } from "vue";
import { TrayIcon, TrayIconEvent } from "@tauri-apps/api/tray";
import { Image } from "@tauri-apps/api/image";
import { Menu } from "@tauri-apps/api/menu";
import { useLogger } from "./useLogger";

/**
 * 托盘配置接口
 */
type TrayConfig = {
  id: string; // 托盘唯一 ID
  tooltip: string; // 提示文字
  icon: string | Image; // 默认图标
  empty_icon: string | Image; // 闪烁时的空图标
  flashTime?: number; // 闪烁间隔（毫秒）
  menuItems?: { id: string; text: string; action: () => void }[]; // 右键菜单项
  trayClick?: (event: TrayIconEvent) => void;
  trayEnter?: (event: TrayIconEvent) => void;
  trayMove?: (event: TrayIconEvent) => void;
  trayLeave?: (event: TrayIconEvent) => void;
};

/**
 * Vue3 Hook：系统托盘管理
 * @returns 托盘操作方法 & 状态
 */
export function useTray() {
  // 日志
  const log = useLogger();

  const trayIcon = shallowRef<TrayIcon | null>(null); // 当前托盘对象
  const flashTimer = ref<any>(null); // 闪烁定时器
  const hasIcon = ref(false); // 当前是否显示 icon
  const config = ref<TrayConfig | null>(); // 托盘配置

  /**
   * 初始化托盘
   */
  async function initSystemTray(cfg: TrayConfig) {
    if (cfg) {
      config.value = { ...(config.value ?? {}), ...cfg };
    }
    if (!config.value) {
      log.warn("tray init - missing config");
      return false;
    }
    try {
      trayIcon.value = (await getTrayIconById(config.value.id));

      // 如果已有老的托盘，先删掉（避免旧的 callback id 留在 Rust）
      if (trayIcon.value) {
        try {
          await TrayIcon.removeById(config.value.id);
          log.info("remove old tray sucess");
        } catch (e) {
          log.warn("remove old tray failed", e);
        }
      }

      let options: any = {
        id: config.value.id,
        icon: config.value.icon,
        tooltip: config.value.tooltip,
        menuOnLeftClick: true,
        action: handleTrayEvent
      };

      // 配置右键菜单
      if (config.value.menuItems && config.value.menuItems.length > 0) {
        options.menu = await createTrayMenu(config.value.menuItems);
      }

      // 创建系统托盘
      //if (!trayIcon.value) {
      trayIcon.value = await TrayIcon.new(options);

      if (trayIcon.value && trayIcon.value.id) {
        config.value.id = trayIcon.value.id;
      }

      log.info("创建系统托盘成功");
      //}
      return true;
    } catch (error) {
      log.error("创建托盘图标失败:", error);
      return false;
    }
  }

  /**
   * 创建托盘菜单
   */
  async function createTrayMenu(menuItems: { id: string; text: string; action: () => void }[]) {
    return await Menu.new({
      // items 的显示顺序是倒过来的
      items: menuItems
    });
  }

  /**
   * 托盘事件处理
   */
  function handleTrayEvent(event: TrayIconEvent) {
    const { type } = event;
    switch (type) {
      case "Click":
        config.value?.trayClick?.(event);
        break;
      case "Enter":
        config.value?.trayEnter?.(event);
        break;
      case "Move":
        config.value?.trayMove?.(event);
        break;
      case "Leave":
        config.value?.trayLeave?.(event);
        break;
    }
  }

  /**
   * 获取托盘图标对象
   */
  async function getTrayIconById(id?: string) {
    if (!id) return null;
    if (trayIcon.value?.id === id) {
      return trayIcon.value;
    } else {
      return await TrayIcon.getById(id);
    }
  }

  /**
   * 更新托盘图标
   */
  async function updateIcon(icon: string | Image) {
    if (!trayIcon.value) return;
    await trayIcon.value.setIcon(icon);
  }

  /**
   * 更新托盘提示
   */
  async function updateTooltip(tooltip: string) {
    if (!trayIcon.value) return;
    await trayIcon.value.setTooltip(tooltip);
  }

  /**
   * 显示 / 隐藏托盘
   */
  async function setVisible(visible: boolean) {
    if (!trayIcon.value) return;
    await trayIcon.value.setVisible(visible);
  }

  /**
   * 开始 / 停止闪烁
   */
  async function flash(flash: boolean) {
    if (!trayIcon.value || !config.value) return;

    if (flash) {
      if (flashTimer.value) return;
      flashTimer.value = setInterval(async () => {
        const flashImg: any = hasIcon.value ? config.value?.icon : config.value?.empty_icon;
        await trayIcon.value?.setIcon(flashImg);
        hasIcon.value = !hasIcon.value;
      }, config.value.flashTime || 600);
    } else {
      if (flashTimer.value) {
        clearInterval(flashTimer.value);
        flashTimer.value = null;
      }
      await trayIcon.value.setIcon(config.value.icon as any);
    }
  }

  /**
   * 销毁托盘
   */
  async function destroy() {
    if (flashTimer.value) {
      clearInterval(flashTimer.value);
      flashTimer.value = null;
    }
    if (!trayIcon.value) return;
    await TrayIcon.removeById(trayIcon.value.id);
    trayIcon.value = null;
    config.value = null;
  }

  /**
   * 组件卸载时自动清理
   */
  onBeforeUnmount(async () => {
    await destroy();
  });

  return {
    trayIcon,
    initSystemTray,
    updateIcon,
    updateTooltip,
    setVisible,
    flash,
    destroy
  };
}
