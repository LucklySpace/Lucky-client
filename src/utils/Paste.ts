// onPaste.ts
// 用于在 contenteditable 区域处理粘贴事件，支持文本、文件和图片，并对图片进行压缩

interface PasteResult {
  data: File | string;
  type: "image" | "file" | "string";
  url?: string; // 压缩后图片的 Data URL
}

type CompressOptions = {
  maxHeight?: number; // 压缩后的最大高度，默认 200px
  quality?: number; // 压缩质量，0~1，默认 0.75
};

/**
 * 处理粘贴事件
 * @param event ClipboardEvent
 * @returns Promise<PasteResult>
 */
export default async function onPaste(event: ClipboardEvent): Promise<PasteResult> {
  const clipboard = event.clipboardData;
  if (!clipboard) {
    throw new Error("剪贴板数据不可用");
  }

  // 遍历所有粘贴项
  for (const item of Array.from(clipboard.items)) {
    if (item.kind === "file") {
      const file = item.getAsFile();
      if (!file) continue;
      // 图片类型
      if (/^image\//.test(file.type)) {
        const url = await handleImage(file);
        return { data: file, type: "image", url };
      }
      // 其他文件类型
      return { data: file, type: "file" };
    }
    if (item.kind === "string") {
      const text = clipboard.getData("text");
      return { data: text, type: "string" };
    }
  }

  throw new Error("不支持的粘贴类型");
}

/**
 * 将图片文件读取并压缩成 Data URL
 * @param file 原始图片 File
 * @param options 压缩参数
 * @returns Promise<string> 压缩后的 Data URL
 */
async function handleImage(file: File, options: CompressOptions = {}): Promise<string> {
  const { maxHeight = 200, quality = 0.75 } = options;

  // 读取为 Data URL
  const dataUrl = await readFileAsDataURL(file);

  // 创建 Image 对象
  const img = await loadImage(dataUrl);

  // 压缩并返回
  return compressImage(img, file.type, maxHeight, quality);
}

/**
 * FileReader => Data URL
 */
function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

/**
 * 加载 Image 对象
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = src;
  });
}

/**
 * 使用 canvas 对图片进行压缩
 */
function compressImage(img: HTMLImageElement, mimeType: string, maxHeight: number, quality: number): string {
  const ratio = img.width / img.height;
  const height = Math.min(img.height, maxHeight);
  const width = height * ratio;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d")!;
  // 白底，防止透明图片变黑
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  // 导出 Data URL
  let dataUrl = canvas.toDataURL(mimeType, quality);

  // 支持 GIF
  if (mimeType === "image/gif") {
    // 将前缀统一改为 data:image/gif;base64,（更直接、语义清晰）
    dataUrl = dataUrl.replace(/^data:image[^;]*;base64,/, "data:image/gif;base64,");
  }
  return dataUrl;
}
