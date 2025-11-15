/***
 * 本文介绍了如何使用一个基于同源策略的EventBus类，实现浏览器中跨标签页的事件传递，包括事件注册、广播、处理以及管理订阅和清除功能。
 * 原文链接：https://blog.csdn.net/HuaiCheng9067/article/details/137052023
 * 第一步：注册事件
 * 第二步：广播事件
 * 第三步：处理事件
 */

// source：消息发起源href，将在跨标签页通信时传入
interface callback {
  (data: any, source: any): void;
}

type eventName = string;

class EventBus {
  protected eventMap: any = new Map();
  protected channel: any = new BroadcastChannel("__event-bus");

  // 广播事件
  emit(eventName: eventName, data?: any) {
    this.tryRunCallback(eventName, data);
    // 跨标签页 发送消息
    this.channel.postMessage({ eventName, data, source: location.href });
  }

  // 订阅事件
  on(eventName: eventName, callback: callback) {
    this.register(eventName, callback);
    // 跨标签页 接收订阅消息
    this.channel.onmessage = (event: { data: any }) => {
      const data = event.data;
      this.tryRunCallback(data.eventName, data.data, data.source);
    };
  }

  // 移除某个订阅事件
  off(eventName: eventName, callback: callback) {
    if (!this.eventMap.has(eventName)) return;
    const callbacks = this.eventMap.get(eventName);
    this.eventMap.set(
      eventName,
      callbacks.filter((cb: callback) => cb !== callback)
    );
  }

  // 清除某个事件的所有订阅
  clear(eventName: eventName) {
    this.eventMap.delete(eventName);
  }

  // 清除所有订阅事件
  clearAll() {
    this.eventMap = new Map();
  }

  protected register(eventName: eventName, callback: callback) {
    if (!this.eventMap.has(eventName)) {
      this.eventMap.set(eventName, []);
    }
    this.eventMap.get(eventName).push(callback);
  }

  protected tryRunCallback(eventName: eventName, data: any, source?: string) {
    if (!this.eventMap.has(eventName)) return;
    this.eventMap.get(eventName).forEach((callback: callback) => {
      callback(data, source);
    });
  }
}

export default new EventBus();

// 使用方式
// import Event from "EventBus"

// Event.on('事件名', () => {
//     //....
// })

// Event.emit('事件名', { ...数据 })
