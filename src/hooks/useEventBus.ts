import type { Emitter, Handler } from "mitt";
import mitt from "mitt";

/**
 * 事件总线 Hook
 * @typeParam Events - 事件名到参数类型的映射接口
 */
export function useEventBus<Events extends Record<string, any> = Record<string, any>>() {
  // 强制转换为指定 Events 类型的 Emitter
  const emitter: Emitter<any> = mitt();

  /**
   * 发送事件
   * @param event 事件名
   * @param payload 事件参数
   */
  function emit<K extends keyof Events>(event: K, payload: Events[K]) {
    emitter.emit(event as string, payload);
  }

  /**
   * 监听事件
   * @param event 事件名
   * @param handler 回调
   */
  function on<K extends keyof Events>(event: K, handler: Handler<Events[K]>) {
    emitter.on(event as string, handler as Handler<any>);
  }

  /**
   * 取消监听
   * @param event 事件名
   * @param handler 回调
   */
  function off<K extends keyof Events>(event: K, handler: Handler<Events[K]>) {
    emitter.off(event as string, handler as Handler<any>);
  }

  return { emit, on, off };
}

export const globalEventBus = useEventBus();
