/*
Composable Hook: useImageCache.ts
Tauri2 + Vue3
实现 img 标签图片缓存到本地
*/

import { ref, watchEffect } from "vue";
import { appCacheDir, join } from "@tauri-apps/api/path";
import { exists, mkdir, writeFile } from "@tauri-apps/plugin-fs";
import { CacheEnum } from "@/constants";


/**
 * 根据 URL 生成缓存文件名，包含原始文件后缀
 * 1. 使用 Path API 提取后缀
 * 2. 使用 SHA-256 或 Base64（此处 Base64）对 URL 编码
 */
async function urlToFilename(url: string): Promise<string> {
  // 提取文件后缀
  let suffix = "";
  try {
    const path = new URL(url).pathname;
    const ext = path.substring(path.lastIndexOf("."));
    suffix = ext || "";
  } catch {
    // fallback 无后缀
    suffix = "";
  }
  // 对 URL 做 Base64 编码并替换不可用字符
  const hash = btoa(url).replace(/[/+=]/g, "_");
  return `${hash}${suffix}`;
}

interface State {
  images: Record<string, string>,
}


/**
 * useImageCache
 * @param url - 远程图片 URL
 * @returns localSrc - 本地缓存图片路径（file://...）
 */
export function useImageCache(url: string) {

  const localSrc = ref<string>(url);

  const images = ref<Record<string, string>>();

  watchEffect(async () => {
    if (!url) return;
    try {
      // 1. 确定缓存目录
      const dir = await appCacheDir();
      const cacheDir = await join(dir, CacheEnum.IMAGE_CACHE);
      // 2. 确保目录存在
      if (!await exists(cacheDir)) {
        await mkdir(cacheDir);
      }
      // 3. 生成文件名
      const filename = await urlToFilename(url);
      const filePath = await join(cacheDir, filename);
      // 4. 检查本地是否存在
      if (await exists(filePath)) {
        localSrc.value = "file://" + filePath;
      } else {
        // 5. 下载并保存
        const response = await fetch(url);
        const blob = await response.arrayBuffer();
        await writeFile(filePath, new Uint8Array(blob));
        localSrc.value = "file://" + filePath;
      }
    } catch (e) {
      console.error("Image cache error:", e);
      localSrc.value = url; // Fallback
    }
  });

  return { localSrc };
}

/**
 <template>
 <img :src="cachedImage" alt="Cached">
 </template>

 <script setup lang="ts">
 import { useImageCache } from '@/hooks/useImageCache';

 const props = defineProps<{ src: string }>();
 const { localSrc } = useImageCache(props.src);

 // expose for template
 const cachedImage = localSrc;
 </script>
 */
