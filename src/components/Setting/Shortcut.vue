<template>
  <div class="setting-container">
    <el-form :model="shortcutForm" label-width="0">
      <!-- 发送消息 -->
      <div class="form-row">
        <div :title="$t('settings.shortcut.send')" class="row-label">{{ $t("settings.shortcut.send") }}</div>
        <div class="row-control">
          <el-select class="custom-select" v-model="shortcutForm.sendMessage" @change="handleKeyChange('sendMessage')">
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
            class="custom-input"
            v-model="shortcutForm.screenshot"
            :placeholder="$t('settings.shortcut.click')"
            readonly
            @keydown.prevent="handleKeyDown($event as KeyboardEvent, 'screenshot')"
            @keyup.prevent="submitShortcut('screenshot')"
          />
        </div>
      </div>

      <!-- 恢复默认 -->
      <div class="form-bottom">
        <!-- 如果这一行 label 需要留空，也可直接用 &nbsp; 占位 -->
        <span>
          <el-button type="primary" @click="resetDefaults">{{ $t("settings.shortcut.default") }}</el-button>
        </span>
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
  /* 容器与行布局 (保持不变) */
  .setting-container {
    border-radius: 8px;
    padding: 8px 20px;
    max-width: 400px;
    margin: 20px auto;
  }

  .form-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 0;

    &.footer-row {
      border-bottom: none;
      justify-content: space-between;
      padding-bottom: 8px;
    }
  }

  .row-label {
    font-size: 14px;
    color: #333333;
    font-weight: 500;
  }

  .row-control {
    display: flex;
    justify-content: flex-end;
  }

  /* 1. Input 样式 */
  :deep(.custom-input) {
    width: 190px;
    box-sizing: border-box;
    margin: 0;
    .el-input__wrapper {
      box-shadow: 0 0 0 1px #dcdfe6 inset; /* 灰色边框 */
      border-radius: 6px;
      padding: 0 8px;
      height: 32px;
      width: 100%;
      box-sizing: border-box;
      transition: all 0.3s;

      &:hover {
        box-shadow: 0 0 0 1px #c0c4cc inset;
      }
      &.is-focus {
        box-shadow: 0 0 0 1px #409eff inset;
      }
    }

    .el-input__inner {
      text-align: center;
      font-size: 13px;
      color: #606266;
    }

    .input-icon {
      color: #909399; /* 灰色图标 */
      cursor: pointer;
      &:hover {
        color: #606266;
      }
    }
  }

  /* 2. Select 样式 */
  :deep(.custom-select) {
    width: 190px;
    box-sizing: border-box;
    margin: 0;
    vertical-align: middle;
    /* wrapper 对应 input 的 wrapper */
    .el-select__wrapper {
      box-shadow: 0 0 0 1px #dcdfe6 inset; /* 灰色边框 */
      border-radius: 6px;
      min-height: 32px;
      height: 32px;
      width: 100%;
      box-sizing: border-box;
      padding: 0 8px;
      // background-color: #fff;
      transition: all 0.3s;

      &:hover {
        box-shadow: 0 0 0 1px #c0c4cc inset;
      }
      &.is-focused {
        box-shadow: 0 0 0 1px #409eff inset;
      }
    }

    /* 选中的文字 */
    .el-select__selected-item {
      font-size: 13px;
      color: #606266;
      text-align: center; /* 让文字居中 */
      /* 这里的 padding 可能需要根据是否显示 placeholder 调整，一般不用动 */
    }

    /* 下拉箭头图标 */
    .el-select__caret {
      color: #909399; /* 变成普通的灰色箭头 */
      font-size: 14px;
    }

    /* 去掉之前那个特殊的 suffix 背景颜色设置 */
    .el-select__suffix {
      background-color: transparent;
      padding: 0;
    }
  }

  /* 底部按钮 */
  :deep(.reset-btn) {
    background-color: #f0f0f0;
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
  .form-bottom {
    display: flex;
    justify-content: center;
  }
</style>
