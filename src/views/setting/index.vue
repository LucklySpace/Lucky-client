<template>
  <el-dialog
    :close-on-click-modal="false"
    :model-value="visible"
    :title="title"
    class="setting-dialog no-select"
    destroy-on-close
    style="height: 70%"
    width="65%"
    @close="emitClose"
  >
    <el-tabs class="tabs" tab-position="left">
      <el-tab-pane v-for="tab in tabs" :key="tab.name" :label="tab.label">
        <Suspense>
          <template #default>
            <component :is="tab.component" />
          </template>
          <template #fallback>
            <el-empty description="description" />
          </template>
        </Suspense>
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>

<script lang="ts" setup>
  import Profile from "@/components/Setting/Profile.vue";
  import { defineAsyncComponent } from "vue";
  import { useI18n } from "vue-i18n";

  const emit = defineEmits(["handleClose"]);
  const { t } = useI18n();

  // Props & Emits
  defineProps<{
    visible: boolean;
    title: string;
  }>();

  // 关闭时向外发出 close 事件，并同步 v-model
  function emitClose() {
    emit("handleClose");
  }

  // Tab 配置：name 用作 key，label 为标签名，component 为异步引入
  const tabs = computed(() => [
    { name: "profile", label: t("settings.tabs.profile"), component: Profile },
    {
      name: "notification",
      label: t("settings.tabs.notification"),
      component: defineAsyncComponent(() => import("@/components/Setting/Notification.vue"))
    },
    {
      name: "theme",
      label: t("settings.tabs.theme"),
      component: defineAsyncComponent(() => import("@/components/Setting/Theme.vue"))
    },
    {
      name: "general",
      label: t("settings.tabs.general"),
      component: defineAsyncComponent(() => import("@/components/Setting/General.vue"))
    },
    {
      name: "fileManagement",
      label: t("settings.tabs.fileManagement"),
      component: defineAsyncComponent(() => import("@/components/Setting/FileManagement.vue"))
    },
    {
      name: "shortcut",
      label: t("settings.tabs.shortcut"),
      component: defineAsyncComponent(() => import("@/components/Setting/Shortcut.vue"))
    },
    {
      name: "about",
      label: t("settings.tabs.about"),
      component: defineAsyncComponent(() => import("@/components/Setting/About.vue"))
    }
  ]);
</script>

<style lang="scss" scoped>
</style>
