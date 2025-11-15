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
    max-width: 500px;
    padding: 24px;
    /* border-radius: 12px;
  margin: 40px auto;
  background-color: var(--content-bg-color);
  color: var(--content-font-color);
  box-shadow: var(--main-box-shadow); */
    transition: all 0.3s ease;
  }

  .theme-header {
    display: flex;
    align-items: center;
    font-size: 16px;
    margin-bottom: 10px;
  }
</style>
