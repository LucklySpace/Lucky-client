import "@/assets/style/scss/index.scss";
import "@/assets/style/scss/setting.scss";
import "@/assets/style/scss/theme.scss";
import "element-plus/dist/index.css";
import "element-plus/theme-chalk/dark/css-vars.css";

// 创建 vue web 容器
import { createApp } from "vue";
import App from "./App.vue";

// 全局错误处理
import errorHandler from "./utils/ErrorHandler";
import { ErrorCaptureConfig } from "./utils/ErrorTypes";

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

/**
 * 应用启动入口
 * 负责初始化 Vue 应用及其依赖项
 */
async function bootstrap(): Promise<void> {
  try {
    const app = createApp(App);

    // 配置全局捕获规则
    const captureConfig: ErrorCaptureConfig = {
      enableVueError: true,
      enablePromiseError: true,
      enableScriptError: true,
    };

    // 初始化全局错误捕获(最先执行)
    errorHandler.initGlobalCapture(app, captureConfig);

    // 应用启动时预先初始化 Store 实例
    try {
      await getTauriStore();
    } catch (error) {
      console.error("初始化 Tauri Store 失败:", error);
    }

    // 使用插件和组件
    app.use(plugins);
    app.use(directive);
    app.use(components);

    // 在挂载前初始化语言环境, 异步创建并注册 i18n
    try {
      const { i18n, initI18n } = useI18n();
      await initI18n();
      app.use(i18n);
    } catch (error) {
      console.error("初始化 i18n 失败:", error);
      throw error;
    }

    // 初始化主题
    try {
      useThemeColor();
    } catch (error) {
      console.warn("初始化主题失败:", error);
    }

    // 最后挂载应用
    app.mount("#app");

    console.info("应用启动成功");
  } catch (error) {
    console.error("应用启动失败:", error);
    // 可以在这里显示错误提示界面
    document.body.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: Arial, sans-serif;">
        <div style="text-align: center;">
          <h1 style="color: #f56c6c;">应用启动失败</h1>
          <p style="color: #909399;">请刷新页面重试或联系技术支持</p>
          <p style="color: #909399; font-size: 12px;">${error instanceof Error ? error.message : '未知错误'}</p>
        </div>
      </div>
    `;
  }
}

// 启动应用
bootstrap();
