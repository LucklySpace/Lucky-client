<template>
  <div class="header">
    <span class="name no-select">{{ name }}</span>
  </div>
</template>

<script setup>
  import { useChatMainStore } from "@/store/modules/chat";

  const chatStore = useChatMainStore();

  const name = computed(() => chatStore.getCurrentName);
</script>

<style lang="scss" scoped>
  .name {
    overflow: hidden;
    color: var(--header-font-color);
    width: 100%;
    margin-left: 20px;
    line-height: 60px;
    font-size: 18px;
    font-weight: bolder;
  }
</style>
