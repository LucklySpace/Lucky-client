import type { App } from "vue";

import { resize } from "./resize";
import { debounce } from "./debounce";
import { throttle } from "./throttle";
import { slide } from "./slide";
import { lazys } from "./lazy";
import { vContextMenu } from "./contextmenu";
import { createDomPurifyDirective } from "./dompurify";

// 全局注册 directive
function setupDirective(app: App<Element>) {
  /** 滑动 */
  app.directive("slide", slide);
  /** 窗口大小改变 */
  app.directive("resize", resize);
  /** 防抖*/
  app.directive("debounce", debounce);
  /** 节流 */
  app.directive("throttle", throttle);
  /** 图片懒加载 */
  app.directive("lazys", lazys);
  /** 右键菜单 */
  app.directive("context-menu", vContextMenu);
  /** 安全操作dom */
  const myDirective = createDomPurifyDirective({
    cacheSize: 300,
    defaultAsync: true,
    fallbackToRaw: false,
    globalConfig: { ALLOWED_TAGS: ["a", "p", "br", "strong", "em", "img"] }
  });
  app.directive("dompurify", myDirective);
}

export default setupDirective;
