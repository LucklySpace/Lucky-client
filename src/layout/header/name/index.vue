<template>
  <div class="header">
    <span class="name no-select">{{ name }}</span>
  </div>
</template>

<script setup>
  import { useChatStore } from "@/store/modules/chat";
  import { useRoute } from "vue-router";

  const chatStore = useChatStore();
  const route = useRoute();

  const name = computed(() => {
    // 仅在消息页且存在当前会话时显示标题
    if (route.path !== "/message") return "";
    return chatStore.getCurrentName;
  });
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
