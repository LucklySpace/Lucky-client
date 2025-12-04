<template>
  <div class="setting-container">
    <el-form :model="shortcutForm" label-width="0">
      <!-- 发送消息 -->
      <div class="form-row">
        <div :title="$t('settings.shortcut.send')" class="row-label">{{ $t("settings.shortcut.send") }}</div>
        <div class="row-control">
          <el-select v-model="shortcutForm.sendMessage" @change="handleKeyChange('sendMessage')">
            <el-option label="Alt + S" value="Alt + S" />
            <el-option label="Ctrl + Enter" value="Ctrl + Enter" />
          </el-select>
        </div>
      </div>

      <!-- 截图 -->
      <div class="form-row">
        <div :title="$t('settings.shortcut.screen')" class="row-label">{{ $t("settings.shortcut.screen") }}</div>
        <div class="row-control">
          <el-input
            v-model="shortcutForm.screenshot"
            :placeholder="$t('settings.shortcut.click')"
            readonly
            @keydown.prevent="handleKeyDown($event as KeyboardEvent, 'screenshot')"
            @keyup.prevent="submitShortcut('screenshot')"
          />
        </div>
      </div>

      <!-- 恢复默认 -->
      <div class="form-row">
        <!-- 如果这一行 label 需要留空，也可直接用 &nbsp; 占位 -->
        <div class="row-label">&nbsp;</div>
        <div class="row-control">
          <el-button type="primary" @click="resetDefaults">{{ $t("settings.shortcut.default") }}</el-button>
        </div>
      </div>
    </el-form>
  </div>
</template>

<script lang="ts" setup>
  import { ref, shallowReactive } from "vue";
  import { ElMessage } from "element-plus";
  import { useGlobalShortcut } from "@/hooks/useGlobalShortcut";
  import { useSettingStore } from "@/store/modules/setting";

  interface ShortcutForm {
    sendMessage: string;
    screenshot: string;
    detectConflict: boolean;
  }

  // 1. 默认值
  const defaultSettings: ShortcutForm = {
    sendMessage: "Ctrl + Enter",
    screenshot: "Ctrl + Alt + M",
    detectConflict: true
  };

  // 2. 从持久化 Store 读取已有设置，合并到表单
  const settingStore = useSettingStore();

  const shortcutForm = shallowReactive<ShortcutForm>({
    ...defaultSettings,
    // 如果 Store 中有，优先使用
    ...Object.fromEntries(settingStore.shortcuts.map(s => [s.name, s.combination]))
  });

  // 3. 调用单例 Hook，取出 updateShortcut
  const { updateShortcut } = useGlobalShortcut();

  // 4. 暂存刚刚修改的字段名，用于 KeyUp 提交
  const pendingField = ref<keyof ShortcutForm | null>(null);

  /**
   * handleKeyDown：按键监听，只拼接组合键到表单，不触发注册
   * @param event KeyboardEvent
   * @param field 作用字段名
   */
  function handleKeyDown(event: KeyboardEvent, field: keyof ShortcutForm) {
    // 组装键名数组
    const keys: string[] = [];
    if (event.ctrlKey) keys.push("Ctrl");
    if (event.altKey) keys.push("Alt");
    if (event.shiftKey) keys.push("Shift");

    const key = event.key.toUpperCase();
    if (!["CONTROL", "ALT", "SHIFT"].includes(key)) {
      keys.push(key);
    }

    // 更新表单并记录字段名
    if (keys.length > 0 && field !== "detectConflict") {
      shortcutForm[field] = keys.join(" + ");
      pendingField.value = field;
    }
  }

  /**
   * submitShortcut：KeyUp 时统一提交到全局 Hook
   * @param field 字段名
   */
  function submitShortcut(field: keyof ShortcutForm) {
    if (pendingField.value === field) {
      updateShortcut(field, shortcutForm[field] as string);
      // 如果开启冲突检测，可在这里做提示逻辑
      if (shortcutForm.detectConflict) {
        // TODO: 调用 isRegistered 检测并提示
      }
      pendingField.value = null;
    }
  }

  /**
   * 发送消息
   * @param field
   */
  function handleKeyChange(field: keyof ShortcutForm) {
    if (shortcutForm.sendMessage != defaultSettings.sendMessage) {
      updateShortcut(field, shortcutForm[field] as string);
    }
  }

  /**
   * resetDefaults：恢复默认并更新 Store 与 Tauri 注册
   */
  function resetDefaults() {
    Object.assign(shortcutForm, defaultSettings);
    // 恢复默认时也同步到全局 Hook
    updateShortcut("sendMessage", defaultSettings.sendMessage);
    updateShortcut("screenshot", defaultSettings.screenshot);
    ElMessage.success("已恢复默认设置");
  }
