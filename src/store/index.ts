import piniaSyncWindows from "@/store/plugins/piniaStoreSync";
import { createPinia } from "pinia"; //引入pinia
import piniaPluginPersistedstate from "pinia-plugin-persistedstate"; //引入持久化插件

const pinia = createPinia(); //创建pinia实例
pinia.use(piniaPluginPersistedstate);
pinia.use(piniaSyncWindows);

export default pinia; //导出pinia用于main.js注册
