import { useSettingStore } from "@/store/modules/setting";
import {
  isRegistered,
  register as tauriRegister,
  type ShortcutHandler,
  unregister as tauriUnregister,
  unregisterAll as tauriUnregisterAll
} from "@tauri-apps/plugin-global-shortcut";
import { useLogger } from "./useLogger";

/**
 * 单个快捷键配置接口
 */
export interface ShortcutConfig {
  /** 唯一标识名称 */
  name: string;
  /** 快捷键组合 */
  combination: string;
  /** 触发回调 */
  handler: ShortcutHandler;
}

// 全局单例状态
const registry = new Map<string, ShortcutConfig>();
let initialized = false;

//归一化处理, 统一修饰键&顺序, 仅用于匹配/校验, 真正注册仍用原串
function normalizeCombo(raw: string): string {
  if (!raw) return "";
  const map: Record<string, string> = {
    control: "Ctrl",
    ctrl: "Ctrl",
    command: "Cmd",
    cmd: "Cmd",
    meta: "Cmd",
    super: "Cmd",
    win: "Cmd", // 统一到 Cmd（仅用于匹配）
    alt: "Alt",
    option: "Alt",
    shift: "Shift",
    del: "Delete",
    delete: "Delete",
    esc: "Esc",
    escape: "Esc",
    prtsc: "PrintScreen",
    printscreen: "PrintScreen"
  };
  const parts = raw
    .split("+")
    .map(p => p.trim())
    .filter(Boolean);
  const mods: string[] = [];
  let main = "";
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const key = map[p.toLowerCase()] || p;
    if (["Ctrl", "Alt", "Shift", "Cmd"].includes(key)) mods.push(key);
    else main = key.length === 1 ? key.toUpperCase() : key;
  }
  mods.sort(); // Ctrl+Alt+Shift+Cmd 固定顺序
  return main ? `${mods.join("+")}${mods.length ? "+" : ""}${main}` : mods.join("+");
}

function getPlatform(): "win" | "mac" | "linux" {
  const p = (navigator.platform || "").toLowerCase();
  if (p.includes("mac")) return "mac";
  if (p.includes("win")) return "win";
  return "linux";
}
//打回系统常用键注册
function isSpecialCombination(combination: string): { blocked: boolean; reason?: string } {
  const norm = normalizeCombo(combination);
  if (!norm) return { blocked: false };
  // 特例：Esc 允许
  if (norm === "Esc") return { blocked: false };

  const common = new Set(["Alt+Tab", "Alt+F4", "Ctrl+Alt+Delete", "Ctrl+Shift+Esc", "PrintScreen"]);

  const win = new Set([
    "Cmd+L",
    "Cmd+D",
    "Cmd+R",
    "Cmd+Tab",
    "Cmd+Shift+S",
    "Cmd+E",
    "Cmd+X",
    "Cmd+I"
    // 说明：此处将 Win 键统一为 Cmd（仅用于匹配），不要与真正 mac 的 Cmd 混淆
  ]);

  const mac = new Set(["Cmd+Tab", "Cmd+Space", "Cmd+Alt+Esc", "Ctrl+Cmd+Power"]);

  const linuxPatterns = [
    /^Ctrl\+Alt\+F([1-9]|1[0-2])$/ // Ctrl+Alt+F1..F12
  ];

  if (common.has(norm)) return { blocked: true, reason: `${norm} 为系统保留快捷键` };

  const platform = getPlatform();
  if (platform === "win" && win.has(norm)) return { blocked: true, reason: `${norm} 为 Windows 系统保留快捷键` };
  if (platform === "mac" && mac.has(norm)) return { blocked: true, reason: `${norm} 为 macOS 系统保留快捷键` };
  if (platform === "linux" && linuxPatterns.some(r => r.test(norm))) {
    return { blocked: true, reason: `${norm} 可能被系统/窗口管理器占用` };
  }
  return { blocked: false };
}

/**
 * useGlobalShortcut - 全局快捷键管理单例 Hook
 *
 * 仅首次调用时根据 initialList 注册快捷键。
 * 设置页可通过 updateShortcut(name, combination) 动态修改。
 *
 * @param initialList 初始快捷键列表
 */
