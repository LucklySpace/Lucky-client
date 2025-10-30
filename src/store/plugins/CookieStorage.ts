// cookieStorage.js
/**
 *  为 pinia-plugin-persistedstate 插件自定义 storage 存储器对象 cookieStorage，
 *  自定义存储器对象，必须按以下要求实现 setItem 和 getItem 方法，并且在这两个方法调用设置/读取 cookie 等
 *  本地存储的方法必须是同步的，不能是异步的，
 *  这里使用 js-cookie 第三方 cookie 操作包实现自定义 storage 存储器对象 cookieStorage
 */
import Cookie from "js-cookie";

export const cookieStorage = {
  // 参数 key 为 userStore.js 中 persist 配置项中保存到 storage 存储中的 key 键名
  // 参数 state 为 userStore.js 中 persist 配置项中要持久化到 storage 的 state 属性名，不是全部 state
  setItem(key: string, state: any) {
    // console.log('cookieStorage setItem state:', state)
    // js-cookie 包 setItem 方法的第三个参数配置对象解释：
    // expires: 为数字时表示过期天数，缺少该参数，表示仅会话期间有效，支持 new Date 对象及其字符串格式
    // path：默认值为/，表示全站点所有路径页面可操作该 cookie，为 '' 空值表示仅当前页面可操作该 cookie
    // domain：缺省该参数默认值为当前域名及其子域名可操作该 cookie
    // return Cookie.setItem(key, state, { expires: 9999, path: '/', domain: '' })
    return Cookie.set(key, state);

  },
  getItem(key: string) {  // 首次自动加载这个自定义cookie存储器时， getItem 方法比 setItem 方法先执行
    // console.log('cookieStorage getItem:', key, Cookie.get(key))
    let value = Cookie.get(key) || "{}";
    // js-cookie 工具包 get 方法返回字符串，而 vue-cookies 工具包则返回对象
    value = typeof value == "object" ? value : JSON.parse(value);
    // 存储器的这个 getItem 方法需返回字符串
    return JSON.stringify(value);
  },

  removeItem(key: string) {
    Cookie.remove(key);
  }
};
