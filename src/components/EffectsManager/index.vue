<template>
  <div ref="root" :style="{ zIndex }" aria-hidden="true" class="effects-root">
    <canvas ref="canvas" class="effects-canvas" />
    <div ref="emojiLayer" class="emoji-layer" />
  </div>
</template>

<script lang="ts" setup>
  /**
   * 新增功能：
   * - prop: defaultSparsity (0..1) -> 组件默认稀疏度
   * - play(payload) 支持 payload.sparsity (0..1) -> 运行时覆盖
   *
   * sparsity:
   *  - 0 -> 最密集（更接近原来的密集效果）
   *  - 1 -> 最稀疏（粒子之间更宽）
   */

  const props = defineProps({
    zIndex: { type: Number as PropType<number>, default: 999 },
    resources: {
      type: Object as PropType<{ emojis?: string[] }>,
      default: () => ({ emojis: ["🎉", "✨", "❤️", "👍", "🔥"] })
    },
    defaultSparsity: { type: Number as PropType<number>, default: 0.5 } // 0..1
  });

  const zIndex = props.zIndex;
  const root = ref<HTMLElement | null>(null);
  const canvas = ref<HTMLCanvasElement | null>(null);
  const emojiLayer = ref<HTMLElement | null>(null);

  let w = 0,
    h = 0,
    dpr = 1;
  let ro: ResizeObserver | null = null;
  let resizeRaf: number | null = null;
  let animRaf: number | null = null;

  type Particle = {
    x: number;
    startY: number;
    size: number;
    emoji: string;
    drift: number;
    rot: number;
    startTime: number;
    life: number;
    dropDist: number;
    keyword?: string;
  };
  const particles: Particle[] = [];
  let ctx: CanvasRenderingContext2D | null = null;

  onMounted(() => {
    dpr = window.devicePixelRatio || 1;
    updateSizeInternal(true);
    if (canvas.value) ctx = canvas.value.getContext("2d");

    if ("ResizeObserver" in window && root.value) {
      ro = new ResizeObserver(() => {
        if (resizeRaf !== null) return;
        resizeRaf = requestAnimationFrame(() => {
          resizeRaf = null;
          updateSizeInternal(false);
        });
      });
      ro.observe(root.value);
    } else {
      window.addEventListener("resize", onWindowResize);
    }
  });

  onBeforeUnmount(() => {
    if (ro && root.value) ro.unobserve(root.value);
    ro = null;
    window.removeEventListener("resize", onWindowResize);
    if (resizeRaf !== null) {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = null;
    }
    stopAnimLoop();
    clearCanvas();
    particles.length = 0;
  });

  function onWindowResize() {
    if (resizeRaf !== null) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = null;
      updateSizeInternal(false);
    });
  }

  function updateSizeInternal(forceClear = false) {
    if (!root.value || !canvas.value) {
      if (!root.value) return;
    }
    const rect = root.value?.parentElement!.getBoundingClientRect();
    const cssW = Math.max(100, Math.floor(rect.width));
    const cssH = Math.max(100, Math.floor(rect.height));
    w = Math.max(1, cssW);
    h = Math.max(1, cssH);

    if (canvas.value) {
      canvas.value.style.width = `${w}px`;
      canvas.value.style.height = `${h}px`;
      canvas.value.width = Math.floor(w * dpr);
      canvas.value.height = Math.floor(h * dpr);
      const c = canvas.value.getContext("2d");
      if (c) {
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (forceClear) c.clearRect(0, 0, w, h);
      }
      ctx = c;
    }
  }

  function clearCanvas() {
    if (ctx) ctx.clearRect(0, 0, w, h);
  }

  function stopAnimLoop() {
    if (animRaf !== null) {
      cancelAnimationFrame(animRaf);
      animRaf = null;
    }
  }

  function clamp(v: number, a: number, b: number) {
    return Math.max(a, Math.min(b, v));
  }

  function easeLinear(t: number) {
    return t;
  }

  function startAnimLoopIfNeeded() {
    if (animRaf !== null) return;

    function loop(now: number) {
      tick(now);
      if (particles.length > 0) {
        animRaf = requestAnimationFrame(loop);
      } else {
        animRaf = null;
        clearCanvas();
      }
    }

    animRaf = requestAnimationFrame(loop);
  }

  function tick(now: number) {
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const t = clamp((now - p.startTime) / p.life, 0, 1);
      const eased = easeLinear(t); // 线性 -> 像雨滴
      const y = p.startY + eased * p.dropDist;
      const sway = Math.sin(eased * Math.PI * 2 + p.x) * (p.drift * 0.12);
      const x = p.x + p.drift * eased + sway;
      const rot = p.rot * (eased * 2 - 1);
      const fadeStart = 0.92;
      const opacity = t < fadeStart ? 1 : clamp(1 - (t - fadeStart) / (1 - fadeStart), 0, 1);

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${p.size}px sans-serif`;
      ctx.fillText(p.emoji, 0, 0);
      ctx.restore();

      if (t >= 1) particles.splice(i, 1);
    }
  }

  /**
   * 生成位置：拒绝采样保证水平最小间距，避免聚集
   */
  function generateXPositions(targetCount: number, pad: number, usableW: number, minGap: number, sizes: number[]) {
    const xs: number[] = [];
    for (let k = 0; k < targetCount; k++) {
      const size = sizes[k] ?? 18;
      let accepted = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        const x = Math.round(pad + Math.random() * Math.max(0, usableW - size));
        let ok = true;
        for (let prev of xs) {
          if (Math.abs(prev - x) < minGap) {
            ok = false;
            break;
          }
        }
        if (ok) {
          xs.push(x);
          accepted = true;
          break;
        }
      }
      // 如果找不到就跳过（避免强制堆叠）
    }
    return xs;
  }

  type PlayPayload = {
    keyword?: string;
    emojis: string | string[];
    count?: number;
    duration?: number;
    sparsity?: number; // 0..1 可选，越大越稀疏
    sizeMin?: number; // 可选，最小尺寸（px）
    sizeMax?: number; // 可选，最大尺寸（px）
  };

  /**
   * 绘制特效
   */
  function play(payload: PlayPayload) {
    if (!canvas.value || !ctx) return;

    const { keyword, emojis, count = 12, duration = 2000 } = payload;
    const list = Array.isArray(emojis) ? emojis : [emojis];
    const sparsityRaw = payload.sparsity ?? props.defaultSparsity;
    const sparsity = clamp(Number.isFinite(+sparsityRaw) ? +sparsityRaw : 0.5, 0, 1);

    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const baseDrop = winH + 80;
    const pad = 10;
    const usableW = Math.max(0, winW - pad * 2);

    // ====== 新：根据 payload.sizeMin/sizeMax 计算尺寸区间（像素） ======
    // 默认范围
    const DEFAULT_MIN = 10;
    const DEFAULT_MAX = 20;

    // 将传入值转为数字并做容错
    const rawMin = Number.isFinite(payload.sizeMin as any) ? Number(payload.sizeMin) : DEFAULT_MIN;
    const rawMax = Number.isFinite(payload.sizeMax as any) ? Number(payload.sizeMax) : DEFAULT_MAX;

    // 强制约束：min <= max，且在合理像素范围内（6..300）
    const minSize = clamp(Math.min(rawMin, rawMax), 6, 300);
    const maxSize = clamp(Math.max(rawMin, rawMax), minSize, 300);
    // =================================================================

    // 预生成尺寸（现在使用可配置区间）
    const sizes: number[] = [];
    for (let i = 0; i < count; i++) {
      const s = Math.round(minSize + Math.random() * (maxSize - minSize));
      sizes.push(s);
    }

    // compute minGap based on sparsity:
    const avgSlot = usableW / Math.max(1, count);
    const sparsityScale = 0.25 + sparsity * 2.0;
    let minGap = Math.round(avgSlot * sparsityScale);
    minGap = Math.max(16, minGap);
    minGap = Math.min(minGap, usableW);
    if (count <= 2) minGap = Math.min(minGap, Math.floor(usableW / Math.max(1, count)));

    const xs = generateXPositions(count, pad, usableW, minGap, sizes);

    const nowBase = performance.now();
    for (let i = 0; i < xs.length; i++) {
      const startX = xs[i];
      const size = sizes[i];
      const startTopJitter = Math.round((Math.random() - 0.5) * 6);
      const startY = -size - 6 + startTopJitter;
      const dur = Math.round(duration * (0.95 + Math.random() * 0.1));
      const delay = Math.round((i / Math.max(1, xs.length)) * (duration * 0.6) + Math.random() * (duration * 0.35));
      const drift = (Math.random() - 0.5) * 40 * 0.5;
      const rot = (Math.random() - 0.5) * ((6 * Math.PI) / 180);
      const dropDist = baseDrop + Math.random() * 40;

      const p: Particle = {
        x: startX,
        startY,
        size,
        emoji: list[Math.floor(Math.random() * list.length)],
        drift,
        rot,
        startTime: nowBase + delay,
        life: dur,
        dropDist,
        keyword
      };
      particles.push(p);
    }

    startAnimLoopIfNeeded();
  }

  defineExpose({ play });
</script>

<style lang="scss" scoped>
  .effects-root {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: transparent;
    overflow: visible;
    display: block;
  }

  .effects-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    background: transparent;
    pointer-events: none;
  }

  .emoji-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .emoji.rain {
    will-change: transform, opacity;
  }

  .emoji[data-keyword="big"] {
    font-size: 36px;
  }
</style>
