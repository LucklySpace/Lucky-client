import { App } from "vue";
// 导入vue-virtual-scroller组件及样式
import { RecycleScroller } from "vue-virtual-scroller";
import "vue-virtual-scroller/dist/vue-virtual-scroller.css";

export default {
  install: (app: App) => {
    // 注册RecycleScroller组件
    app.component("RecycleScroller", RecycleScroller);
  }
};
