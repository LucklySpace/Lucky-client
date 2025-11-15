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

<style lang="scss" scoped></style>
