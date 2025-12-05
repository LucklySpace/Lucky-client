<template>
  <div class="theme-card">
    <div class="theme-header">
      <span>{{ $t("settings.theme.current") }}</span>
    </div>

    <!-- 单选切换主题 -->
    <el-radio-group v-model="appearance" size="default">
      <el-radio value="light">{{ $t("settings.theme.light") }}</el-radio>
      <el-radio value="dark">{{ $t("settings.theme.dark") }}</el-radio>
      <el-radio value="auto">{{ $t("settings.theme.auto") }}</el-radio>
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
    background-color: #ffffff;
    border-radius: 8px;
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
    padding: 8px 20px;
    max-width: 400px;
    margin: 20px auto;
    border: 1px solid #ebeef5;
  }

  .theme-header {
    display: flex;
    align-items: center;
    font-size: 16px;
    margin-bottom: 10px;
  }
</style>
