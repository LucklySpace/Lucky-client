import vue from "@vitejs/plugin-vue";
import path from "path";
import { ConfigEnv, defineConfig, loadEnv, UserConfig } from "vite";

import vueDevTools from "vite-plugin-vue-devtools";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import IconsResolver from "unplugin-icons/resolver";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";
import { visualizer } from "rollup-plugin-visualizer";

// 引入本地图标
import { createSvgIconsPlugin } from "vite-plugin-svg-icons";

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(({ mode }: ConfigEnv): UserConfig => {
  const viteEnv = loadEnv(mode, process.cwd());
  return {
    assetsInclude: ["**/*.xml"], // https://cn.vitejs.dev/config/#server-host
    plugins: [
      vue(),
      vueDevTools(),
      // 自动导入参考： https://github.com/sxzz/element-plus-best-practices/blob/main/vite.config.ts
      AutoImport({
        // 自动导入 Vue 相关函数，如：ref, shallowReactive, toRef 等
        imports: ["vue", "@vueuse/core", "pinia", "vue-router", "vue-i18n"],
        resolvers: [
          // 自动导入 Element Plus 相关函数，如：ElMessage, ElMessageBox... (带样式)
          ElementPlusResolver({ importStyle: "sass" }),
          // 自动导入图标组件
          IconsResolver({})
        ],
        eslintrc: {
          // 是否自动生成 eslint 规则，建议生成之后设置 false
          enabled: false,
          // 指定自动导入函数 eslint 规则的文件
          filepath: "./.eslintrc-auto-import.json",
          globalsPropValue: true
        },
        // 是否在 vue 模板中自动导入
        vueTemplate: true,
        // 指定自动导入函数TS类型声明文件路径 (false:关闭自动生成)
        dts: false,
        // 自动导入你自己的模块
        include: [/\.[tj]sx?$/, /\.vue$/, /\.vue\?vue/, /\.md$/],
        dirs: [
          "src/hooks" // 自动导入 hooks 目录下的函数
        ]
        // dts: "src/types/auto-imports.d.ts",
      }),
      // 打包代码视图分析工具
      visualizer({
        open: true, // 注意这里要设置为true，否则无效，如果存在本地服务端口，将在打包后自动展示
        gzipSize: true,
        filename: "stats.html", //分析图生成的文件名
        brotliSize: true
      }),
      Components({
        resolvers: [
          // 自动导入 Element Plus 组件
          ElementPlusResolver(),
          // 自动注册图标组件
          IconsResolver({
            // element-plus图标库，其他图标库 https://icon-sets.iconify.design/
            enabledCollections: ["ep"]
          })
        ],
        // 指定自定义组件位置(默认:src/components)
        dirs: ["src/components", "src/**/components"],
        // 指定自动导入组件TS类型声明文件路径 (false:关闭自动生成)
        dts: false
        // dts: "src/types/components.d.ts",
      }),
      createSvgIconsPlugin({
        // 指定需要缓存的图标文件夹
        iconDirs: [path.resolve(process.cwd(), "src/assets/style/svg")],
        // 指定symbolId格式
        symbolId: "icon-[dir]-[name]"
      })
    ],
    base: "./",
    resolve: {
      //设置别名
      alias: {
        "@": path.resolve(__dirname, "src"),
        "vue-i18n": "vue-i18n/dist/vue-i18n.cjs.js"
      },
      extensions: [".mjs", ".js", ".ts", ".jsx", ".tsx", ".json", ".vue", ".xml"]
    },
    // to make use of `TAURI_DEBUG` and other env variables
    // https://tauri.studio/v1/api/config#buildconfig.beforedevcommand
    envPrefix: ["VITE_", "TAURI_"],
    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent vite from obscuring rust errors
    clearScreen: false,
    worker: {
      format: "es" // ES 模块格式，支持 import
    },
    optimizeDeps: {
      entries: ["release/**/*.{js,ts,jsx,tsx,vue}"],
      include: ["@bufbuild/protobuf", "element-plus"] // 强制引入避免重新加载
    },
    // 2. tauri expects a fixed port, fail if that port is not available
    build: {
      minify: "terser", // 必须开启：使用terserOptions才有效果
      rollupOptions: {
        output: {
          chunkFileNames: "js/[name]-[hash].js",
          entryFileNames: "js/[name]-[hash].js",
          assetFileNames: "static/[ext]/[name]-[hash].[ext]"
        }
      },
      terserOptions: {
        compress: {
          keep_infinity: true, // 防止 Infinity 被压缩成 1/0，这可能会导致 Chrome 上的性能问题
          drop_console: true, // 生产环境去除 console
          drop_debugger: true // 生产环境去除 debugger
        },
        format: {
          comments: false // **移除所有注释**
        }
      }
    },
    css: {
      preprocessorOptions: {
        scss: {
          api: "modern-compiler",
          silenceDeprecations: ["legacy-js-api"]
        }
      }
    },
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
          protocol: "ws",
          host,
          port: 1421
        }
        : undefined,
      watch: {
        // 3. tell vite to ignore watching `src-tauri`
        ignored: ["**/src-tauri/**"]
      }
    }
  };
});
