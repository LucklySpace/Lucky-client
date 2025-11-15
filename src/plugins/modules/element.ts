import ElementPlus from "element-plus";
import * as ElementPlusIconsVue from "@element-plus/icons-vue";
import { App } from "vue";


export default {
  install: (app: App) => {
    app.use(ElementPlus);
    //增加element 图标
    for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
      app.component(key, component);
    }
  }
};
