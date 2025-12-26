import { onBeforeUnmount, ref, type Ref } from "vue";

/**
 * 鼠标拖动元素
 * @param targetRef
 */
export function useDraggable(targetRef: Ref<HTMLElement | null>) {
  const isDragging = ref(false);
  let initialMouseX = 0;
  let initialMouseY = 0;
  let initialLeft = 0;
  let initialTop = 0;

  function onDrag(e: MouseEvent) {
    if (!isDragging.value || !targetRef.value) return;
    const deltaX = e.clientX - initialMouseX;
    const deltaY = e.clientY - initialMouseY;

    // 边界限制：不超出屏幕
    const newLeft = Math.max(0, Math.min(window.innerWidth - targetRef.value.offsetWidth, initialLeft + deltaX));
    const newTop = Math.max(0, Math.min(window.innerHeight - targetRef.value.offsetHeight, initialTop + deltaY));

    targetRef.value.style.left = `${newLeft}px`;
    targetRef.value.style.top = `${newTop}px`;
    targetRef.value.style.right = "auto";
    targetRef.value.style.bottom = "auto";
  }

  function stopDrag() {
    isDragging.value = false;
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", stopDrag);
  }

  function startDrag(e: MouseEvent) {
    // 如果点击在按钮上，不触发拖动
    if (e.target && (e.target as HTMLElement).tagName === "BUTTON") {
      return;
    }
    if (!targetRef.value) return;

    isDragging.value = true;
    initialMouseX = e.clientX;
    initialMouseY = e.clientY;

    const rect = targetRef.value.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    document.addEventListener("mousemove", onDrag);
    document.addEventListener("mouseup", stopDrag);
    e.preventDefault();
  }

  onBeforeUnmount(() => {
    document.removeEventListener("mousemove", onDrag);
    document.removeEventListener("mouseup", stopDrag);
  });

  return {
    isDragging,
    startDrag
  };
}
