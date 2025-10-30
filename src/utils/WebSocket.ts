import Log from "@/utils/Log.ts";


/**
 * https://blog.csdn.net/weixin_46184095/article/details/138122164
 *
 * WebSocket 连接工具类
 */
export interface WebSocketChatParams {
  url: string, // websocket 连接
  onmessage: (event: any) => void,// 消息处理函数
  onopen: () => void,// 成功建立链接函数
  onerror: (event: any) => void,// 异常处理函数
  onclose: () => void,// 关闭处理函数
}

/**
 * WebSocket 连接实例
 */
export default class WebSocketService {

  private socketTask: any | WebSocket; // WebSocket连接对象
  private setIntervalPing: any | NodeJS.Timeout;   // 定时器

  constructor() {
  }

  // 建立链接
  connect(params: WebSocketChatParams) {
    // 判断是否已经启动
    if (this.socketTask && this.socketTask.readyState !== WebSocket.CLOSED) {
      this.disconnect(); // 确保旧连接断开
      Log.colorLog("websocket", "正在重新建立WebSocket连接", "info");
    } else {
      Log.colorLog("websocket", "正在建立WebSocket连接", "info");
    }

    this.socketTask = new WebSocket(params.url);

    if (this.socketTask) {

      this.socketTask.onopen = () => {
        console.log("WebSocket 连接已开启");
        params.onopen();
      };

      this.socketTask.onmessage = (result: any) => {
        console.log("收到消息：", result.data);
        params.onmessage(result);
      };

      this.socketTask.onerror = (error: any) => {
        console.error("WebSocket 错误：", error);
        params.onerror(error);
      };

      this.socketTask.onclose = () => {
        console.log("WebSocket 连接已关闭");
        params.onclose();
      };
    }
  }

  // 断开连接
  disconnect(code?: number, reason?: string) {
    if (this.socketTask) {
      this.socketTask.close({
        code: code || 1000, // Normal closure
        reason: reason || "Client initiated close"
      });
      console.log("关闭 WebSocket 连接");
    }
  }

  // 发送消息
  sendMessage(message: any) {
    if (this.socketTask && this.socketTask.readyState === WebSocket.OPEN) {
      this.socketTask.send(JSON.stringify(message));
    } else if (this.socketTask && this.socketTask.readyState === WebSocket.CONNECTING) {
      this.connecting(message);
    } else {
      Log.colorLog("websocket", "WebSocket 连接未开启或已关闭，无法发送消息", "error");
    }
  }

  // 发送心跳
  sendPing(heartbeat: any = "ping", time: number = 30000) {
    clearInterval(this.setIntervalPing);
    this.setIntervalPing = setInterval(() => {
      if (this.socketTask && this.socketTask.readyState === WebSocket.OPEN) {
        this.socketTask.send(JSON.stringify(heartbeat));
        Log.colorLog("websocket", `当前时间: ${currentDate()} WebSocket发送心跳中...`, "info");
      } else if (this.socketTask && this.socketTask.readyState === WebSocket.CONNECTING) {
        setTimeout(() => {
          this.sendPing(heartbeat, time);
        }, 1000);
      }
    }, time);
  };


  // 判断是否连接
  isConnected(): boolean {
    if (!this.socketTask) {
      Log.colorLog("websocket", "WebSocket 连接未开启", "error");
      return false;
    }
    const flag = this.socketTask.readyState == WebSocket.OPEN;
    if (flag) {
      Log.colorLog("websocket", "WebSocket 连接已开启", "info");
    }
    return flag;
  }


  // 发送连接
  private connecting = (message: any) => {
    setTimeout(() => {
      if (this.socketTask.readyState === WebSocket.CONNECTING) {
        this.connecting(message);
      } else {
        this.socketTask.send(JSON.stringify(message));
      }
    }, 1000);
  };


}


/**
 * 当前时间
 */
function currentDate() {
  const d = new Date();
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate();
  const hour = d.getHours().toString().padStart(2, "0");
  const minute = d.getMinutes().toString().padStart(2, "0");
  const second = d.getSeconds().toString().padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}