</script>

<style lang="scss" scoped>
  .setting-container {
    background-color: #ffffff;
    border-radius: 8px;
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05); /* 淡淡的阴影 */
    padding: 8px 20px;
    max-width: 400px; /* 限制宽度以匹配图片效果 */
    margin: 20px auto;
    border: 1px solid #ebeef5;
  }

  /* 每一行的样式 */
  .form-row {
    display: flex;
    justify-content: space-between; /* 左右对齐 */
    align-items: center; /* 垂直居中 */
    padding: 16px 0;
    border-bottom: 1px solid #f2f2f2; /* 灰色分割线 */

    /* 最后一行的特殊处理（按钮行） */
    &.footer-row {
      border-bottom: none;
      justify-content: flex-end; /* 按钮靠右 */
      padding-bottom: 8px;
    }
  }

  .row-label {
    font-size: 14px;
    color: #333333; /* 深灰黑色字体 */
    font-weight: 500;
  }

  .row-control {
    /* 这里的宽度决定了输入框的宽度 */
    width: 140px;
    display: flex;
    justify-content: flex-end;
  }

  /* =========================================
   Element Plus 深度样式覆盖
   使用 :deep() 穿透组件 scoped 限制
   ========================================= */

  /* 1. 输入框样式 (Input) */
  :deep(.custom-input) {
    .el-input__wrapper {
      box-shadow: 0 0 0 1px #dcdfe6 inset; /* 默认边框 */
      border-radius: 6px;
      padding: 0 8px;
      height: 32px; /* 稍微矮一点 */
      background-color: #fff;
      transition: all 0.3s;

      &:hover {
        box-shadow: 0 0 0 1px #c0c4cc inset;
      }

      &.is-focus {
        box-shadow: 0 0 0 1px #409eff inset;
      }
    }

    .el-input__inner {
      text-align: center; /* 文字居中 */
      font-size: 13px;
      color: #333;
      height: 32px;
    }

    /* 图标颜色 */
    .input-icon {
      color: #909399;
      cursor: pointer;
      font-size: 14px;
      &:hover {
        color: #606266;
      }
    }
  }

  /* 2. 下拉框样式 (Select) */
  :deep(.custom-select) {
    .el-select__wrapper {
      min-height: 32px;
      height: 32px;
      border-radius: 6px;
      padding: 0 8px;
      box-shadow: 0 0 0 1px #dcdfe6 inset;
    }

    .el-select__selected-item {
      font-size: 13px;
      color: #333;
      text-align: center;
    }

    /* 模仿图片中 Select 的绿色箭头背景效果 */
    .el-select__suffix {
      background-color: #00cca3; /* 绿色背景 */
      border-radius: 4px;
      margin-right: -4px; /* 调整位置 */
      padding: 2px;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;

      .el-icon {
        color: white; /* 箭头变白 */
        font-size: 12px;
        margin: 0;
      }
    }
  }

  /* 3. 底部按钮样式 (Button) */
  :deep(.reset-btn) {
    background-color: #f0f0f0; /* 浅灰色背景 */
    border-color: #f0f0f0;
    color: #333;
    font-size: 13px;
    padding: 8px 16px;
    height: auto;
    border-radius: 4px;

    &:hover {
      background-color: #e6e6e6;
      border-color: #e6e6e6;
    }
  }
</style>
