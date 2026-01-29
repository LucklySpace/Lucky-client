// 事务装饰器工厂
function Transaction() {
  // 日志
  const log = useLogger();
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function(...args: any[]) {
      let db = (this as any).db;
      let transaction;
      // 模拟事务开始
      log.prettyInfo("databse", `Transaction started for target: ${target} method: ${propertyKey}`);
      transaction = await db.beginTransaction();
      try {
        // 执行原始方法
        const result = await originalMethod.apply(this, args);
        // 模拟事务提交
        log.prettyInfo("databse", `Transaction committed for method: ${propertyKey}`);
        // 提交事务
        await db.commit();
        return result;
      } catch (error) {
        // 回滚事务
        await db.rollback();
        log.prettyError("databse", `Transaction rolled back for method: ${propertyKey}`);
        throw error;
      }
    };

    return descriptor;
  };
}

export { Transaction };

//   // 使用装饰器的类
//   class UserService {
//     @Transaction
//     addUser(user: any) {
//       // 模拟添加用户逻辑
//       console.log(`Adding user: ${user.name}`);
//     }
//   }

//   // 使用装饰器
//   const userService = new UserService();
//   userService.addUser({ name: 'John Doe' });
