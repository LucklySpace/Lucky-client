<template>
  <div>
    <div ref="pluginContainer"></div>
  </div>
</template>

<script lang="ts" setup>
  import { invoke } from "@tauri-apps/api/core";
  import { ref } from "vue";

  const pluginContainer = ref<HTMLElement | null>(null);

  // 安全的 hostApi，仅暴露给插件受控的功能
  const createHostApi = (tag: string) => {
    return {
      // 用于插件请求后端操作的受控代理：宿主把请求转给 Tauri invoke
      invokeBackend: async (cmd: string, args?: any) => {
        // 在此你可以做鉴权和参数白名单校验
        return await invoke(cmd, args);
      },
      emitEvent: (name: string, payload?: any) => {
        // 插件 -> 宿主 使用 CustomEvent 或回调
        window.dispatchEvent(new CustomEvent(`plugin:${tag}:${name}`, { detail: payload }));
      },
      requestPermission: async (name: string) => {
        // 可在此实现权限询问 UI
        if (name === "storage") return true;
        return false;
      }
    };
  };

  /**
   * 加载一个插件（manifestUrl 本地路径或远端 URL）
   */
  async function loadPlugin(manifestUrl: string) {
    // 1. 读取 manifest
    const manifestRes = await fetch(manifestUrl);
    const manifest = await manifestRes.json();

    // 2. 简单验证（示例：只允许带连字符的 tag）
    if (!manifest.tag || manifest.tag.indexOf("-") === -1) {
      throw new Error("invalid plugin tag");
    }

    // 3. 决定是否 sandbox（如果 manifest.trusted===false 可以用 iframe）
    if (!manifest.trusted) {
      // 简单示例：仍直接加载，但生产建议 iframe sandbox 或严格验证签名
      console.warn("plugin not trusted — recommend iframe sandboxing");
    }

    // 4. 动态加载插件脚本（entry 相对于 manifestUrl）
    const base = new URL(".", manifestUrl).toString();
    const scriptUrl = new URL(manifest.entry, base).toString();

    // Option A: dynamic import (module must export something or define custom element by itself)
    await import(scriptUrl);

    // Option B（兼容老浏览器或自动执行）：append <script type="module">
    // const s = document.createElement('script');
    // s.type = 'module';
    // s.src = scriptUrl;
    // document.head.appendChild(s);
    // await new Promise((r) => (s.onload = r));

    // 5. 等待 custom element 已定义
    await customElements.whenDefined(manifest.tag);

    // 6. 创建 element 并注入 hostApi（作为属性或直接设置对象）
    const el = document.createElement(manifest.tag) as any;

    // 将 hostApi 挂载为属性（非属性字符串）：
    // 注意：custom element props 读取推荐在 connectedCallback 或 mounted 时从 this.hostApi 读取
    (el as any).hostApi = createHostApi(manifest.tag);

    // 7. 可设置属性或调用方法
    el.setAttribute("data-plugin-name", manifest.name);

    // 8. append to container
    pluginContainer.value?.appendChild(el);

    // 9. 监听插件发出的事件（通过 hostApi 中的 window events）
    window.addEventListener(`plugin:${manifest.tag}:plugin-tick`, (ev: any) => {
      console.log("tick from plugin", ev.detail);
    });

    return el;
  }

  // use: loadPlugin('plugins/example/manifest.json');
</script>
