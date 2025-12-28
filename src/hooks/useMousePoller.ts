import { onBeforeUnmount, ref, type Ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * 鼠标监听
 * @param targetRef
 * @returns
 */
export function useMousePoller(targetRef: Ref<HTMLElement | null>) {
  const isPointButton = ref(false);
  let unlistenMouse: UnlistenFn | null = null;

  function isPointInElement(x: number, y: number, el: HTMLElement | null) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  /**
   * #TODO  tauri 窗口 setIgnoreCursorEvents 设置透明窗口鼠标穿透有副作用  会显示标题栏
   * tauri issue：https://github.com/tauri-apps/tauri/issues/11052
   * setIgnoreCursorEventsHelper
   * - 安全调用 Tauri 的 setIgnoreCursorEvents
   */
  async function setIgnoreCursorEventsHelper(ignore: boolean) {
    return getCurrentWebviewWindow().setIgnoreCursorEvents(ignore);
  }

  async function startMousePoller() {
    // 避免重复启动
    if (unlistenMouse) return;

    // 发送启动鼠标监听事件
    await invoke("control_mouse_poller", {
      start: true,
      interval_ms: 80,
      windowLabel: null,
      minMove: 2,
      throttleMs: 100
    });

    // 开始监听
    const unlisten = await listen("mouse:position", (e: any) => {
      const { x, y } = e.payload;
      if (x && y) {
        // 判断鼠标是否在 targetRef 内
        const inside = isPointInElement(x, y, targetRef.value);
        if (inside !== isPointButton.value) {
          isPointButton.value = inside;
          // 如果在按钮内 -> 禁止窗口忽略鼠标（允许事件），否则开启忽略（穿透）
          setIgnoreCursorEventsHelper(!inside)
            .then(async () => await getCurrentWindow().setDecorations(false))
            .catch(() => {});
        }
      }
    });
    unlistenMouse = unlisten;
  }

  async function stopMousePoller() {
    if (unlistenMouse) {
      unlistenMouse();
      unlistenMouse = null;
    }
    await invoke("control_mouse_poller", { start: false });
    await setIgnoreCursorEventsHelper(false);
  }

  onBeforeUnmount(() => {
    stopMousePoller();
  });

  return {
    isPointButton,
    startMousePoller,
    stopMousePoller
  };
}
