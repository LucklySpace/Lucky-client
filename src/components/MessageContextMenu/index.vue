<template>
  <div v-show="isContextMenuVisible" id="contextMenu"
       :style="{ top: contextMenuStyle.top, left: contextMenuStyle.left }" class="context-menu">
    <div v-for="(option, index) in currentOptions" :key="index" class="context-menu-option"
         @click="handleOptionClick(option.action)">
      <span>{{ option.name }}</span>
    </div>
  </div>
</template>

<script lang="ts" setup>

  // 定义菜单项的类型
  type ContextMenuOption = {
    name: string;
    action: () => void;
  };

  // 定义组件的 props
  // const props = defineProps<{
  //     options: ContextMenuOption[];
  // }>();

  const isContextMenuVisible = ref(false);
  const contextMenuStyle = ref<{ top: string; left: string }>({ top: "0px", left: "0px" });
  const currentOptions = ref<ContextMenuOption[]>([]);

  // 显示右键菜单
  const showContextMenu = (event: MouseEvent, options: ContextMenuOption[]) => {

    event.preventDefault();
    isContextMenuVisible.value = true;
    currentOptions.value = options; // 更新菜单选项

    const menuWidth = 280;
    const windowWidth = window.innerWidth;
    const maxLeft = windowWidth - menuWidth;

    let left = event.clientX;
    if (left > maxLeft) {
      left = maxLeft;
    }

    contextMenuStyle.value = {
      top: `${event.clientY}px`,
      left: `${left}px`
    };


  };

  // 隐藏右键菜单
  const hideContextMenu = () => {
    isContextMenuVisible.value = false;
  };

  // 处理菜单项点击事件
  const handleOptionClick = (action: () => void) => {
    hideContextMenu();
    action();
  };


  defineExpose({ showContextMenu, hideContextMenu });

</script>

<style scoped>
  .context-menu {
    position: fixed;
    z-index: 1000;
    width: 50px;
    background-color: white;
    border: none;
    border-radius: 6px;
    box-shadow: 0 0 5px #ccc;
  }

  .context-menu-option {
    display: flex;
    font-size: 12px;
    align-items: center;
    justify-content: center;
    padding: 5px 5px;
    cursor: pointer;
  }

  /* .context-menu-option:not(:last-child) {
      border-bottom: 1px solid #eee;
  } */

  .icon {
    margin-right: 20px;
  }

  .shortcut {
    margin-right: 10px;
    margin-left: 40px;
    text-align: right;
  }

  .context-menu-option:hover {
    background-color: #e0e0e0;
    border-radius: 6px;
  }
</style>