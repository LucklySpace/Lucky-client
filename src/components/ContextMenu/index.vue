<template>
  <transition name="fade">
    <div v-if="state.visible" :style="{ top: `${state.position.y}px`, left: `${state.position.x}px` }"
         class="context-menu" @mouseleave="hide">
      <div v-for="option in state.options" :key="option.value" class="menu-item" @click="onSelect(option.value)">
        {{ option.label }}
      </div>
    </div>
  </transition>
</template>

<script lang="ts" setup>
  import { onBeforeUnmount, onMounted, shallowReactive } from "vue";

  // ✅ 添加这个导出
  export interface ContextMenuOptions {
    options: Array<{
      label: string;
      value: string;
    }>;
    callback: (value: string) => void;
    beforeShow?: () => void;
  }

  interface Option {
    label: string;
    value: string;
  }

  const state = shallowReactive({
    visible: false,
    options: [] as Option[],
    callback: (v: any) => void {},
    position: { x: 0, y: 0 }
  });

  const show = (opts: Option[], cb: any, x: number, y: number) => {
    state.options = opts;
    state.callback = cb;
    state.position.x = x;
    state.position.y = y;
    state.visible = true;
  };

  const hide = () => {
    state.visible = false;
  };

  const onSelect = (value: string) => {
    hide();
    state.callback(value);
  };

  // Global click to hide
  const handleGlobalClick = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest(".context-menu")) {
      hide();
    }
  };

  onMounted(() => {
    document.addEventListener("click", handleGlobalClick);
  });
  onBeforeUnmount(() => {
    document.removeEventListener("click", handleGlobalClick);
  });

  // Expose API
  defineExpose({ show, hide });
</script>

<style scoped>
  .context-menu {
    position: fixed;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 4px 0;
    min-width: 100px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    z-index: 9999;
  }

  .context-menu .menu-item {
    padding: 5px 10px;
    font-size: 14px;
    cursor: pointer;
    transition: background-color 0.2s;
    white-space: nowrap;
  }

  .context-menu .menu-item:hover {
    background-color: #f5f5f5;
  }

  .fade-enter-active,
  .fade-leave-active {
    transition: opacity 0.2s;
  }

  .fade-enter-from,
  .fade-leave-to {
    opacity: 0;
  }
</style>
