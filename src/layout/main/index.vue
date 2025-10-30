<template>
  <el-main>
    <router-view v-slot="{ Component }">
      <keep-alive>
        <component :is="Component" v-if="$route.meta.keepAlive" :key="$route.name" />
      </keep-alive>

      <component :is="Component" v-if="!$route.meta.keepAlive" :key="$route.name" />
    </router-view>
  </el-main>
</template>

<script lang="ts" setup>
  import { useMainManager } from "@/core";

  onMounted(() => {
    init();
  });

  const init = async () => {
    useMainManager().initClient();
  };
</script>

<style lang="scss" scoped>
  .el-main {
    background-color: var(--content-bg-color);
  }
</style>
