import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalPosition, LogicalSize, PhysicalSize, Window } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { StoresEnum } from "@/constants/index";

export const showOrCreateNotifyWindow = async (chatCount: number, options: any) => {

  // 如果消息数量为0，则不显示通知窗口
  if (chatCount == 0) {
    useLogger().warn("消息数量为0,不显示通知窗口");
    return;
  }
  ;

  // 弹窗高度，基础高度70，每增加一条消息增加48,最多6条高度288
  const height = 70 + (chatCount <= 6 ? chatCount : 6) * 48;

  // 弹窗宽度
  const width = 220;

  // 弹窗x轴位置
  const x = calculateCssPosition(options.x) - 110;

  // 弹窗y轴位置
  const y = screen.availHeight - height;

  const config = {
    label: StoresEnum.NOTIFY,
    title: "消息通知",
    url: "/notify",
    width: width,
    height: height,
    x: x,
    y: y,
    resizable: false,
    decorations: false,
    alwaysOnTop: true,
    transparent: false,
    shadow: false
    //minHeight: 90,
    // resizable: false,
    // decorations: false,
    // alwaysOnTop: true,
    // skipTaskbar: true,
    // transparent: true,
    // shadow: false
  };

  // 获取窗口
  const appWindow = await Window.getByLabel(StoresEnum.NOTIFY);

  if (!appWindow) {
    const appWindow = new WebviewWindow(config.label, config);
    //防止窗口内容被其他应用程序捕获。
    await appWindow.setContentProtected(true);
    useLogger().info("通知窗口不存在,创建通知窗口成功");
  } else {
    // 设置位置
    await appWindow.setAlwaysOnTop(true);
    // 设置窗口尺寸
    await appWindow.setSize(new LogicalSize(width, height));
    // 设置窗口位置
    await appWindow.setPosition(new LogicalPosition(x, y));
    // 显示窗口
    await appWindow.show();
    // 设置窗口焦点
    await appWindow.setFocus();
    // 防止窗口内容被其他应用程序捕获。
    await appWindow.setContentProtected(true);
    useLogger().info("通知窗口已存在,设置窗口尺寸和位置成功");
  }
};


/**
 * 关闭通知窗口
 */
export const CloseNotifyWindow = async () => {
  let notifyWindow = await Window.getByLabel(StoresEnum.NOTIFY);
  if (notifyWindow) notifyWindow.close();
};


/**
 * 隐藏通知窗口
 */
export const hideNotifyWindow = async () => {
  let notifyWindow = await Window.getByLabel(StoresEnum.NOTIFY);
  if (notifyWindow) notifyWindow.hide();
};


/**
 * 计算通知窗口尺寸 是否需要隐藏
 * @returns
 */
export const calHideNotifyWindow = async (event: any) => {
  const trayBounds = event.rect.position;
  // 获取托盘图标位置
  //const trayBounds = event.position;
  // 获取通知窗口
  let notifyWindow = await Window.getByLabel(StoresEnum.NOTIFY);

  // 如果通知窗口不存在或者通知窗口未显示，则不进行计算
  if (!notifyWindow || !await notifyWindow.isVisible()) {
    useLogger().info("通知窗口不存在或者通知窗口未显示,不进行计算");
    return;
  }
  ;

  // 获取通知窗口尺寸
  let size: PhysicalSize | undefined = await notifyWindow?.innerSize();

  if (!size) return;

  // 计算整个交互区域的边界
  const bounds = {
    left: trayBounds.x - (size?.width / 2),
    right: trayBounds.x + (size?.width / 2),
    top: trayBounds.y - size?.height, // 向上展开
    bottom: trayBounds.y
  };

  // 等待100ms,模拟鼠标移出
  await sleep(180);

  // 获取鼠标位置
  const position: any = await invoke("get_mouse_position");

  // 获取鼠标位置
  const mouseX = position[0];
  const mouseY = position[1];

  // 判断鼠标是否在交互区域外
  if (mouseX < bounds.left || mouseX > bounds.right ||
    mouseY < bounds.top || mouseY > bounds.bottom) {
    hideNotifyWindow();
  }
};


/**
 * 判断设备
 * @returns
 */
export const detectOS = () => {
  const userAgent = navigator.userAgent;
  let os = "Unknown OS";

  if (/iPad/i.test(userAgent)) {
    os = "iOS";
  } else if (/iPhone/i.test(userAgent)) {
    os = "iOS";
  } else if (/Mac/i.test(userAgent)) {
    os = "macOS";
  } else if (/Windows/i.test(userAgent)) {
    os = "Windows";
  } else if (/Linux/i.test(userAgent)) {
    os = "Linux";
  }

  return os;
};

/**
 * 计算物理像素与css像素比值
 * @param pixelPosition
 * @param devicePixelRatio 设备像素比 默认：window.devicePixelRatio
 * @returns
 */
const calculateCssPosition = (pixelPosition: number, devicePixelRatio: number = window.devicePixelRatio): number => {
  return pixelPosition / devicePixelRatio;
};


export default { showOrCreateNotifyWindow, CloseNotifyWindow, detectOS };

function sleep(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}
