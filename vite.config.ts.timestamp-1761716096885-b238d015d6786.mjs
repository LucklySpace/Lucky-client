// vite.config.ts
import vue from "file:///D:/front/Lucky/Lucky-client/node_modules/.pnpm/@vitejs+plugin-vue@5.2.4_vi_a668a6116e671568741446bf19546343/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import path from "path";
import { defineConfig, loadEnv } from "file:///D:/front/Lucky/Lucky-client/node_modules/.pnpm/vite@5.4.21_@types+node@20.19.23_sass@1.93.2_terser@5.44.0/node_modules/vite/dist/node/index.js";
import vueDevTools from "file:///D:/front/Lucky/Lucky-client/node_modules/.pnpm/vite-plugin-vue-devtools@7._8d38e47983e79f79f2a96cd2d2a03ed4/node_modules/vite-plugin-vue-devtools/dist/vite.mjs";
import AutoImport from "file:///D:/front/Lucky/Lucky-client/node_modules/.pnpm/unplugin-auto-import@0.17.8_a506fca0c879feff2ed9e622ba0a1a61/node_modules/unplugin-auto-import/dist/vite.js";
import Components from "file:///D:/front/Lucky/Lucky-client/node_modules/.pnpm/unplugin-vue-components@0.2_73812fe952a4563a3043d35c598292d4/node_modules/unplugin-vue-components/dist/vite.js";
import IconsResolver from "file:///D:/front/Lucky/Lucky-client/node_modules/.pnpm/unplugin-icons@0.18.5_@vue+compiler-sfc@3.5.22/node_modules/unplugin-icons/dist/resolver.js";
import { ElementPlusResolver } from "file:///D:/front/Lucky/Lucky-client/node_modules/.pnpm/unplugin-vue-components@0.2_73812fe952a4563a3043d35c598292d4/node_modules/unplugin-vue-components/dist/resolvers.js";
import { visualizer } from "file:///D:/front/Lucky/Lucky-client/node_modules/.pnpm/rollup-plugin-visualizer@6.0.5_rollup@4.52.5/node_modules/rollup-plugin-visualizer/dist/plugin/index.js";
import { createSvgIconsPlugin } from "file:///D:/front/Lucky/Lucky-client/node_modules/.pnpm/vite-plugin-svg-icons@2.0.1_ec81f854e35a6d58f9620bac288f1b20/node_modules/vite-plugin-svg-icons/dist/index.mjs";
var __vite_injected_original_dirname = "D:\\front\\Lucky\\Lucky-client";
var host = process.env.TAURI_DEV_HOST;
var vite_config_default = defineConfig(({ mode }) => {
  const viteEnv = loadEnv(mode, process.cwd());
  return {
    assetsInclude: ["**/*.xml"],
    // https://cn.vitejs.dev/config/#server-host
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
          "src/hooks"
          // 自动导入 hooks 目录下的函数
        ]
        // dts: "src/types/auto-imports.d.ts",
      }),
      // 打包代码视图分析工具
      visualizer({
        open: true,
        // 注意这里要设置为true，否则无效，如果存在本地服务端口，将在打包后自动展示
        gzipSize: true,
        filename: "stats.html",
        //分析图生成的文件名
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
        "@": path.resolve(__vite_injected_original_dirname, "src"),
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
      format: "es"
      // ES 模块格式，支持 import
    },
    optimizeDeps: {
      entries: ["release/**/*.{js,ts,jsx,tsx,vue}"],
      include: ["@bufbuild/protobuf", "element-plus"]
      // 强制引入避免重新加载
    },
    // 2. tauri expects a fixed port, fail if that port is not available
    build: {
      minify: "terser",
      // 必须开启：使用terserOptions才有效果
      rollupOptions: {
        output: {
          chunkFileNames: "js/[name]-[hash].js",
          entryFileNames: "js/[name]-[hash].js",
          assetFileNames: "static/[ext]/[name]-[hash].[ext]"
        }
      },
      terserOptions: {
        compress: {
          keep_infinity: true,
          // 防止 Infinity 被压缩成 1/0，这可能会导致 Chrome 上的性能问题
          drop_console: true,
          // 生产环境去除 console
          drop_debugger: true
          // 生产环境去除 debugger
        },
        format: {
          comments: false
          // **移除所有注释**
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
      hmr: host ? {
        protocol: "ws",
        host,
        port: 1421
      } : void 0,
      watch: {
        // 3. tell vite to ignore watching `src-tauri`
        ignored: ["**/src-tauri/**"]
      }
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxmcm9udFxcXFxMdWNreVxcXFxMdWNreS1jbGllbnRcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkQ6XFxcXGZyb250XFxcXEx1Y2t5XFxcXEx1Y2t5LWNsaWVudFxcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vRDovZnJvbnQvTHVja3kvTHVja3ktY2xpZW50L3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHZ1ZSBmcm9tIFwiQHZpdGVqcy9wbHVnaW4tdnVlXCI7XHJcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XHJcbmltcG9ydCB7IENvbmZpZ0VudiwgZGVmaW5lQ29uZmlnLCBsb2FkRW52LCBVc2VyQ29uZmlnIH0gZnJvbSBcInZpdGVcIjtcclxuXHJcbmltcG9ydCB2dWVEZXZUb29scyBmcm9tIFwidml0ZS1wbHVnaW4tdnVlLWRldnRvb2xzXCI7XHJcbmltcG9ydCBBdXRvSW1wb3J0IGZyb20gXCJ1bnBsdWdpbi1hdXRvLWltcG9ydC92aXRlXCI7XHJcbmltcG9ydCBDb21wb25lbnRzIGZyb20gXCJ1bnBsdWdpbi12dWUtY29tcG9uZW50cy92aXRlXCI7XHJcbmltcG9ydCBJY29uc1Jlc29sdmVyIGZyb20gXCJ1bnBsdWdpbi1pY29ucy9yZXNvbHZlclwiO1xyXG5pbXBvcnQgeyBFbGVtZW50UGx1c1Jlc29sdmVyIH0gZnJvbSBcInVucGx1Z2luLXZ1ZS1jb21wb25lbnRzL3Jlc29sdmVyc1wiO1xyXG5pbXBvcnQgeyB2aXN1YWxpemVyIH0gZnJvbSBcInJvbGx1cC1wbHVnaW4tdmlzdWFsaXplclwiO1xyXG5cclxuLy8gXHU1RjE1XHU1MTY1XHU2NzJDXHU1NzMwXHU1NkZFXHU2ODA3XHJcbmltcG9ydCB7IGNyZWF0ZVN2Z0ljb25zUGx1Z2luIH0gZnJvbSBcInZpdGUtcGx1Z2luLXN2Zy1pY29uc1wiO1xyXG5cclxuY29uc3QgaG9zdCA9IHByb2Nlc3MuZW52LlRBVVJJX0RFVl9IT1NUO1xyXG5cclxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKCh7IG1vZGUgfTogQ29uZmlnRW52KTogVXNlckNvbmZpZyA9PiB7XHJcbiAgY29uc3Qgdml0ZUVudiA9IGxvYWRFbnYobW9kZSwgcHJvY2Vzcy5jd2QoKSk7XHJcbiAgcmV0dXJuIHtcclxuICAgIGFzc2V0c0luY2x1ZGU6IFtcIioqLyoueG1sXCJdLCAvLyBodHRwczovL2NuLnZpdGVqcy5kZXYvY29uZmlnLyNzZXJ2ZXItaG9zdFxyXG4gICAgcGx1Z2luczogW1xyXG4gICAgICB2dWUoKSxcclxuICAgICAgdnVlRGV2VG9vbHMoKSxcclxuICAgICAgLy8gXHU4MUVBXHU1MkE4XHU1QkZDXHU1MTY1XHU1M0MyXHU4MDAzXHVGRjFBIGh0dHBzOi8vZ2l0aHViLmNvbS9zeHp6L2VsZW1lbnQtcGx1cy1iZXN0LXByYWN0aWNlcy9ibG9iL21haW4vdml0ZS5jb25maWcudHNcclxuICAgICAgQXV0b0ltcG9ydCh7XHJcbiAgICAgICAgLy8gXHU4MUVBXHU1MkE4XHU1QkZDXHU1MTY1IFZ1ZSBcdTc2RjhcdTUxNzNcdTUxRkRcdTY1NzBcdUZGMENcdTU5ODJcdUZGMUFyZWYsIHNoYWxsb3dSZWFjdGl2ZSwgdG9SZWYgXHU3QjQ5XHJcbiAgICAgICAgaW1wb3J0czogW1widnVlXCIsIFwiQHZ1ZXVzZS9jb3JlXCIsIFwicGluaWFcIiwgXCJ2dWUtcm91dGVyXCIsIFwidnVlLWkxOG5cIl0sXHJcbiAgICAgICAgcmVzb2x2ZXJzOiBbXHJcbiAgICAgICAgICAvLyBcdTgxRUFcdTUyQThcdTVCRkNcdTUxNjUgRWxlbWVudCBQbHVzIFx1NzZGOFx1NTE3M1x1NTFGRFx1NjU3MFx1RkYwQ1x1NTk4Mlx1RkYxQUVsTWVzc2FnZSwgRWxNZXNzYWdlQm94Li4uIChcdTVFMjZcdTY4MzdcdTVGMEYpXHJcbiAgICAgICAgICBFbGVtZW50UGx1c1Jlc29sdmVyKHsgaW1wb3J0U3R5bGU6IFwic2Fzc1wiIH0pLFxyXG4gICAgICAgICAgLy8gXHU4MUVBXHU1MkE4XHU1QkZDXHU1MTY1XHU1NkZFXHU2ODA3XHU3RUM0XHU0RUY2XHJcbiAgICAgICAgICBJY29uc1Jlc29sdmVyKHt9KVxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgZXNsaW50cmM6IHtcclxuICAgICAgICAgIC8vIFx1NjYyRlx1NTQyNlx1ODFFQVx1NTJBOFx1NzUxRlx1NjIxMCBlc2xpbnQgXHU4OUM0XHU1MjE5XHVGRjBDXHU1RUZBXHU4QkFFXHU3NTFGXHU2MjEwXHU0RTRCXHU1NDBFXHU4QkJFXHU3RjZFIGZhbHNlXHJcbiAgICAgICAgICBlbmFibGVkOiBmYWxzZSxcclxuICAgICAgICAgIC8vIFx1NjMwN1x1NUI5QVx1ODFFQVx1NTJBOFx1NUJGQ1x1NTE2NVx1NTFGRFx1NjU3MCBlc2xpbnQgXHU4OUM0XHU1MjE5XHU3Njg0XHU2NTg3XHU0RUY2XHJcbiAgICAgICAgICBmaWxlcGF0aDogXCIuLy5lc2xpbnRyYy1hdXRvLWltcG9ydC5qc29uXCIsXHJcbiAgICAgICAgICBnbG9iYWxzUHJvcFZhbHVlOiB0cnVlXHJcbiAgICAgICAgfSxcclxuICAgICAgICAvLyBcdTY2MkZcdTU0MjZcdTU3MjggdnVlIFx1NkEyMVx1Njc3Rlx1NEUyRFx1ODFFQVx1NTJBOFx1NUJGQ1x1NTE2NVxyXG4gICAgICAgIHZ1ZVRlbXBsYXRlOiB0cnVlLFxyXG4gICAgICAgIC8vIFx1NjMwN1x1NUI5QVx1ODFFQVx1NTJBOFx1NUJGQ1x1NTE2NVx1NTFGRFx1NjU3MFRTXHU3QzdCXHU1NzhCXHU1OEYwXHU2NjBFXHU2NTg3XHU0RUY2XHU4REVGXHU1Rjg0IChmYWxzZTpcdTUxNzNcdTk1RURcdTgxRUFcdTUyQThcdTc1MUZcdTYyMTApXHJcbiAgICAgICAgZHRzOiBmYWxzZSxcclxuICAgICAgICAvLyBcdTgxRUFcdTUyQThcdTVCRkNcdTUxNjVcdTRGNjBcdTgxRUFcdTVERjFcdTc2ODRcdTZBMjFcdTU3NTdcclxuICAgICAgICBpbmNsdWRlOiBbL1xcLlt0al1zeD8kLywgL1xcLnZ1ZSQvLCAvXFwudnVlXFw/dnVlLywgL1xcLm1kJC9dLFxyXG4gICAgICAgIGRpcnM6IFtcclxuICAgICAgICAgIFwic3JjL2hvb2tzXCIgLy8gXHU4MUVBXHU1MkE4XHU1QkZDXHU1MTY1IGhvb2tzIFx1NzZFRVx1NUY1NVx1NEUwQlx1NzY4NFx1NTFGRFx1NjU3MFxyXG4gICAgICAgIF1cclxuICAgICAgICAvLyBkdHM6IFwic3JjL3R5cGVzL2F1dG8taW1wb3J0cy5kLnRzXCIsXHJcbiAgICAgIH0pLFxyXG4gICAgICAvLyBcdTYyNTNcdTUzMDVcdTRFRTNcdTc4MDFcdTg5QzZcdTU2RkVcdTUyMDZcdTY3OTBcdTVERTVcdTUxNzdcclxuICAgICAgdmlzdWFsaXplcih7XHJcbiAgICAgICAgb3BlbjogdHJ1ZSwgLy8gXHU2Q0U4XHU2MTBGXHU4RkQ5XHU5MUNDXHU4OTgxXHU4QkJFXHU3RjZFXHU0RTNBdHJ1ZVx1RkYwQ1x1NTQyNlx1NTIxOVx1NjVFMFx1NjU0OFx1RkYwQ1x1NTk4Mlx1Njc5Q1x1NUI1OFx1NTcyOFx1NjcyQ1x1NTczMFx1NjcwRFx1NTJBMVx1N0FFRlx1NTNFM1x1RkYwQ1x1NUMwNlx1NTcyOFx1NjI1M1x1NTMwNVx1NTQwRVx1ODFFQVx1NTJBOFx1NUM1NVx1NzkzQVxyXG4gICAgICAgIGd6aXBTaXplOiB0cnVlLFxyXG4gICAgICAgIGZpbGVuYW1lOiBcInN0YXRzLmh0bWxcIiwgLy9cdTUyMDZcdTY3OTBcdTU2RkVcdTc1MUZcdTYyMTBcdTc2ODRcdTY1ODdcdTRFRjZcdTU0MERcclxuICAgICAgICBicm90bGlTaXplOiB0cnVlXHJcbiAgICAgIH0pLFxyXG4gICAgICBDb21wb25lbnRzKHtcclxuICAgICAgICByZXNvbHZlcnM6IFtcclxuICAgICAgICAgIC8vIFx1ODFFQVx1NTJBOFx1NUJGQ1x1NTE2NSBFbGVtZW50IFBsdXMgXHU3RUM0XHU0RUY2XHJcbiAgICAgICAgICBFbGVtZW50UGx1c1Jlc29sdmVyKCksXHJcbiAgICAgICAgICAvLyBcdTgxRUFcdTUyQThcdTZDRThcdTUxOENcdTU2RkVcdTY4MDdcdTdFQzRcdTRFRjZcclxuICAgICAgICAgIEljb25zUmVzb2x2ZXIoe1xyXG4gICAgICAgICAgICAvLyBlbGVtZW50LXBsdXNcdTU2RkVcdTY4MDdcdTVFOTNcdUZGMENcdTUxNzZcdTRFRDZcdTU2RkVcdTY4MDdcdTVFOTMgaHR0cHM6Ly9pY29uLXNldHMuaWNvbmlmeS5kZXNpZ24vXHJcbiAgICAgICAgICAgIGVuYWJsZWRDb2xsZWN0aW9uczogW1wiZXBcIl1cclxuICAgICAgICAgIH0pXHJcbiAgICAgICAgXSxcclxuICAgICAgICAvLyBcdTYzMDdcdTVCOUFcdTgxRUFcdTVCOUFcdTRFNDlcdTdFQzRcdTRFRjZcdTRGNERcdTdGNkUoXHU5RUQ4XHU4QkE0OnNyYy9jb21wb25lbnRzKVxyXG4gICAgICAgIGRpcnM6IFtcInNyYy9jb21wb25lbnRzXCIsIFwic3JjLyoqL2NvbXBvbmVudHNcIl0sXHJcbiAgICAgICAgLy8gXHU2MzA3XHU1QjlBXHU4MUVBXHU1MkE4XHU1QkZDXHU1MTY1XHU3RUM0XHU0RUY2VFNcdTdDN0JcdTU3OEJcdTU4RjBcdTY2MEVcdTY1ODdcdTRFRjZcdThERUZcdTVGODQgKGZhbHNlOlx1NTE3M1x1OTVFRFx1ODFFQVx1NTJBOFx1NzUxRlx1NjIxMClcclxuICAgICAgICBkdHM6IGZhbHNlXHJcbiAgICAgICAgLy8gZHRzOiBcInNyYy90eXBlcy9jb21wb25lbnRzLmQudHNcIixcclxuICAgICAgfSksXHJcbiAgICAgIGNyZWF0ZVN2Z0ljb25zUGx1Z2luKHtcclxuICAgICAgICAvLyBcdTYzMDdcdTVCOUFcdTk3MDBcdTg5ODFcdTdGMTNcdTVCNThcdTc2ODRcdTU2RkVcdTY4MDdcdTY1ODdcdTRFRjZcdTU5MzlcclxuICAgICAgICBpY29uRGlyczogW3BhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBcInNyYy9hc3NldHMvc3R5bGUvc3ZnXCIpXSxcclxuICAgICAgICAvLyBcdTYzMDdcdTVCOUFzeW1ib2xJZFx1NjgzQ1x1NUYwRlxyXG4gICAgICAgIHN5bWJvbElkOiBcImljb24tW2Rpcl0tW25hbWVdXCJcclxuICAgICAgfSlcclxuICAgIF0sXHJcbiAgICBiYXNlOiBcIi4vXCIsXHJcbiAgICByZXNvbHZlOiB7XHJcbiAgICAgIC8vXHU4QkJFXHU3RjZFXHU1MjJCXHU1NDBEXHJcbiAgICAgIGFsaWFzOiB7XHJcbiAgICAgICAgXCJAXCI6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsIFwic3JjXCIpLFxyXG4gICAgICAgIFwidnVlLWkxOG5cIjogXCJ2dWUtaTE4bi9kaXN0L3Z1ZS1pMThuLmNqcy5qc1wiXHJcbiAgICAgIH0sXHJcbiAgICAgIGV4dGVuc2lvbnM6IFtcIi5tanNcIiwgXCIuanNcIiwgXCIudHNcIiwgXCIuanN4XCIsIFwiLnRzeFwiLCBcIi5qc29uXCIsIFwiLnZ1ZVwiLCBcIi54bWxcIl1cclxuICAgIH0sXHJcbiAgICAvLyB0byBtYWtlIHVzZSBvZiBgVEFVUklfREVCVUdgIGFuZCBvdGhlciBlbnYgdmFyaWFibGVzXHJcbiAgICAvLyBodHRwczovL3RhdXJpLnN0dWRpby92MS9hcGkvY29uZmlnI2J1aWxkY29uZmlnLmJlZm9yZWRldmNvbW1hbmRcclxuICAgIGVudlByZWZpeDogW1wiVklURV9cIiwgXCJUQVVSSV9cIl0sXHJcbiAgICAvLyBWaXRlIG9wdGlvbnMgdGFpbG9yZWQgZm9yIFRhdXJpIGRldmVsb3BtZW50IGFuZCBvbmx5IGFwcGxpZWQgaW4gYHRhdXJpIGRldmAgb3IgYHRhdXJpIGJ1aWxkYFxyXG4gICAgLy9cclxuICAgIC8vIDEuIHByZXZlbnQgdml0ZSBmcm9tIG9ic2N1cmluZyBydXN0IGVycm9yc1xyXG4gICAgY2xlYXJTY3JlZW46IGZhbHNlLFxyXG4gICAgd29ya2VyOiB7XHJcbiAgICAgIGZvcm1hdDogXCJlc1wiIC8vIEVTIFx1NkEyMVx1NTc1N1x1NjgzQ1x1NUYwRlx1RkYwQ1x1NjUyRlx1NjMwMSBpbXBvcnRcclxuICAgIH0sXHJcbiAgICBvcHRpbWl6ZURlcHM6IHtcclxuICAgICAgZW50cmllczogW1wicmVsZWFzZS8qKi8qLntqcyx0cyxqc3gsdHN4LHZ1ZX1cIl0sXHJcbiAgICAgIGluY2x1ZGU6IFtcIkBidWZidWlsZC9wcm90b2J1ZlwiLCBcImVsZW1lbnQtcGx1c1wiXSAvLyBcdTVGM0FcdTUyMzZcdTVGMTVcdTUxNjVcdTkwN0ZcdTUxNERcdTkxQ0RcdTY1QjBcdTUyQTBcdThGN0RcclxuICAgIH0sXHJcbiAgICAvLyAyLiB0YXVyaSBleHBlY3RzIGEgZml4ZWQgcG9ydCwgZmFpbCBpZiB0aGF0IHBvcnQgaXMgbm90IGF2YWlsYWJsZVxyXG4gICAgYnVpbGQ6IHtcclxuICAgICAgbWluaWZ5OiBcInRlcnNlclwiLCAvLyBcdTVGQzVcdTk4N0JcdTVGMDBcdTU0MkZcdUZGMUFcdTRGN0ZcdTc1Mjh0ZXJzZXJPcHRpb25zXHU2MjREXHU2NzA5XHU2NTQ4XHU2NzlDXHJcbiAgICAgIHJvbGx1cE9wdGlvbnM6IHtcclxuICAgICAgICBvdXRwdXQ6IHtcclxuICAgICAgICAgIGNodW5rRmlsZU5hbWVzOiBcImpzL1tuYW1lXS1baGFzaF0uanNcIixcclxuICAgICAgICAgIGVudHJ5RmlsZU5hbWVzOiBcImpzL1tuYW1lXS1baGFzaF0uanNcIixcclxuICAgICAgICAgIGFzc2V0RmlsZU5hbWVzOiBcInN0YXRpYy9bZXh0XS9bbmFtZV0tW2hhc2hdLltleHRdXCJcclxuICAgICAgICB9XHJcbiAgICAgIH0sXHJcbiAgICAgIHRlcnNlck9wdGlvbnM6IHtcclxuICAgICAgICBjb21wcmVzczoge1xyXG4gICAgICAgICAga2VlcF9pbmZpbml0eTogdHJ1ZSwgLy8gXHU5NjMyXHU2QjYyIEluZmluaXR5IFx1ODhBQlx1NTM4Qlx1N0YyOVx1NjIxMCAxLzBcdUZGMENcdThGRDlcdTUzRUZcdTgwRkRcdTRGMUFcdTVCRkNcdTgxRjQgQ2hyb21lIFx1NEUwQVx1NzY4NFx1NjAyN1x1ODBGRFx1OTVFRVx1OTg5OFxyXG4gICAgICAgICAgZHJvcF9jb25zb2xlOiB0cnVlLCAvLyBcdTc1MUZcdTRFQTdcdTczQUZcdTU4ODNcdTUzQkJcdTk2NjQgY29uc29sZVxyXG4gICAgICAgICAgZHJvcF9kZWJ1Z2dlcjogdHJ1ZSAvLyBcdTc1MUZcdTRFQTdcdTczQUZcdTU4ODNcdTUzQkJcdTk2NjQgZGVidWdnZXJcclxuICAgICAgICB9LFxyXG4gICAgICAgIGZvcm1hdDoge1xyXG4gICAgICAgICAgY29tbWVudHM6IGZhbHNlIC8vICoqXHU3OUZCXHU5NjY0XHU2MjQwXHU2NzA5XHU2Q0U4XHU5MUNBKipcclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0sXHJcbiAgICBjc3M6IHtcclxuICAgICAgcHJlcHJvY2Vzc29yT3B0aW9uczoge1xyXG4gICAgICAgIHNjc3M6IHtcclxuICAgICAgICAgIGFwaTogXCJtb2Rlcm4tY29tcGlsZXJcIixcclxuICAgICAgICAgIHNpbGVuY2VEZXByZWNhdGlvbnM6IFtcImxlZ2FjeS1qcy1hcGlcIl1cclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgIH0sXHJcbiAgICBzZXJ2ZXI6IHtcclxuICAgICAgcG9ydDogMTQyMCxcclxuICAgICAgc3RyaWN0UG9ydDogdHJ1ZSxcclxuICAgICAgaG9zdDogaG9zdCB8fCBmYWxzZSxcclxuICAgICAgaG1yOiBob3N0XHJcbiAgICAgICAgPyB7XHJcbiAgICAgICAgICBwcm90b2NvbDogXCJ3c1wiLFxyXG4gICAgICAgICAgaG9zdCxcclxuICAgICAgICAgIHBvcnQ6IDE0MjFcclxuICAgICAgICB9XHJcbiAgICAgICAgOiB1bmRlZmluZWQsXHJcbiAgICAgIHdhdGNoOiB7XHJcbiAgICAgICAgLy8gMy4gdGVsbCB2aXRlIHRvIGlnbm9yZSB3YXRjaGluZyBgc3JjLXRhdXJpYFxyXG4gICAgICAgIGlnbm9yZWQ6IFtcIioqL3NyYy10YXVyaS8qKlwiXVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfTtcclxufSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBMlEsT0FBTyxTQUFTO0FBQzNSLE9BQU8sVUFBVTtBQUNqQixTQUFvQixjQUFjLGVBQTJCO0FBRTdELE9BQU8saUJBQWlCO0FBQ3hCLE9BQU8sZ0JBQWdCO0FBQ3ZCLE9BQU8sZ0JBQWdCO0FBQ3ZCLE9BQU8sbUJBQW1CO0FBQzFCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsa0JBQWtCO0FBRzNCLFNBQVMsNEJBQTRCO0FBWnJDLElBQU0sbUNBQW1DO0FBY3pDLElBQU0sT0FBTyxRQUFRLElBQUk7QUFHekIsSUFBTyxzQkFBUSxhQUFhLENBQUMsRUFBRSxLQUFLLE1BQTZCO0FBQy9ELFFBQU0sVUFBVSxRQUFRLE1BQU0sUUFBUSxJQUFJLENBQUM7QUFDM0MsU0FBTztBQUFBLElBQ0wsZUFBZSxDQUFDLFVBQVU7QUFBQTtBQUFBLElBQzFCLFNBQVM7QUFBQSxNQUNQLElBQUk7QUFBQSxNQUNKLFlBQVk7QUFBQTtBQUFBLE1BRVosV0FBVztBQUFBO0FBQUEsUUFFVCxTQUFTLENBQUMsT0FBTyxnQkFBZ0IsU0FBUyxjQUFjLFVBQVU7QUFBQSxRQUNsRSxXQUFXO0FBQUE7QUFBQSxVQUVULG9CQUFvQixFQUFFLGFBQWEsT0FBTyxDQUFDO0FBQUE7QUFBQSxVQUUzQyxjQUFjLENBQUMsQ0FBQztBQUFBLFFBQ2xCO0FBQUEsUUFDQSxVQUFVO0FBQUE7QUFBQSxVQUVSLFNBQVM7QUFBQTtBQUFBLFVBRVQsVUFBVTtBQUFBLFVBQ1Ysa0JBQWtCO0FBQUEsUUFDcEI7QUFBQTtBQUFBLFFBRUEsYUFBYTtBQUFBO0FBQUEsUUFFYixLQUFLO0FBQUE7QUFBQSxRQUVMLFNBQVMsQ0FBQyxjQUFjLFVBQVUsY0FBYyxPQUFPO0FBQUEsUUFDdkQsTUFBTTtBQUFBLFVBQ0o7QUFB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
