<template>
  <div class="tabs-browser">
    <!-- 1. 标签栏 -->
    <div class="tabs-bar">
      <div
        v-for="(tab, idx) in tabs"
        :key="tab.id"
        :class="['tab-item', { active: idx === activeIndex }]"
        @click="activateTab(idx)"
      >
        {{ tab.title || "新标签" }}
        <span class="close-btn" @click.stop="closeTab(idx)">×</span>
      </div>
      <button class="add-tab-btn" @click="addTab">＋</button>
    </div>

    <!-- 2. 工具栏 -->
    <div class="toolbar">
      <button :disabled="!canGoBack" @click="goBack">←</button>
      <button :disabled="!canGoForward" @click="goForward">→</button>
      <button @click="reload">⟳</button>
      <input v-model="inputUrl" placeholder="输入网址，如 https://" @keyup.enter="navigate" />
      <button @click="navigate">Go</button>
    </div>

    <!-- 3. 内容区：根据 activeIndex 渲染对应 iframe -->
    <div class="content">
      <iframe
        v-for="(tab, idx) in tabs"
        v-show="idx === activeIndex"
        :key="tab.id"
        ref="iframes"
        :src="tab.currentUrl"
        class="webview"
      ></iframe>
    </div>
  </div>
</template>

<script lang="ts" setup>
  // --- Imports & Typings ---
  import { computed, nextTick, ref, shallowReactive } from "vue";

  interface Tab {
    id: number;
    title: string;
    history: string[]; // 本地记录的 URL 栈
    index: number; // 当前指针
    currentUrl: string; // 当前 iframe src
  }

  // --- Reactive State ---
  const tabs = shallowReactive<Tab[]>([]);
  const activeIndex = ref(0);
  const nextTabId = ref(1);

  // 用于双向绑定地址栏输入
  const inputUrl = ref("https://www.badu.com");

  // --- Computed: 当前标签的前进/后退能力 ---
  const canGoBack = computed(() => {
    const tab = tabs[activeIndex.value];
    return tab && tab.index > 0;
  });
  const canGoForward = computed(() => {
    const tab = tabs[activeIndex.value];
    return tab && tab.index < tab.history.length - 1;
  });

  // --- 标签操作函数 ---
  // 创建并激活一个新标签
  function addTab() {
    const id = nextTabId.value++;
    const newTab: Tab = {
      id,
      title: "",
      history: [],
      index: -1,
      currentUrl: ""
    };
    tabs.push(newTab);
    activateTab(tabs.length - 1);
  }

  // 关闭指定标签
  function closeTab(idx: number) {
    if (tabs.length === 1) return; // 最少保留一个
    tabs.splice(idx, 1);
    if (activeIndex.value >= tabs.length) {
      activeIndex.value = tabs.length - 1;
    }
    // 切换后更新地址栏
    updateInputUrl();
  }

  // 激活某个标签
  function activateTab(idx: number) {
    activeIndex.value = idx;
    updateInputUrl();
  }

  // 更新地址栏输入框为当前标签 URL
  function updateInputUrl() {
    const tab = tabs[activeIndex.value];
    inputUrl.value = tab.currentUrl || "";
  }

  // --- 导航函数 ---
  // 地址栏跳转
  function navigate() {
    let url = inputUrl.value.trim();
    if (!url) return;
    if (!/^https?:\/\//.test(url)) {
      url = "https://" + url;
    }
    const tab = tabs[activeIndex.value];
    // 记录历史：清除后退后的前进记录
    tab.history.splice(tab.index + 1);
    tab.history.push(url);
    tab.index = tab.history.length - 1;
    tab.currentUrl = url;
    tab.title = ""; // 下次可根据需要异步更新标题
  }

  // 后退
  function goBack() {
    const tab = tabs[activeIndex.value];
    if (tab.index > 0) {
      tab.index--;
      tab.currentUrl = tab.history[tab.index];
      inputUrl.value = tab.currentUrl;
    }
  }

  // 前进
  function goForward() {
    const tab = tabs[activeIndex.value];
    if (tab.index < tab.history.length - 1) {
      tab.index++;
      tab.currentUrl = tab.history[tab.index];
      inputUrl.value = tab.currentUrl;
    }
  }

  // 刷新
  function reload() {
    const tab = tabs[activeIndex.value];
    const src = tab.currentUrl;
    // 通过清空再恢复触发 iframe 刷新
    tab.currentUrl = "";
    nextTick(() => {
      tab.currentUrl = src;
    });
  }

  // --- 初始化：打开第一个空白标签 ---
  addTab();
</script>

<style lang="scss" scoped>
  .tabs-browser {
    display: flex;
    flex-direction: column;
    height: 100vh;
    user-select: none;
  }

  .tabs-bar {
    display: flex;
    background: #eee;
    padding: 4px;
    align-items: center;

    .tab-item {
      padding: 4px 8px;
      margin-right: 4px;
      background: #ddd;
      border-radius: 4px 4px 0 0;
      cursor: pointer;

      &.active {
        background: #fff;
        border-bottom: 1px solid #fff;
      }

      .close-btn {
        margin-left: 6px;
        font-weight: bold;
        cursor: pointer;
      }
    }

    .add-tab-btn {
      padding: 4px 8px;
      background: #ddd;
      border: none;
      cursor: pointer;
      border-radius: 4px;
    }
  }

  .toolbar {
    display: flex;
    padding: 6px;
    background: #f8f8f8;
    align-items: center;
    gap: 4px;

    button {
      padding: 4px 8px;
    }

    input {
      flex: 1;
      padding: 4px 8px;
    }
  }

  .content {
    flex: 1;
    position: relative;

    .webview {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: none;
    }
  }
</style>
