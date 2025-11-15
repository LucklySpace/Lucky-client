import {
  isRegistered as tauriIsRegistered,
  register as tauriRegister,
  ShortcutHandler,
  unregister as tauriUnregister
} from "@tauri-apps/plugin-global-shortcut";
import { emit } from "@tauri-apps/api/event";

/**
 * 快捷键管理器
 * 封装 Tauri 全局快捷键注册、注销、更新及检查逻辑
 */
export default class ShortcutManager {

  private static readonly VALID_MODIFIERS = new Set([
    "CommandOrControl", "Ctrl", "Alt", "Shift", "Meta"
  ]);

  private static readonly VALID_KEYS = new Set([
    "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
    "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
    "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
    "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "Esc",
    "Enter", "Escape", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"
  ]);

  /**
   * 验证快捷键格式，需至少一个修饰键及一个主键
   */
  public static isValid(shortcut: string): boolean {
    const parts = shortcut.split("+").map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) return false;
    const mainKey = parts.pop()!;
    if (!ShortcutManager.VALID_KEYS.has(mainKey)) return false;
    return parts.every(mod => ShortcutManager.VALID_MODIFIERS.has(mod));
  }

  /**
   * 注册快捷键
   * @param shortcut 格式如 'Ctrl+S'
   * @param callback 快捷键触发回调
   */
  public static async register(
    shortcut: string,
    callback: ShortcutHandler
  ): Promise<void> {
    if (!this.isValid(shortcut)) {
      throw new Error(`Invalid shortcut: ${shortcut}`);
    }
    try {
      await tauriRegister(shortcut, callback);
    } catch (err) {
      console.error(`Register shortcut failed (${shortcut}):`, err);
      throw err;
    }
  }

  /**
   * 注册并在按下时触发事件
   */
  public static async registerAndEmit(
    shortcut: string,
    eventName: string
  ): Promise<void> {
    await this.register(shortcut, (e: any) => {
      if (e.state === "Pressed") emit(eventName);
    });
  }

  /**
   * 注销快捷键
   */
  public static async unregister(shortcut: string | string[]): Promise<void> {
    try {
      await tauriUnregister(shortcut);
    } catch (err) {
      console.warn(`Unregister shortcut failed (${shortcut}):`, err);
    }
  }

  /**
   * 更新快捷键
   * @param oldKey 旧快捷键，可为 null
   * @param newKey 新快捷键，可为 null
   * @param eventName 触发事件名称
   */
  public static async update(
    oldKey: string | null,
    newKey: string | null,
    eventName: string
  ): Promise<void> {
    if (oldKey) await this.unregister(oldKey);
    if (newKey) await this.registerAndEmit(newKey, eventName);
  }

  /**
   * 检查是否已注册
   */
  public static async isRegistered(shortcut: string): Promise<boolean> {
    if (!this.isValid(shortcut)) return false;
    try {
      return await tauriIsRegistered(shortcut);
    } catch (err) {
      console.error(`Check registered failed (${shortcut}):`, err);
      return false;
    }
  }
}


// // 导入全局快捷键插件和事件插件
// import { register, ShortcutHandler, unregister } from "@tauri-apps/plugin-global-shortcut";
// import { emit } from "@tauri-apps/api/event";

// // 注册快捷键
// export function shortcutRegister(shortcut: string, handler: ShortcutHandler) {
//     register(shortcut, handler)
// }

// // 注册快捷键并触发事件
// export function shortcutRegisterAndEmit(shortcut: string, emitName: string) {
//     register(shortcut, (e) => {
//         if (e.state === "Pressed") {
//             emit(emitName, e)
//         }
//     })
// }

// // 更新快捷键注册
// export function UpdateShortcutRegister(shortcut: string, newShortcut: string, emitName: string) {
//     if (shortcut) {
//         unregister(shortcut)
//     }
//     if (newShortcut) {
//         register(newShortcut, (e) => {
//             if (e.state === "Pressed") {
//                 emit(emitName, e)
//             }
//         })
//     }
// }

// // 验证快捷键是否有效
// export function isValidShortcut(shortcut: string) {
//     // 定义有效的修饰键和有效键
//     const validModifiers = ["Ctrl", "Alt", "Shift", "Meta"];
//     const validKeys = [
//         "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
//         "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
//         "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "F1", "F2", "F3",
//         "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "Enter",
//         "Escape", "Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"
//     ];
//     // 将快捷键按"+"分割成数组
//     const keys = shortcut.split('+').map(key => key.trim());
//     // 如果数组为空，则返回false
//     if (keys.length === 0) {
//         return false;
//     }

//     let hasMainKey = false;

//     // 遍历数组
//     for (let i = 0; i < keys.length; i++) {
//         const key = keys[i];
//         // 如果是修饰键
//         if (validModifiers.includes(key)) {
//             // 如果已经存在主键，则返回false
//             if (hasMainKey) {
//                 return false;
//             }
//         // 如果是有效键
//         } else if (validKeys.includes(key)) {
//             // 如果已经存在主键，则返回false
//             if (hasMainKey) {
//                 return false;
//             }
//             // 设置主键
//             hasMainKey = true;
//         // 如果既不是修饰键也不是有效键，则返回false
//         } else {
//             return false;
//         }
//     }
//     // 返回主键是否存在
//     return hasMainKey;
// }