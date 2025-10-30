import { useSettingStore } from "@/store/modules/setting";
import { watch } from "vue";

const domSymbol = Symbol("watermark-dom");

export interface WatermarkOptions {
  text: string;
  fontSize?: number;
  rotate?: number;
  rows?: number;
  cols?: number;
}

/**
 * 水印
 * @param appendEl
 * @returns
 */
export function useWatermark(appendEl: HTMLElement | null = document.body) {
  const id = domSymbol.toString();
  const settingStore = useSettingStore();
  let watermarkOptions: WatermarkOptions | null = null;
  let resizeHandler: () => void = () => {
  };

  const clear = () => {
    const dom = document.getElementById(id);
    if (dom) {
      appendEl?.removeChild(dom);
    }
    window.removeEventListener("resize", resizeHandler);
  };

  const createWatermark = (options: WatermarkOptions) => {

    clear();

    const { text, fontSize = 16, rotate = -20, rows = 3, cols = 3 } = options;

    const canvas = document.createElement("canvas");
    // 获取视口宽高
    const winWidth = document.documentElement.clientWidth;
    const winHeight = document.documentElement.clientHeight;

    // 计算每个水印单元格的宽高
    const cellWidth = Math.floor(winWidth / cols);
    const cellHeight = Math.floor(winHeight / rows);

    canvas.width = cellWidth;
    canvas.height = cellHeight;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, cellWidth, cellHeight);
      ctx.rotate((rotate * Math.PI) / 180);
      ctx.font = `${fontSize}px Vedana`;
      ctx.fillStyle = settingStore.getIsDark() ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(text, cellWidth / 20, cellHeight / 2);
    }

    const div = document.createElement("div");
    div.id = id;
    div.style.pointerEvents = "none";
    div.style.top = "0";
    div.style.left = "0";
    div.style.position = "absolute";
    div.style.zIndex = "100000000";

    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;

    div.style.width = width + "px";
    div.style.height = height + "px";
    div.style.backgroundImage = `url(${canvas.toDataURL("image/png")})`;
    div.style.backgroundRepeat = "repeat";

    appendEl?.appendChild(div);
  };

  const setWatermark = (options: WatermarkOptions) => {
    watermarkOptions = options;
    createWatermark(options);

    resizeHandler = () => {
      if (watermarkOptions) {
        createWatermark(watermarkOptions);
      }
    };
    window.addEventListener("resize", resizeHandler);
  };

  watch(
    () => settingStore.getIsDark(),
    () => {
      if (watermarkOptions) {
        createWatermark(watermarkOptions);
      }
    }
  );

  return {
    setWatermark,
    clear
  };
}
