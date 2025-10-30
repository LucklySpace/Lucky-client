import { Window } from "@tauri-apps/api/window";
import { StoresEnum } from "@/constants/index";


/**
 * 创建窗口
 */
export const ShowLoginWindow = async () => {
  const loginWindow = await Window.getByLabel(StoresEnum.LOGIN);
  if (loginWindow) {
    loginWindow.show();
    loginWindow.unminimize();
    loginWindow.setFocus();
  }
};


/**
 * 隐藏窗口
 */
export const HideLoginWindow = async () => {
  let loginWindow = await Window.getByLabel(StoresEnum.LOGIN);
  if (loginWindow) {
    loginWindow.hide();
  }
};


/**
 * 关闭窗口
 */
export const CloseLoginWindow = async () => {
  let loginWindow = await Window.getByLabel(StoresEnum.LOGIN);
  if (loginWindow) {
    loginWindow.close();
  }
};

