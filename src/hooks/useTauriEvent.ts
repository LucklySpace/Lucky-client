import { onBeforeUnmount } from "vue";
import { useDebounceFn } from "@vueuse/core";
import {
  emit,
  emitTo,
  type EventCallback,
  type EventName,
  type EventTarget,
  listen,
  once,
  type Options
} from "@tauri-apps/api/event";


/**
 * Vue 3 Hook: 封装 Tauri Event API
 * 自动在组件卸载时取消监听，防止内存泄漏
 */
export function useTauriEvent() {
  const unlistenFns: (() => void)[] = [];

  /**
   * 监听事件（组件卸载时自动取消）
   */
  async function on<T>(event: EventName, handler: EventCallback<T>, options?: Options) {
    const unlisten = await listen<T>(event, handler, options);
    unlistenFns.push(unlisten);
  }

  /**
   * 监听一次事件（组件卸载时自动取消）
   */
  async function onceEvent<T>(event: EventName, handler: EventCallback<T>, options?: Options) {
    const unlisten = await once<T>(event, handler, options);
    unlistenFns.push(unlisten);
  }

  /**
   * 带防抖的 onceEvent
   * @param event 事件名
   * @param handler 回调
   * @param delay 防抖延迟（默认 350ms）
   */
  async function onceEventDebounced<T>(event: EventName, handler: EventCallback<T>, delay = 350, options?: Options) {
    const debouncedHandler = useDebounceFn(handler, delay);
    const unlisten = await once<T>(event, debouncedHandler, options);
    unlistenFns.push(unlisten);
  }

  /**
   * 发送事件
   */
  async function send<T>(event: string, payload?: T) {
    await emit<T>(event, payload);
  }

  /**
   * 发送事件到指定目标
   */
  async function sendTo<T>(target: EventTarget | string, event: string, payload?: T) {
    await emitTo<T>(target, event, payload);
  }

  onBeforeUnmount(() => {
    unlistenFns.forEach(unlisten => unlisten());
    unlistenFns.length = 0;
  });

  return {
    on,
    onceEvent,
    send,
    sendTo,
    onceEventDebounced
  };
}
