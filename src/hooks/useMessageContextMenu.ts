import { computed, ref } from "vue";

export type ContextMenuOption = { label: string; value: string };

type ContextMenuConfig = {
  getOptions: (target: unknown | null) => ContextMenuOption[];
  onAction: (action: string, target: unknown | null) => void | Promise<void>;
  beforeShow?: () => void;
};

/**
 * 统一的右键菜单 Hook
 * - 统一管理菜单目标
 * - 统一输出 v-context-menu 所需的配置
 */
export function useMessageContextMenu<T = unknown>(config: {
  getOptions: (target: T | null) => ContextMenuOption[];
  onAction: (action: string, target: T | null) => void | Promise<void>;
  beforeShow?: () => void;
}) {
  const target = ref<T | null>(null);

  /** 设置当前右键菜单的目标 */
  const setTarget = (value: T | null) => {
    target.value = value;
  };

  const menuConfig = computed(() => ({
    options: config.getOptions(target.value),
    callback: (action: string) => config.onAction(action, target.value),
    beforeShow: config.beforeShow
  }));

  return { menuConfig, target, setTarget };
}
