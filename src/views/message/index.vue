<template>
  <el-container>
    <!-- 会话列表 -->
    <el-aside width="240px">
      <ChatView class="control_message">
      </ChatView>
    </el-aside>

    <!-- 消息内容 -->
    <el-main>
      <ContentView class="control_message">
      </ContentView>
    </el-main>

  </el-container>
</template>

<script lang="ts" setup>
  import ContentView from "./ContentView/index.vue";
  import ChatView from "./ChatView/index.vue";
</script>


<style lang="scss" scoped>
  // 60px是头部高度 2px是边框
  .control_message {
    height: calc(100vh - 62px);
  }
</style>