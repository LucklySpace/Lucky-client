<template>
  <div class="theme-card">
    <div class="theme-header">
      <span>{{ $t("pages.settings.theme.current") }}</span>
    </div>

    <!-- 单选切换主题 -->
    <el-radio-group v-model="appearance" size="default">
      <el-radio value="light">{{ $t("pages.settings.theme.options.light") }}</el-radio>
      <el-radio value="dark">{{ $t("pages.settings.theme.options.dark") }}</el-radio>
      <el-radio value="auto">{{ $t("pages.settings.theme.options.auto") }}</el-radio>
    </el-radio-group>
  </div>
</template>

<script lang="ts" setup>
  import { useThemeColor } from "@/hooks/useThemeColor";

  // 获取主题控制逻辑
  const { appearance } = useThemeColor();

  // const handelChange = () => {
  //   toggleTheme();
  // };
</script>

<style lang="scss" scoped>
  .theme-card {
    transition: all 0.3s ease;
    border-radius: 8px;
    padding: 8px 20px;
    max-width: 400px;
    margin: 20px auto;
  }

  .theme-header {
    display: flex;
    align-items: center;
    font-size: 16px;
    margin-bottom: 10px;
  }
</style>