export function useGlobalShortcut(initialList: ShortcutConfig[] = []) {
  // 日志
  const log = useLogger();

  const settingStore = useSettingStore();

  // Handler 映射，仅用于首次 init 时为 store 中项找到 handler
  const handlerMap = new Map<string, ShortcutHandler>();

  initialList.forEach(cfg => handlerMap.set(cfg.name, cfg.handler));

  // 内部注册，注册到 Tauri & 更新 registry & 同步 store
  async function internalRegister(cfg: ShortcutConfig): Promise<boolean> {
    const { name, combination, handler } = cfg;
    const special = isSpecialCombination(combination);
    //冲突检查: 系统常用快捷键 -> 特殊组合 -> 冲突
    if (special.blocked) {
      try {
        await ElMessageBox.alert(
          `${special.reason}，无法注册。请更换组合（建议使用 Ctrl/Shift/Alt + 字母/数字，例如 Ctrl+Shift+M）。`,
          "快捷键被占用",
          { type: "warning" }
        );
      } catch {}
    }
    if (!isValidCombination(combination)) {
      log.warn(`[Shortcut] 无效的快捷键组合：${name}(${combination})`);
      return false;
    }
    if (!combination) return false;
    // debugger
    const conflict = await isRegistered(combination);
    if (conflict) {
      const holder = [...registry.values()].find(c => normalizeCombo(c.combination) === normalizeCombo(combination));
      if (holder && holder.name !== name) {
        // 2) 注销占用者
        try {
          await tauriUnregister(holder.combination);
        } catch {}
        registry.delete(holder.name);
        const i = settingStore.shortcuts.findIndex(s => s.name === holder.name);
        if (i >= 0) settingStore.shortcuts.splice(i, 1); // 或置空由你决定
      } else {
        // 3) 若未在 registry 中找到但插件返回已注册（幽灵注册），尝试直接注销
        try {
          await tauriUnregister(combination);
        } catch {}
      }
    }
    try {
      await tauriRegister(combination, handler);
    } catch (e) {
      log.warn(`[Shortcut] 注册失败：${name}(${combination})`, e);
      return false;
    }
    registry.set(name, cfg);
    // 同步 store
    const idx = settingStore.shortcuts.findIndex(s => s.name === name);
    if (idx >= 0) {
      settingStore.shortcuts[idx].combination = combination;
    } else {
      settingStore.shortcuts.push({ name, combination });
    }
    log.info(`[Shortcut] 注册：${name} => ${combination}`);
    return true;
  }
  /**
   * *先删旧再更新, 失败自动回退到上一级注册信息
   */
  //最近一次调用事件
  const lastCallAt = new Map<string, number>();
  // 节流窗口
  const THROTTLE = 250;
  async function registerThenSwap(
    name: string,
    prevCombo: string | undefined,
    nextCombo: string,
    handler: ShortcutHandler
  ): Promise<boolean> {
    //节流处理, 防止快速切换造成的问题
    const now = Date.now();
    const last = lastCallAt.get(name) || 0;
    if (now - last < THROTTLE) {
      try {
        log.warn?.(`[Shortcut] throttle skip: ${name}`);
      } catch {}
      return false; //不接受连续处理
    }
    lastCallAt.set(name, now);

    const ok = await internalRegister({ name, combination: nextCombo, handler });

    if (!ok) {
      //回退, 尽量回复旧组合
      if (prevCombo) {
        try {
          await tauriRegister(prevCombo, handler);
        } catch {}
        registry.set(name, { name, combination: prevCombo, handler });
        const idx = settingStore.shortcuts.findIndex(s => s.name === name);
        if (idx >= 0) settingStore.shortcuts[idx].combination = prevCombo;
      }
      try {
        if (nextCombo !== prevCombo)
          ElMessage?.warning?.(`快捷键 ${nextCombo} 不可用，已恢复至 ${prevCombo || "（无）"}`);
        else ElMessage?.warning?.(`快捷键 ${nextCombo} 不可用， 请重新设置`);
      } catch {}
      return false;
    }
    return true;
  }

  /**
   * 初始化注册：从 store + initialList
   */
  async function init() {
    if (initialized) return;
    initialized = true;
    // clearAll();
    // 先按 store 列表恢复
    for (const { name, combination } of settingStore.shortcuts) {
      const handler = handlerMap.get(name);
      if (handler) {
        //避免先销毁后注册带来的冲突问题
        // const saved = settingStore.getShortcut(name) || combination;
        // await unregister(saved);
        // await internalRegister({ name, combination: saved, handler });
        const saved = settingStore.getShortcut(name) || combination;
        const pre = registry.get(name)?.combination;
        await registerThenSwap(name, pre, saved, handler);
      } else {
        log.warn(`[Shortcut] 未找到处理函数：${name}`);
      }
    }
    // 再注册 initialList 中的（跳过已注册）
    for (const cfg of initialList) {
      if (!registry.has(cfg.name)) {
        // await internalRegister(cfg);
        const prev = registry.get(cfg.name)?.combination || settingStore.getShortcut(cfg.name);
        await registerThenSwap(cfg.name, prev, cfg.combination, cfg.handler);
      }
    }
  }

  /**
   * 新增快捷键组合
   */
  async function addShortcut(shortcut: ShortcutConfig) {
    if (!registry.get(shortcut.name)) {
      const saved = settingStore.getShortcut(shortcut.name) || shortcut.combination;
      // await unregister(saved);
      // await internalRegister({ name: shortcut.name, combination: saved, handler: shortcut.handler });
      const prev = registry.get(shortcut.name)?.combination || saved;
      await registerThenSwap(shortcut.name, prev, saved, shortcut.handler);
    }
  }

  /**
   * 更新快捷键组合：注销旧的并注册新的
   */
  async function updateShortcut(name: string, newCombination: string) {
    const old = registry.get(name);
    // if (old) {
    //   await unregister(old.combination);
    // }
    const handler = handlerMap.get(name) || old?.handler;
    if (!handler) {
      log.error(`[Shortcut] 更新失败，未找到处理函数：${name}`);
      return;
    }
    // await internalRegister({ name, combination: newCombination, handler });
    const prev = old?.combination || settingStore.getShortcut(name);
    await registerThenSwap(name, prev, newCombination, handler);
  }

  /**
   * 校验快捷键组合格式是否合法
   * 支持格式如：Ctrl+Shift+A、Alt+F4、Super+Q 等
   * 特例：如果是 esc 或 escape（任意大小写），直接返回 true
   */
  function isValidCombination(combination: string): boolean {
    if (!combination) return false;

    const raw = combination.trim();
    if (!raw) return false;

    // 特例：单独按 Esc / Escape
    const lowRaw = raw.toLowerCase();
    if (lowRaw === "esc" || lowRaw === "escape") return true;

    // 拆分并去掉空段
    const parts = raw
      .split("+")
      .map(p => p.trim())
      .filter(p => p.length > 0);
    if (parts.length < 2) return false; // 至少要有修饰键 + 主键

    const modifiersSet = new Set(["ctrl", "alt", "shift", "super", "command", "cmd", "meta"]);

    // 主键不能是修饰键
    const mainKey = parts[parts.length - 1];
    if (!mainKey) return false;
    if (modifiersSet.has(mainKey.toLowerCase())) return false;

    // 修饰键必须都在允许集合内，且不能重复
    const seen = new Set<string>();
    for (let i = 0; i < parts.length - 1; i++) {
      const m = parts[i].toLowerCase();
      if (!modifiersSet.has(m)) return false;
      if (seen.has(m)) return false;
      seen.add(m);
    }

    return true;
  }

  /**
   * 注销所有快捷键
   */
  async function clearAll() {
    await tauriUnregisterAll();
    registry.clear();
    settingStore.shortcuts = [];
    log.info("[Shortcut] 清空所有");
  }

  /**
   * 卸载快捷键
   * @param combination
   */
  async function unregister(combination: string) {
    try {
      await tauriUnregister(combination);
    } catch (err) {}
  }

  /**
   * 列出当前已注册的所有
   */
  function listShortcuts() {
    return Array.from(registry.values());
  }

  // 首次组件挂载时运行 init
  // onMounted(() => init());

  return {
    init,
    addShortcut,
    updateShortcut,
    clearAll,
    listShortcuts
  };
}
