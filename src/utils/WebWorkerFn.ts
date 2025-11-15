import { ref, Ref } from "vue";

// 定义 Web Worker 的状态类型
type WebWorkerStatus = "PENDING" | "SUCCESS" | "RUNNING" | "ERROR" | "TIMEOUT_EXPIRED";

// 定义传入选项的接口
interface UseWebWorkerOptions {
  /**
   * 在一定的毫秒数后终止 Worker
   *
   * @default undefined
   */
  timeout?: number;
  /**
   * 运行 Worker 所需的外部依赖数组
   */
  dependencies?: string[];
  /**
   * 运行 Worker 所需的本地依赖数组
   */
  localDependencies?: Function[];
}

// useWebWorkerFn 函数的主实现
export function useWebWorkerFn<T extends (...fnArgs: any[]) => any>(
  fn: T,
  options?: UseWebWorkerOptions
) {
  // 用于存储 Worker 的状态
  const workerStatus: Ref<WebWorkerStatus> = ref("PENDING");
  let worker: Worker | null = null;
  let timeoutId: number | null = null;

  // 创建 Web Worker 的函数
  const createWorker = () => {
    const functionBody = `
      self.onmessage = async (e) => {
        const fn = ${fn.toString()};
        try {
          const result = await fn(...e.data);
          self.postMessage({ result });
        } catch (error) {
          self.postMessage({ error: error.message });
        }
      };
    `;

    // 将函数体转换为 Blob，并创建 Web Worker
    const blob = new Blob([functionBody], { type: "application/javascript" });
    worker = new Worker(URL.createObjectURL(blob));
  };

  // 触发 Web Worker 执行函数并返回 Promise 的函数
  const workerFn = (...fnArgs: Parameters<T>): Promise<ReturnType<T>> => {
    return new Promise((resolve, reject) => {
      if (!worker) {
        createWorker();
      }

      workerStatus.value = "RUNNING";

      // 当 Worker 返回消息时处理结果或错误
      worker!.onmessage = (e) => {
        if (e.data.error) {
          workerStatus.value = "ERROR";
          reject(new Error(e.data.error));
        } else {
          workerStatus.value = "SUCCESS";
          resolve(e.data.result);
        }
        clearWorker();
      };

      // 当 Worker 遇到错误时的处理
      worker!.onerror = (e) => {
        workerStatus.value = "ERROR";
        reject(new Error(e.message));
        clearWorker();
      };

      // 如果设置了超时选项，启动超时计时器
      if (options?.timeout) {
        timeoutId = window.setTimeout(() => {
          workerStatus.value = "TIMEOUT_EXPIRED";
          worker!.terminate();
          reject(new Error("Worker timeout expired"));
          clearWorker();
        }, options.timeout);
      }

      // 将参数发送给 Worker 进行处理
      worker!.postMessage(fnArgs);
    });
  };

  // 手动终止 Worker 的函数
  const workerTerminate = (status: WebWorkerStatus = "PENDING") => {
    if (worker) {
      worker.terminate();
      clearWorker();
      workerStatus.value = status;
    }
  };

  // 清理 Worker 和超时计时器的函数
  const clearWorker = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    worker = null;
  };

  return {
    workerFn,          // 返回的 Worker 执行函数
    workerStatus,      // Worker 的状态
    workerTerminate   // 终止 Worker 的函数
  };
}


// import { useWebWorkerFn } from './useWebWorkerFn';

// const { workerFn, workerStatus, workerTerminate } = useWebWorkerFn<number, number>(
//   (n) => {
//     return n * n;
//   },
//   {
//     timeout: 5000, // 5秒超时
//   }
// );

// // 执行 Web Worker 函数
// workerFn(5).then(result => {
//   console.log('Result:', result); // 输出 25
// }).catch(error => {
//   console.error('Error:', error);
// });

// // 监控 Worker 状态
// console.log(workerStatus.value); // 输出 'RUNNING'，'SUCCESS'，'ERROR' 等

// // 手动终止 Worker
// workerTerminate();