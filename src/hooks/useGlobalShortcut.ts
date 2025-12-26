import { useSettingStore } from "@/store/modules/setting";
import {
  isRegistered,
  register as tauriRegister,
  type ShortcutHandler,
  unregister as tauriUnregister,
  unregisterAll as tauriUnregisterAll
} from "@tauri-apps/plugin-global-shortcut";
import { useLogger } from "./useLogger";
import { normalizeCombo, isSpecialCombination } from "@/utils/KeyUtilities"
import { useI18n } from "@/i18n";
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
// 同名执行中标志（避免并发覆盖）
const inFlightMap = new Map<string, boolean>();


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
  // i18n 实例与便捷 t 方法
  const { i18n } = useI18n();
  const t = (key: string, params?: Record<string, any>) =>
    // 兼容 vue-i18n 9 的 global.t 写法
    (i18n.global as any).t?.(key, params) ?? key;

  const settingStore = useSettingStore();

  // Handler 映射，仅用于首次 init 时为 store 中项找到 handler
  const handlerMap = new Map<string, ShortcutHandler>();

  initialList.forEach(cfg => handlerMap.set(cfg.name, cfg.handler));

  // 内部注册，注册到 Tauri & 更新 registry & 同步 store
  async function internalRegister(cfg: ShortcutConfig): Promise<boolean> {
    const { name, combination, handler } = cfg;
    const special = isSpecialCombination(combination);
    // 冲突检查: 系统常用快捷键 -> 特殊组合 -> 冲突（弹窗改为 i18n 文案）
    if (special.blocked) {
      try {
        await ElMessageBox.alert(
          t("shortcut.systemReserved.message", { combo: normalizeCombo(combination) }),
          t("shortcut.systemReserved.title"),
          { type: "warning" }
        );
      } catch {}
      return false;
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
    // 节流处理（同名），防止快速切换造成的问题
    const now = Date.now();
    const last = lastCallAt.get(name) || 0;
    if (now - last < THROTTLE) {
      try { log.warn?.(`[Shortcut] throttle skip: ${name}`); } catch {}
      return false;
    }
    lastCallAt.set(name, now);

    // in-flight：同名执行中直接跳过
    if (inFlightMap.get(name)) {
      try { log.info?.(`[Shortcut] in-flight skip: ${name}`); } catch {}
      return false;
    }
    inFlightMap.set(name, true);

    try {
      // 先删旧再注新，避免遗留（失败再回退）
      if (prevCombo && prevCombo !== nextCombo) {
        try { await tauriUnregister(prevCombo); } catch {}
      }

      const ok = await internalRegister({ name, combination: nextCombo, handler });
      if (!ok) {
        // 回退：尽量恢复旧组合
        if (prevCombo) {
          try { await tauriRegister(prevCombo, handler); } catch {}
          registry.set(name, { name, combination: prevCombo, handler });
          const idx = settingStore.shortcuts.findIndex(s => s.name === name);
          if (idx >= 0) settingStore.shortcuts[idx].combination = prevCombo;
        }
        try {
          ElMessage?.warning?.(
            t("shortcut.restore.message", {
              combo: nextCombo,
              prev: prevCombo || "（无）"
            })
          );
        } catch {}
        return false;
      }
      return true;
    } finally {
      inFlightMap.set(name, false);
    }
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
    return true;
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
      return false;
    }
    // await internalRegister({ name, combination: newCombination, handler });
    const prev = old?.combination || settingStore.getShortcut(name);
    return await registerThenSwap(name, prev, newCombination, handler);
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
