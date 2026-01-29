function Mapper(path: string) {
  return function <T extends { new(...args: any[]): {} }>(constructor: T) {

    const url = new URL(path).pathname.replace(".ts", "");
    // 将当前模块路径存储在类的原型中
    constructor.prototype.subClassFilePath = url;
  };
}

export default Mapper;