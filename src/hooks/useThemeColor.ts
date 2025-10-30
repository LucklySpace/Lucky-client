import { ref, watchEffect } from "vue";
import { useSettingStore } from "@/store/modules/setting";

/**
 * useThemeColor - Element Plus 主题颜色切换 Hook
 * 支持浅色、深色、自动跟随系统
 */
export function useThemeColor() {
  const settingStore = useSettingStore();

  // 当前主题模式："light" | "dark" | "auto"
  const appearance = ref<"light" | "dark" | "auto">(settingStore.theme ?? "auto");

  // 系统深色偏好监听器
  const match = window.matchMedia("(prefers-color-scheme: dark)");

  /**
   * 跟随系统主题更新
   */
  const followSystem = () => {
    const systemTheme: "light" | "dark" = match.matches ? "dark" : "light";
    setHtmlTheme(systemTheme);
  };

  /**
   * 应用主题到 HTML（data-theme 和 ElementPlus 的类）
   * 切换动画：https://juejin.cn/post/7486106426571194408
   * @param theme 要切换的主题
   */
  const setHtmlTheme = async (theme: "light" | "dark", cx = 10, cy = 10) => {
    if (document.documentElement.getAttribute("data-theme") == theme) return;
    if (!("startViewTransition" in document)) {
      // 不支持 ViewTransition，直接切换
      setTheme(theme);
      return;
    }

    const transition = (document as any).startViewTransition(() => {
      setTheme(theme); // 必须有真实视觉变化
    });

    // 防止跳过动画
    transition.ready
      .then(() => {
        const R = Math.hypot(window.innerWidth - cx, window.innerHeight - cy);
        document.documentElement.animate(
          {
            clipPath: [`circle(0px at ${cx}px ${cy}px)`, `circle(${R}px at ${cx}px ${cy}px)`]
          },
          {
            duration: 500,
            pseudoElement: "::view-transition-new(root)",
            easing: "ease-in-out",
            fill: "both"
          }
        );
      })
      .catch(() => {
        //console.warn("跳过视图过渡:", err);
      });
  };

  /**
   * 设置主题
   * @param theme
   */
  const setTheme = (theme: "light" | "dark") => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("theme", theme); // ElementPlus
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
  };

  /**
   * 切换主题（会保存到本地）
   * @param theme 主题值（可选，不传则使用当前 appearance）
   */
  const toggleTheme = (theme?: "light" | "dark" | "auto") => {
    if (theme) appearance.value = theme;
    //settingStore.theme = appearance.value;
    applyTheme();
  };

  /**
   * 应用主题逻辑（根据 appearance 值）
   */
  const applyTheme = () => {
    if (appearance.value === "auto") {
      followSystem();
    } else {
      setHtmlTheme(appearance.value);
    }
    settingStore.theme = appearance.value;
  };

  // 系统主题变更时触发（仅 auto 模式下）
  match.addEventListener("change", () => {
    if (appearance.value === "auto") followSystem();
  });

  // 响应式监控 appearance 值变更
  watchEffect(() => {
    applyTheme();
  });

  return {
    appearance,
    toggleTheme
  };
}
