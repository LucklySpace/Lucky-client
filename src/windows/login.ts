import { StoresEnum } from "@/constants/index";
import { closeWindow, hideWindow, showAndFocus } from "@/windows/utils";


/**
 * 创建窗口
 */
export const ShowLoginWindow = async () => {
  await showAndFocus(StoresEnum.LOGIN);
};


/**
 * 隐藏窗口
 */
export const HideLoginWindow = async () => {
  await hideWindow(StoresEnum.LOGIN);
};


/**
 * 关闭窗口
 */
export const CloseLoginWindow = async () => {
  await closeWindow(StoresEnum.LOGIN);
};

