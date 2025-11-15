const workers: any = {};

/**
 * 加载worker
 * @param workerName worker名称
 * @returns worker
 */
const loadWorker = (workerName: string) => {
  // 判断worker是否存在
  if (!workers[workerName]) {
    // 拼接地址
    let path: string = `./${workerName}.worker.ts`;
    // 获取worker
    const worker: Worker = new Worker(new URL(path, import.meta.url), {
      type: "module"
    });
    workers[workerName] = worker;
  }
  return workers[workerName];
};

export default loadWorker;