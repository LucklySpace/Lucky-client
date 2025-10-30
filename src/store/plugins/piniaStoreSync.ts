import * as pinia from "pinia";
import { PiniaPlugin, PiniaPluginContext } from "pinia";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { get } from "lodash-es";

/**
 * Pinia 多窗口同步选项
 */
interface SyncOptions {
  /** 要同步的字段路径 */
  paths?: string[];
  /** 目标窗口 label */
  targetWindows?: string[];
  /** 指定源窗口 label，其他窗口向它请求数据 */
  sourceWindow?: string;
  /** 防抖时间（毫秒），默认 50 */
  debounce?: number;
}

declare module "pinia" {
  interface DefineStoreOptionsBase<S extends pinia.StateTree, Store> {
    sync?: SyncOptions;
  }

  interface PiniaCustomProperties {
    $sync: () => void;
  }
}
/**
 * 创建一个用于在多个窗口之间同步 Pinia 状态的插件。
 * 
 * @param globalOpts - 全局同步选项，可被具体 store 的 sync 配置覆盖。
 *            包含以下属性：
 *          - paths: 要同步的状态路径列表（默认为空数组）。
 *          - targetWindows: 指定要同步到的目标窗口标签列表（默认为空数组）。
 *          - sourceWindow: 指定作为状态来源的窗口标签（默认为 undefined）。
 *          - debounce: 同步操作的防抖时间（毫秒，默认为 50ms）。
 * @returns 返回一个符合 Pinia 插件规范的函数，该函数会在每个 store 初始化时执行。
 */
function createPiniaSync(globalOpts: SyncOptions = {}): PiniaPlugin {
  // debugger
  // const currentWindow = getCurrentWindow();
  // const currentLabel = currentWindow?.label ;
  // console.log(`[pinia-sync] 当前窗口 label: ${currentLabel}`);
  const currentLabel = getCurrentWindow().label;

  return (ctx: PiniaPluginContext) => {
    const store = ctx.store;
    const storeId = store.$id;

    // 合并配置
    const cfg: Required<SyncOptions> = {
      paths: [],
      targetWindows: [],
      sourceWindow: undefined,
      debounce: 50,
      ...globalOpts,
      ...(ctx.options as any)?.sync,
      ...(store as any)?.sync
    };

    if (!(store as any).sync) (store as any).sync = cfg;

    if (!cfg.paths.length) {
      console.log(`[pinia-sync] store "${storeId}" 无同步字段，跳过`);
      return;
    }

    console.log(`[pinia-sync] store "${storeId}" 配置`, cfg);

    let isRemote = false;
    let debounceTimer: NodeJS.Timeout | null = null;
    let pendingPatch: Record<string, any> = {};

    /** 发送同步消息 */
    const sendPatch = (patch: Record<string, any>, to?: string[]) => {
      if (!Object.keys(patch).length) return;
      emit("pinia-sync", {
        storeId,
        state: patch,
        from: currentLabel,
        to: to?.length ? to : undefined
      });
    };

    /** 防抖触发同步 */
    const scheduleSync = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        sendPatch(pendingPatch, cfg.targetWindows);
        pendingPatch = {};
      }, cfg.debounce);
    };

    /** 从 state 中取指定路径的值 */
    const extractPatch = (state: any, paths: string[]) => {
      const patch: Record<string, any> = {};
      paths.forEach(p => {
        const val = get(state, p);
        if (val !== undefined) patch[p] = val;
      });
      return patch;
    };

    /** 监听远程同步事件 */
    listen<{ storeId: string; state: Record<string, any>; from?: string; to?: string[] }>("pinia-sync", ev => {
      if (ev.payload.storeId !== storeId) return;
      if (ev.payload.to?.length && !ev.payload.to.includes(currentLabel)) return;
      if (ev.payload.from === currentLabel) return;

      isRemote = true;
      store.$patch(ev.payload.state);
      queueMicrotask(() => (isRemote = false));
    });

    /** 如果本窗口是源，监听数据请求 */
    if (cfg.sourceWindow && currentLabel === cfg.sourceWindow) {
      listen<{ storeId: string; from: string; paths?: string[] }>("pinia-sync-request", ev => {
        if (ev.payload.storeId !== storeId) return;
        const patch = extractPatch(store.$state, ev.payload.paths?.length ? ev.payload.paths : cfg.paths);
        sendPatch(patch, [ev.payload.from]);
      });
    }

    /** 监听本地 store 变更 */
    store.$subscribe(
      (_mutation, state) => {
        if (isRemote) return;
        if (cfg.sourceWindow && currentLabel !== cfg.sourceWindow) return;
        const patch = extractPatch(state, cfg.paths);
        if (!Object.keys(patch).length) return;
        Object.assign(pendingPatch, patch);
        scheduleSync();
      },
      { detached: true }
    );

    /** 提供手动同步方法 */
    (store as any).$sync = () => {
      
      if (cfg.sourceWindow && currentLabel !== cfg.sourceWindow) {
        emit("pinia-sync-request", {
          storeId,
          from: currentLabel,
          to: cfg.sourceWindow,
          paths: cfg.paths
        });
      } else {
        const patch = extractPatch(store.$state, cfg.paths);
        sendPatch(patch, cfg.targetWindows);
      }
    };

    /** 初始化时拉取或发送 */
    queueMicrotask(() => {
      if (cfg.sourceWindow && currentLabel !== cfg.sourceWindow) {
        emit("pinia-sync-request", {
          storeId,
          from: currentLabel,
          to: cfg.sourceWindow,
          paths: cfg.paths
        });
      } else {
        const patch = extractPatch(store.$state, cfg.paths);
        sendPatch(patch, cfg.targetWindows);
      }
    });
  };
}

const _default: pinia.PiniaPlugin = createPiniaSync();

export { type SyncOptions, createPiniaSync, _default as default };
