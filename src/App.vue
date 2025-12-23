<template>
  <el-config-provider :locale="locale">
    <router-view />
  </el-config-provider>
</template>

<script lang="ts" setup>
  import { onMounted } from "vue";
  import { useSettingStore } from "@/store/modules/setting";
  // @ts-ignore
  import zhCn from "element-plus/dist/locale/zh-cn.mjs";
  // @ts-ignore
  import en from "element-plus/dist/locale/en.mjs";

  const settingStore = useSettingStore();

  const locale = computed(() => (settingStore.language === "en-US" ? en : zhCn));

  //import zhCN from "element-plus/dist/locale/zh-cn";
  // const locale = ref(zhCN);
  // const transitionName = ref("fade"); // 默认动画效果

  function Observer() {
    let images = document.querySelectorAll(".lazy-img");
    let observer = new IntersectionObserver(entries => {
      entries.forEach((item: any) => {
        if (item.isIntersecting) {
          item.target.src = item.target.dataset.origin; // 开始加载图片,把data-origin的值放到src
          observer.unobserve(item.target); // 停止监听已开始加载的图片
        }
      });
    });
    images.forEach(img => observer.observe(img));
  }

  onMounted(async () => {
    useLogger().info("App started");
    Observer();

    //禁用页面右键菜单
    //document.addEventListener("contextmenu", e => e.preventDefault());
  });
</script>

<style lang="scss">
@use "@/assets/style/scss/index.scss" as *;
@use "@/assets/style/scss/theme.scss" as *;
@use "@/assets/style/scss/setting.scss" as *;
@use "element-plus/theme-chalk/dark/css-vars.css" as *;
@use "element-plus/dist/index.css" as *;

  // #app {
  //   background-repeat: no-repeat;
  //   background-size: 100% 100%;
  //   position: fixed;
  //   height: calc(100% - 2px);
  //   width: calc(100% - 2px);
  //   top: 0;
  //   left: 0;
  //   transition: all 0.9s ease;
  //   border-radius: 8px;
  //   background-color: var(--main-bg-color);
  //   // box-shadow: 0px 0px 10px #172533 inset;
  // }
  html,
  body,
  #app {
    //font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
    height: 100%;
    width: 100%;
    padding: 0;
    margin: 0;
    border-radius: var(--main-border-radius);
    background-repeat: no-repeat;
    background-color: var(--main-bg-color);
  }

  // .el-header {
  //   padding: 0px !important
  // }
  #app {
    font-family: Avenir, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    //color: #172533;
    overflow: hidden;
  }

  .el-main {
    width: 100%;
    height: 100%;
    padding: 0px !important;
  }

  button {
    cursor: pointer;
  }

  .fade-enter-active,
  .fade-leave-active {
    transition: opacity 0.5s;
  }

  .fade-enter,
  .fade-leave-to {
    opacity: 0;
  }
</style>
