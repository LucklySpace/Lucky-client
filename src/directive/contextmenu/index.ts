import type { DirectiveBinding } from "vue";

interface ContextMenuOptions {
  // 菜单项
  options: Array<{ label: string; value: string }>;
  // 菜单项方法
  callback: (value: string) => void;
  beforeShow?: () => void;
}

// 单例存储
let menu: HTMLDivElement;
let styleEl: HTMLStyleElement;
// 菜单是否渲染完成
let initialized = false;

// 初始化：创建菜单元素、样式及全局点击隐藏
function initMenu(): void {
  if (initialized) return;
  // 创建菜单 DOM
  menu = document.createElement("div");
  menu.className = "context-menu";
  menu.style.display = "none";
  document.body.appendChild(menu);

  // 创建并注入样式
  styleEl = document.createElement("style");

  styleEl.textContent = `
       .context-menu {
           position: fixed;
           background: #ffffff;
           border: 1px solid #e0e0e0;
           border-radius: 6px;
           min-width: 120px;
           box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
           z-index: 9999;
           font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           transition: opacity 0.2s ease-in-out;
       }
       
       .context-menu .menu-item {
           padding: 6px 12px;
           font-size: 14px;
           color: #333333;
           cursor: pointer;
           transition: background-color 0.2s ease, color 0.2s ease;
           white-space: nowrap;
           user-select: none;
       }
       
       .context-menu .menu-item:hover {
           background-color: #f0f0f0;
           color: #007aff;
       }
       
       .context-menu .menu-item:active {
           background-color: #e6e6e6;
       }
       `;
  document.head.appendChild(styleEl);

  // 全局点击隐藏（事件委托）
  document.addEventListener("click", handleGlobalClick);
  initialized = true;
}

// 全局点击处理
function handleGlobalClick(e: MouseEvent): void {
  if (menu && !menu.contains(e.target as Node)) {
    hideMenu();
  }
}

// 渲染右键菜单项
function renderMenu(options: ContextMenuOptions["options"]): void {
  menu.innerHTML = options.map(opt => `<div class="menu-item" data-value="${opt.value}">${opt.label}</div>`).join("");
}

// 计算右键菜单位置并显示
function showMenuAt(x: number, y: number): void {
  menu.style.visibility = "hidden";
  menu.style.display = "block";
  const { width, height } = menu.getBoundingClientRect();
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  let left = x + width > winW ? winW - width - 10 : x;
  let top = y + height > winH ? winH - height - 10 : y;
  left = Math.max(10, left);
  top = Math.max(10, top);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.visibility = "visible";
}

function hideMenu(): void {
  menu.style.display = "none";
}

export const vContextMenu = {
  mounted(el: HTMLElement, binding: DirectiveBinding<ContextMenuOptions>) {
    initMenu();

    // 鼠标移出隐藏
    menu.addEventListener("mouseleave", hideMenu);

    // 右键事件
    const handler = (e: MouseEvent) => {
      e.preventDefault();
      const { options, callback, beforeShow } = binding.value;
      // 显示前方法
      beforeShow?.();
      // 渲染菜单项
      renderMenu(options);
      // 菜单出现位置
      showMenuAt(e.clientX, e.clientY);
      // 使用事件委托：点击菜单项
      menu.addEventListener(
        "click",
        (evt: MouseEvent) => {
          const target = evt.target as HTMLElement;
          if (target.classList.contains("menu-item")) {
            const val = target.dataset.value;
            if (val) callback(val);
            hideMenu();
          }
        },
        { once: true }
      ); // 只监听一次，避免重复
    };

    // 注册右键菜单监听器
    el.addEventListener("contextmenu", handler);
    (el as any).__contextMenuHandler__ = handler;
  },
  unmounted(el: HTMLElement) {
    // 清理事件
    const handler = (el as any).__contextMenuHandler__;
    if (handler) el.removeEventListener("contextmenu", handler);
    menu.removeEventListener("mouseleave", hideMenu);
  }
};
