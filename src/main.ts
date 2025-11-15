import "element-plus/theme-chalk/dark/css-vars.css";
import "@/assets/style/scss/index.scss";
import "@/assets/style/scss/theme.scss";
import "@/assets/style/scss/setting.scss";
import "element-plus/dist/index.css";

// 创建 vue web 容器
import { createApp } from "vue";
import App from "./App.vue";

// 注册 i18n
import { useI18n } from "@/i18n";

// 注册插件
import plugins from "./plugins/index";

// 注册自定义指令
import directive from "@/directive";

// 注册自定义组件
import components from "@/components/index";

// 注册 自定义store
import { getTauriStore } from "@/store/plugins/TauriStorage";

// 主题选择
import { useThemeColor } from "@/hooks/useThemeColor";

async function bootstrap() {
  const app = createApp(App);

  // 应用启动时预先初始化 Store 实例
  await getTauriStore().catch(console.error);

  // 使用插件和组件
  app.use(plugins);
  app.use(directive);
  app.use(components);

  // 在挂载前初始化语言环境, 异步创建并注册 i18n
  const { i18n, initI18n } = useI18n();
  await initI18n();
  app.use(i18n);

  // 初始化主题
  useThemeColor();

  // 最后挂载应用
  app.mount("#app");
}

bootstrap();
