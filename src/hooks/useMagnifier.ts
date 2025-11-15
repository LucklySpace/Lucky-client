import { onMounted, onUnmounted, ref, Ref } from "vue";

export function useMagnifier(canvas: Ref<HTMLCanvasElement | null>, scale: number = 2, size: number = 150) {
  const magnifierCanvas = ref<HTMLCanvasElement | null>(null);
  const magnifierCtx = ref<CanvasRenderingContext2D | null>(null);

  const magnifierSize = size;
  const magnifierScale = scale;

  onMounted(() => {
    if (canvas.value) {
      magnifierCanvas.value = document.createElement("canvas");
      magnifierCanvas.value.width = magnifierSize;
      magnifierCanvas.value.height = magnifierSize;
      magnifierCanvas.value.style.position = "absolute";
      magnifierCanvas.value.style.border = "1px solid #ccc";
      magnifierCanvas.value.style.borderRadius = "50%";
      magnifierCanvas.value.style.pointerEvents = "none";
      magnifierCanvas.value.style.zIndex = "1000";

      document.body.appendChild(magnifierCanvas.value);
      magnifierCtx.value = magnifierCanvas.value.getContext("2d");

      canvas.value.addEventListener("mousemove", handleMouseMove);
    }
  });

  onUnmounted(() => {
    if (canvas.value) {
      canvas.value.removeEventListener("mousemove", handleMouseMove);
      if (magnifierCanvas.value) {
        document.body.removeChild(magnifierCanvas.value);
      }
    }
  });

  function handleMouseMove(event: MouseEvent) {
    if (!canvas.value || !magnifierCanvas.value || !magnifierCtx.value) return;

    const rect = canvas.value.getBoundingClientRect();
    const mouseX = (event.clientX - rect.left) * canvas.value.width / rect.width;
    const mouseY = (event.clientY - rect.top) * canvas.value.height / rect.height;

    const sx = mouseX - magnifierSize / (2 * magnifierScale);
    const sy = mouseY - magnifierSize / (2 * magnifierScale);

    magnifierCtx.value.clearRect(0, 0, magnifierSize, magnifierSize);
    magnifierCtx.value.drawImage(
      canvas.value,
      sx,
      sy,
      magnifierSize / magnifierScale,
      magnifierSize / magnifierScale,
      0,
      0,
      magnifierSize,
      magnifierSize
    );

    magnifierCanvas.value.style.left = `${event.clientX + 20}px`;
    magnifierCanvas.value.style.top = `${event.clientY + 20}px`;
  }

  return {
    magnifierCanvas,
    magnifierCtx
  };
}
