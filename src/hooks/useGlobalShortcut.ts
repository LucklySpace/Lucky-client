import { useSettingStore } from "@/store/modules/setting";
import {
  isRegistered,
  register as tauriRegister,
  unregister as tauriUnregister,
  unregisterAll as tauriUnregisterAll,
  type ShortcutHandler
} from "@tauri-apps/plugin-global-shortcut";
import { useLogger } from "./useLogger";
import { normalizeCombo, isSpecialCombination } from "@/utils/KeyUtilities";
import { useI18n } from "@/i18n";
import { ElMessage, ElMessageBox } from "element-plus";

// --- Types ---

export interface ShortcutConfig {
  /** Unique identifier for the shortcut (e.g., "toggle_window") */
  name: string;
  /** Key combination (e.g., "Ctrl+Shift+X") */
  combination: string;
  /** Callback function when triggered */
  handler: ShortcutHandler;
}

// --- Singleton State ---

const registry = new Map<string, ShortcutConfig>();
const handlerMap = new Map<string, ShortcutHandler>();
const processing = new Set<string>(); // Prevents concurrent operations for the same shortcut
let isInitialized = false;

// --- Main Hook ---

/**
 * useGlobalShortcut
 * Global shortcut manager hook. Handles registration, validation, conflicts, and persistence.
 */
export function useGlobalShortcut(initialList: ShortcutConfig[] = []) {
  const log = useLogger();
  const settingStore = useSettingStore();
  const { i18n } = useI18n();

  // Helper for i18n
  const t = (key: string, params?: Record<string, any>) =>
    (i18n.global as any).t?.(key, params) ?? key;

  /**
   * Initialize shortcuts from store and initial list.
   * Should be called once on app startup.
   */
  async function init() {
    if (isInitialized) return;
    isInitialized = true;

    // 1. Register handlers from initial list
    initialList.forEach(cfg => handlerMap.set(cfg.name, cfg.handler));

    // 2. Restore from store (user preferences)
    for (const stored of settingStore.shortcuts) {
      const handler = handlerMap.get(stored.name);
      if (handler) {
        await registerSafe(stored.name, stored.combination, handler);
      }
    }

    // 3. Register remaining defaults from initial list
    for (const cfg of initialList) {
      if (!registry.has(cfg.name)) {
        // Use stored combination if exists (redundant check but safe), else default
        const combo = settingStore.getShortcut(cfg.name) || cfg.combination;
        await registerSafe(cfg.name, combo, cfg.handler);
      }
    }
  }

  /**
   * Register or update a shortcut safely.
   * Handles unregistering old keys, conflict checks, and persistence.
   */
  async function registerSafe(name: string, newCombo: string, handler: ShortcutHandler): Promise<boolean> {
    if (!newCombo) return false;
    
    // Throttling / Locking
    if (processing.has(name)) {
      log.warn(`[Shortcut] Skip concurrent operation: ${name}`);
      return false;
    }
    processing.add(name);

    const oldConfig = registry.get(name);
    const oldCombo = oldConfig?.combination;

    // If no change, return success
    if (oldCombo === newCombo) {
      processing.delete(name);
      return true;
    }

    try {
      // 1. Validation
      if (!isValidCombination(newCombo)) {
        log.warn(`[Shortcut] Invalid combination: ${newCombo}`);
        return false;
      }

      const special = isSpecialCombination(newCombo);
      if (special.blocked) {
        ElMessageBox.alert(
          t("shortcut.systemReserved.message", { combo: normalizeCombo(newCombo) }),
          t("shortcut.systemReserved.title"),
          { type: "warning" }
        ).catch(() => {});
        return false;
      }

      // 2. Conflict Check
      if (await isRegistered(newCombo)) {
        // Find who owns it locally
        const owner = [...registry.values()].find(c => normalizeCombo(c.combination) === normalizeCombo(newCombo));
        if (owner && owner.name !== name) {
          // Conflict with another internal shortcut -> Unregister the other one
          await tauriUnregister(owner.combination).catch(() => {});
          registry.delete(owner.name);
          // Optional: Clear from store or notify user
          const idx = settingStore.shortcuts.findIndex(s => s.name === owner.name);
          if (idx >= 0) settingStore.shortcuts.splice(idx, 1);
        } else {
          // Conflict with external app or "ghost" registration -> Try to force unregister
          await tauriUnregister(newCombo).catch(() => {});
        }
      }

      // 3. Unregister Old (if exists)
      if (oldCombo) {
        await tauriUnregister(oldCombo).catch(() => {});
      }

      // 4. Register New
      await tauriRegister(newCombo, handler);
      
      // 5. Update State
      registry.set(name, { name, combination: newCombo, handler });
      updateStore(name, newCombo);
      
      log.info(`[Shortcut] Registered: ${name} => ${newCombo}`);
      return true;

    } catch (e) {
      log.error(`[Shortcut] Failed to register ${name}:`, e);
      
      // Rollback attempt
      if (oldCombo) {
        try {
          await tauriRegister(oldCombo, handler);
          registry.set(name, oldConfig!);
          updateStore(name, oldCombo);
        } catch { /* Rollback failed */ }
      }
      
      ElMessage.warning(t("shortcut.registerFail", { combo: newCombo }));
      return false;
    } finally {
      processing.delete(name);
    }
  }

  /**
   * Public: Add a new shortcut (dynamic)
   */
  async function addShortcut(config: ShortcutConfig) {
    handlerMap.set(config.name, config.handler);
    return registerSafe(config.name, config.combination, config.handler);
  }

  /**
   * Public: Update existing shortcut
   */
  async function updateShortcut(name: string, newCombination: string) {
    const handler = handlerMap.get(name);
    if (!handler) {
      log.error(`[Shortcut] No handler found for: ${name}`);
      return false;
    }
    return registerSafe(name, newCombination, handler);
  }

  /**
   * Public: Clear all shortcuts
   */
  async function clearAll() {
    await tauriUnregisterAll();
    registry.clear();
    settingStore.shortcuts = [];
    log.info("[Shortcut] All cleared");
  }

  // --- Internals ---

  function updateStore(name: string, combination: string) {
    const idx = settingStore.shortcuts.findIndex(s => s.name === name);
    if (idx >= 0) {
      settingStore.shortcuts[idx].combination = combination;
    } else {
      settingStore.shortcuts.push({ name, combination });
    }
  }

  function isValidCombination(combo: string): boolean {
    if (!combo?.trim()) return false;
    const raw = combo.trim().toLowerCase();
    
    // Allow single Esc
    if (raw === "esc" || raw === "escape") return true;

    const parts = raw.split("+").map(p => p.trim()).filter(Boolean);
    if (parts.length < 2) return false; // Must have modifier + key

    const modifiers = new Set(["ctrl", "alt", "shift", "super", "command", "cmd", "meta"]);
    const mainKey = parts[parts.length - 1];
    
    // Main key cannot be a modifier
    if (modifiers.has(mainKey)) return false;

    // All other keys must be unique modifiers
    const seenMods = new Set<string>();
    for (let i = 0; i < parts.length - 1; i++) {
      const m = parts[i];
      if (!modifiers.has(m) || seenMods.has(m)) return false;
      seenMods.add(m);
    }

    return true;
  }

  return {
    init,
    addShortcut,
    updateShortcut,
    clearAll,
    listShortcuts: () => Array.from(registry.values())
  };
}

