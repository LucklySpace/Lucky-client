/**
 * EventBus 事件总线
 * 支持跨标签页通信的事件管理器
 * 使用 BroadcastChannel API 实现同源标签页间的消息传递
 */

/**
 * 事件回调函数类型
 * @param data 事件数据
 * @param source 消息来源（跨标签页时传递页面 URL）
 */
type EventCallback<T = any> = (data: T, source?: string) => void;

/**
 * 事件名称类型
 */
type EventName = string | symbol;

/**
 * BroadcastChannel 消息格式
 */
interface BroadcastMessage<T = any> {
  eventName: EventName;
  data: T;
  source: string;
}

/**
 * 事件总线类
 * 提供事件的发布、订阅、取消订阅功能
 * 支持同源标签页间的事件广播
 */
class EventBus {
  /**
   * 事件映射表
   */
  private eventMap: Map<EventName, Set<EventCallback>> = new Map();

  /**
   * BroadcastChannel 实例（用于跨标签页通信）
   */
  private channel: BroadcastChannel | null = null;

  /**
   * 是否已初始化 BroadcastChannel
   */
  private channelInitialized = false;

  constructor(channelName: string = "__event-bus") {
    this.initBroadcastChannel(channelName);
  }

  /**
   * 初始化 BroadcastChannel
   * @param channelName 频道名称
   */
  private initBroadcastChannel(channelName: string): void {
    if (typeof BroadcastChannel === "undefined") {
      console.warn("BroadcastChannel is not supported in this environment");
      return;
    }

    try {
      this.channel = new BroadcastChannel(channelName);
      
      // 接收跨标签页消息
      this.channel.onmessage = (event: MessageEvent<BroadcastMessage>) => {
        try {
          const { eventName, data, source } = event.data;
          this.tryRunCallback(eventName, data, source);
        } catch (error) {
          console.error("EventBus: Error handling broadcast message", error);
        }
      };

      this.channel.onmessageerror = (event) => {
        console.error("EventBus: BroadcastChannel message error", event);
      };

      this.channelInitialized = true;
    } catch (error) {
      console.error("EventBus: Failed to create BroadcastChannel", error);
    }
  }

  /**
   * 发布事件
   * @param eventName 事件名称
   * @param data 事件数据
   */
  emit<T = any>(eventName: EventName, data?: T): void {
    // 本地触发回调
    this.tryRunCallback(eventName, data);

    // 跨标签页广播
    if (this.channelInitialized && this.channel) {
      try {
        const message: BroadcastMessage<T> = {
          eventName,
          data: data as T,
          source: location.href
        };
        this.channel.postMessage(message);
      } catch (error) {
        console.error("EventBus: Failed to broadcast message", error);
      }
    }
  }

  /**
   * 订阅事件
   * @param eventName 事件名称
   * @param callback 回调函数
   * @returns 取消订阅的函数
   */
  on<T = any>(eventName: EventName, callback: EventCallback<T>): () => void {
    this.register(eventName, callback);

    // 返回取消订阅函数
    return () => this.off(eventName, callback);
  }

  /**
   * 订阅一次性事件
   * @param eventName 事件名称
   * @param callback 回调函数
   */
  once<T = any>(eventName: EventName, callback: EventCallback<T>): void {
    const onceWrapper: EventCallback<T> = (data, source) => {
      callback(data, source);
      this.off(eventName, onceWrapper);
    };
    this.on(eventName, onceWrapper);
  }

  /**
   * 取消订阅事件
   * @param eventName 事件名称
   * @param callback 回调函数（不传则移除所有回调）
   */
  off(eventName: EventName, callback?: EventCallback): void {
    if (!this.eventMap.has(eventName)) return;

    if (!callback) {
      // 未传入回调则清除该事件的所有监听器
      this.eventMap.delete(eventName);
      return;
    }

    const callbacks = this.eventMap.get(eventName);
    if (callbacks) {
      callbacks.delete(callback);
      
      // 如果没有剩余回调，删除该事件
      if (callbacks.size === 0) {
        this.eventMap.delete(eventName);
      }
    }
  }

  /**
   * 清除某个事件的所有订阅
   * @param eventName 事件名称
   */
  clear(eventName: EventName): void {
    this.eventMap.delete(eventName);
  }

  /**
   * 清除所有订阅事件
   */
  clearAll(): void {
    this.eventMap.clear();
  }

  /**
   * 获取某个事件的监听器数量
   * @param eventName 事件名称
   */
  listenerCount(eventName: EventName): number {
    return this.eventMap.get(eventName)?.size ?? 0;
  }

  /**
   * 获取所有事件名称
   */
  eventNames(): EventName[] {
    return Array.from(this.eventMap.keys());
  }

  /**
   * 注册事件回调
   * @param eventName 事件名称
   * @param callback 回调函数
   */
  private register(eventName: EventName, callback: EventCallback): void {
    if (!this.eventMap.has(eventName)) {
      this.eventMap.set(eventName, new Set());
    }
    this.eventMap.get(eventName)!.add(callback);
  }

  /**
   * 尝试执行回调函数
   * @param eventName 事件名称
   * @param data 事件数据
   * @param source 消息来源
   */
  private tryRunCallback(eventName: EventName, data: any, source?: string): void {
    const callbacks = this.eventMap.get(eventName);
    if (!callbacks || callbacks.size === 0) return;

    callbacks.forEach((callback) => {
      try {
        callback(data, source);
      } catch (error) {
        console.error(`EventBus: Error executing callback for event "${String(eventName)}"`, error);
      }
    });
  }

  /**
   * 销毁 EventBus 实例
   * 清除所有事件监听并关闭 BroadcastChannel
   */
  destroy(): void {
    this.clearAll();
    
    if (this.channel) {
      this.channel.close();
      this.channel = null;
      this.channelInitialized = false;
    }
  }
}

/**
 * 默认导出 EventBus 单例
 */
export default new EventBus();
