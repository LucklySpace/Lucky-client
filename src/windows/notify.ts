// notifyWindow.ts
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalPosition, LogicalSize, PhysicalSize, Window } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { StoresEnum } from "@/constants/index";

const log = useLogger();

/** hide watchers map：key = window label, value = intervalId */
const hideWatchers = new Map<string, WatcherState>();

type WatcherState = { intervalId: number; hideTimerId?: number | null; busy?: boolean };

/**
 * 将物理像素转换为 CSS/逻辑像素（与 window API 保持一致）
 * @param pixelPosition 物理像素坐标
 * @param devicePixelRatio 设备像素比，默认 window.devicePixelRatio
 * @returns CSS 像素坐标
 */
export const calculateCssPosition = (
  pixelPosition: number,
  devicePixelRatio: number = window.devicePixelRatio
): number => {
  return pixelPosition / devicePixelRatio;
};

// ---------- 辅助：把可能是物理像素的 rect 转成 CSS 像素（容错） ----------
function normalizeRectToCss(
  rect: { x: number; y: number; width?: number; height?: number } | null,
  devicePixelRatio = window.devicePixelRatio
) {
  if (!rect || typeof rect.x !== "number" || typeof rect.y !== "number") return null;
  return {
    x: rect.x / devicePixelRatio,
    y: rect.y / devicePixelRatio,
    width: typeof rect.width === "number" ? rect.width / devicePixelRatio : 24,
    height: typeof rect.height === "number" ? rect.height / devicePixelRatio : 24
  };
}

/**
 * 更稳健的托盘位置判定（top / bottom）
 * - 使用托盘中心 y 与 screen.availHeight 的比值判定，但 threshold 更保守（0.6）
 * - 如果 trayRect 不存在，fallback 为 'bottom'（常见场景）
 */
function detectTrayAnchorRobust(trayRectCss: { x: number; y: number; width: number; height: number } | null) {
  if (!trayRectCss) return "bottom";
  const trayCenterY = trayRectCss.y + trayRectCss.height / 2;
  const threshold = window.screen.availHeight * 0.6; // 更保守的分界线，减少误判
  return trayCenterY > threshold ? "bottom" : "top";
}

/**
 * 优化后的计算交互区域（托盘矩形 与 窗口矩形 的并集 + padding）
 *
 * 说明：
 *  - 不再假设窗口“水平居中于托盘中心”。调用方应传入窗口的实际 x,y,width,height（CSS 像素）。
 *  - 支持托盘 rect 为空（会退化为窗口区域 + padding）。
 *  - 增加 padding/tolerance（默认 12px），容忍鼠标取样延迟与 DPI 误差。
 *  - 对负坐标（多显示器、左/上方屏幕）友好。
 */
function calculateInteractionBoundsWithTrayOptimized(
  trayRectCss: { x: number; y: number; width: number; height: number } | null,
  windowRectCss: { x: number; y: number; width: number; height: number },
  options: { padding?: number } = {}
) {
  const padding = typeof options.padding === "number" ? options.padding : 12;

  // 确保 window rect 有效
  const win = windowRectCss;
  if (!win || typeof win.x !== "number" || typeof win.y !== "number") {
    // 极端回退：把整个屏幕作为交互区域（避免误关闭）
    return { left: -Infinity, right: Infinity, top: -Infinity, bottom: Infinity };
  }

  // 若没有托盘信息，只用窗口区域并扩展 padding
  if (!trayRectCss) {
    return {
      left: Math.floor(win.x - padding),
      right: Math.ceil(win.x + win.width + padding),
      top: Math.floor(win.y - padding),
      bottom: Math.ceil(win.y + win.height + padding)
    };
  }

  // 托盘 & 窗口的并集（考虑二者可能不在同一屏幕）
  const trayLeft = trayRectCss.x;
  const trayRight = trayRectCss.x + trayRectCss.width;
  const trayTop = trayRectCss.y;
  const trayBottom = trayRectCss.y + trayRectCss.height;

  const winLeft = win.x;
  const winRight = win.x + win.width;
  const winTop = win.y;
  const winBottom = win.y + win.height;

  // union
  let left = Math.min(trayLeft, winLeft);
  let right = Math.max(trayRight, winRight);
  let top = Math.min(trayTop, winTop);
  let bottom = Math.max(trayBottom, winBottom);

  // 如果 union 区域非常小（比如托盘和窗口在同一竖直线而宽度极小），适当扩大最小交互区，避免鼠标轻微偏移就判定为“外”
  const minInteractiveWidth = Math.max(win.width, trayRectCss.width, 100); // 最小宽度阈（像素）
  const unionWidth = right - left;
  if (unionWidth < minInteractiveWidth) {
    const expand = Math.ceil((minInteractiveWidth - unionWidth) / 2) + padding;
    left -= expand;
    right += expand;
  }

  // 最后加上 padding（容忍鼠标采样延迟 & DPI 差异）
  left = Math.floor(left - padding);
  right = Math.ceil(right + padding);
  top = Math.floor(top - padding);
  bottom = Math.ceil(bottom + padding);

  return { left, right, top, bottom };
}

/**
 * 根据托盘与屏幕位置，判断托盘是位于屏幕顶部还是底部。
 * 简单策略：如果 trayY 在屏幕高度的一半以上 => 视为底部（bottom），否则为 top
 *
 * @param trayY 托盘 y（CSS 像素）
 * @returns 'top' | 'bottom'
 */
function detectTrayAnchor(trayY: number): "top" | "bottom" {
  const screenMid = window.screen.height / 2;
  return trayY > screenMid ? "bottom" : "top";
}

/**
 * 启动自动隐藏监控器
 *
 * @param label 窗口 label
 * @param trayRectRaw 原始托盘 rect（可能包含物理像素），形如 { x, y, width?, height? } 或 null
 * @param pollIntervalMs 轮询间隔（ms）
 */
async function startAutoHideWatcher(
  label: string,
  trayRectRaw: any | null = null,
  pollIntervalMs = 200,
  hideDebounceMs = 500
) {
  // 先停止已存在的 watcher（确保干净）
  stopAutoHideWatcher(label);

  // 将 raw tray rect 转为 CSS 像素（若为 null 会返回 null）
  const trayRectCss = normalizeRectToCss(
    trayRectRaw && typeof trayRectRaw.x === "number" && typeof trayRectRaw.y === "number"
      ? { x: trayRectRaw.x, y: trayRectRaw.y, width: trayRectRaw.width, height: trayRectRaw.height }
      : null
  );

  // 记录托盘 anchor（可用于其他逻辑）
  const trayAnchor = detectTrayAnchorRobust(trayRectCss);

  // 创建轮询定时器
  const intervalId = window.setInterval(async () => {
    // 获取或初始化 watcher 状态并做防重入
    let state = hideWatchers.get(label) as WatcherState | undefined;
    if (state?.busy) {
      log.prettyDebug?.("tary", "startAutoHideWatcher: 上次轮询尚未完成，跳过本次", { label });
      return;
    }
    if (!state) {
      state = { intervalId, hideTimerId: null, busy: true };
      hideWatchers.set(label, state);
    } else {
      state.busy = true;
      hideWatchers.set(label, state);
    }

    try {
      // 获取窗口引用
      const win = await Window.getByLabel(label);
      if (!win) {
        log.prettyDebug("tary", "startAutoHideWatcher: 窗口不存在，停止监控", { label });
        stopAutoHideWatcher(label);
        return;
      }

      // 若窗口不可见，停止监控
      if (!(await win.isVisible())) {
        log.prettyDebug("tary", "startAutoHideWatcher: 窗口不可见，停止监控", { label });
        stopAutoHideWatcher(label);
        return;
      }

      // 获取窗口内部尺寸（CSS 像素）
      const size: PhysicalSize | undefined = await win.innerSize();
      if (!size) return;

      // 尝试读取窗口屏幕位置：优先 outerPosition（包含装饰），fallback innerPosition
      let winPos: { x: number; y: number } | null = null;
      try {
        // 某些 Tauri 版本可能没有 outerPosition，这里容错处理
        // @ts-ignore
        const outer = typeof win.outerPosition === "function" ? await win.outerPosition() : null;
        // @ts-ignore
        const inner = typeof win.innerPosition === "function" ? await win.innerPosition() : null;
        winPos = outer ?? inner ?? null;
      } catch (e) {
        // 读取位置失败时不抛出，使用后面的回退值
        winPos = null;
      }

      // 如果无法得到窗口位置，尝试使用上次已知位置（如果你在 showOrCreateNotifyWindow 中保存了 lastKnownWindowX/Y 可传入）
      // 这里使用 window.screen 作为最终回退（尽量靠近底部）
      const lastKnownX = (hideWatchers.get(label) as any)?.lastKnownWindowX ?? null;
      const lastKnownY = (hideWatchers.get(label) as any)?.lastKnownWindowY ?? null;

      const windowRectCss = {
        x: winPos
          ? calculateCssPosition(winPos.x)
          : typeof lastKnownX === "number"
            ? lastKnownX
            : Math.max(0, Math.round(window.screen.width - size.width)),
        y: winPos
          ? calculateCssPosition(winPos.y)
          : typeof lastKnownY === "number"
            ? lastKnownY
            : Math.max(0, Math.round(window.screen.height - size.height)),
        width: size.width,
        height: size.height
      };

      // 计算交互区域 bounds（托盘 + 窗口 的并集，含 padding/tolerance）
      const bounds = calculateInteractionBoundsWithTrayOptimized(trayRectCss, windowRectCss, { padding: 12 });

      // 读取鼠标位置（Native invoke）
      const pos: any = await invoke("get_mouse_position");
      if (!pos || !Array.isArray(pos) || pos.length < 2) return;
      const mouseX = Number(pos[0]);
      const mouseY = Number(pos[1]);

      // 判断是否在交互区域外
      const outside = mouseX < bounds.left || mouseX > bounds.right || mouseY < bounds.top || mouseY > bounds.bottom;

      if (outside) {
        log.prettyDebug("tary", "鼠标在交互区域外，准备安排防抖隐藏", { mouseX, mouseY, bounds, label });

        // 如果没有挂起的 hideTimer，则安排一次防抖隐藏
        const cur = hideWatchers.get(label) as WatcherState | undefined;
        if (!cur?.hideTimerId) {
          const hideTimerId = window.setTimeout(async () => {
            try {
              log.prettyInfo("tary", "hide timer fired, 隐藏通知窗口", { label });
              await hideNotifyWindow(label);
            } catch (err) {
              log.prettyWarn("tary", "hideNotifyWindow 异常", err);
            } finally {
              // 清理 hideTimerId 标记
              const st = hideWatchers.get(label);
              if (st) st.hideTimerId = null;
            }
          }, hideDebounceMs);

          // 保存 hideTimerId（并保留 lastKnownWindowX/Y 以便回退使用）
          const st = hideWatchers.get(label) || { intervalId };
          (st as any).hideTimerId = hideTimerId;
          // 也保存当前 windowRect 作为 lastKnown（用于无法读取 outerPosition 时的回退）
          (st as any).lastKnownWindowX = windowRectCss.x;
          (st as any).lastKnownWindowY = windowRectCss.y;
          st.busy = true; // 保持 busy 标记直到本次轮询结束
          hideWatchers.set(label, st);
        } else {
          log.prettyDebug("tary", "已有 hide 定时器，跳过再次安排", { label });
        }
      } else {
        // 鼠标在交互区内：如果存在挂起的 hideTimer，则取消它
        const st = hideWatchers.get(label) as WatcherState | undefined;
        if (st?.hideTimerId) {
          window.clearTimeout(st.hideTimerId);
          st.hideTimerId = null;
          log.prettyDebug("tary", "鼠标回到交互区，取消挂起的 hideTimer", { label });
        }
      }
    } catch (e) {
      log.prettyWarn("tary", "自动隐藏监控异常，停止监控", e);
      stopAutoHideWatcher(label);
    } finally {
      // 清除 busy 标志，允许下次执行
      const s = hideWatchers.get(label);
      if (s) s.busy = false;
    }
  }, pollIntervalMs);

  // 保存 watcher（若之前 stop 已经 set 过，会被覆盖）
  hideWatchers.set(label, { intervalId, hideTimerId: null, busy: false } as WatcherState);
  log.prettyInfo("tary", "startAutoHideWatcher 已启动", { label, intervalId, pollIntervalMs, trayAnchor });
}

/**
 * 停止自动隐藏监控器并清理定时器
 * @param label 窗口 label
 */
function stopAutoHideWatcher(label: string) {
  const satcherState = hideWatchers.get(label);
  if (satcherState) {
    clearInterval(satcherState.intervalId);
    hideWatchers.delete(label);
  }
}

/**
 * 创建或显示通知窗口
 *
 * @param chatCount 要显示的消息条数
 * @param options 托盘事件选项，可能包含：
 *  - x,y (number) 表示托盘坐标（物理像素或 CSS 像素，取决于平台）
 *  - rect: { position: { x, y }, size: { width, height } }（若平台提供）
 */
export const showOrCreateNotifyWindow = async (chatCount: number, options: any) => {
  if (chatCount === 0) {
    log.prettyWarn("tary", "消息数量为0,不显示通知窗口");
    return;
  }

  const displayedCount = Math.min(chatCount, 6);
  const height = 70 + displayedCount * 48;
  const width = 220;

  // 解析托盘 raw rect / pos（优先 rect.position）
  const rawTrayPos = options?.rect?.position ?? { x: options?.x, y: options?.y };
  const rawTraySize = options?.rect?.size ?? { width: options?.width, height: options?.height };

  // 如果没有 tray pos，fallback 到屏幕右下角
  const trayPosGiven = rawTrayPos && typeof rawTrayPos.x === "number" && typeof rawTrayPos.y === "number";
  const trayX = trayPosGiven ? calculateCssPosition(rawTrayPos.x) : window.screen.width - width / 2;
  //const trayY = trayPosGiven ? calculateCssPosition(rawTrayPos.y) : window.screen.height - height;

  // 计算最终窗口位置（基于托盘中心水平居中，向上或向下展开以避开托盘）
  // 判定托盘 anchor（top/bottom）
  //const trayAnchor = trayY > window.screen.height / 2 ? "bottom" : "top";
  const x = Math.max(0, Math.min(window.screen.width - width, Math.round(trayX - width / 2)));
  // 弹窗y轴位置
  const y = screen.availHeight - height;
  //   const y =
  //     trayAnchor === "bottom"
  //       ? Math.max(0, trayY - height)
  //       : Math.max(0, trayY + (rawTraySize?.height ? calculateCssPosition(rawTraySize.height) : 0));

  const label = StoresEnum.NOTIFY;
  const config = {
    label,
    title: "消息通知",
    url: "/notify",
    width,
    height,
    x,
    y,
    resizable: false,
    decorations: false,
    alwaysOnTop: true,
    transparent: false,
    shadow: false
  };

  try {
    let appWindow: Window | null = null;
    try {
      appWindow = await Window.getByLabel(label);
    } catch (e) {
      appWindow = null;
    }

    if (!appWindow) {
      const newWin = new WebviewWindow(config.label, config);

      log.prettyInfo("tary", "创建通知窗口成功", newWin.label);

      // 延迟启动自动隐藏（允许窗口完成布局）
      setTimeout(() => {
        // 传递完整 tray rect（包括位置与 size，如有）
        const trayRectRaw = trayPosGiven
          ? { x: rawTrayPos.x, y: rawTrayPos.y, width: rawTraySize?.width, height: rawTraySize?.height }
          : null;
        startAutoHideWatcher(label, trayRectRaw);
      }, 300);
      return;
    } else {
      await appWindow.setAlwaysOnTop(true);
      await appWindow.setSize(new LogicalSize(width, height));
      await appWindow.setPosition(new LogicalPosition(x, y));
      await appWindow.show();
      await appWindow.setFocus();
      try {
        await appWindow.setContentProtected(true);
      } catch (e) {
        log.prettyWarn("tary", "setContentProtected 失败", e);
      }
      log.prettyInfo("tary", "通知窗口已存在，已更新尺寸和位置", { x, y, width, height });

      // 重启自动隐藏监控，传递 tray rect（如果有）
      const trayRectRaw = trayPosGiven
        ? { x: rawTrayPos.x, y: rawTrayPos.y, width: rawTraySize?.width, height: rawTraySize?.height }
        : null;
      startAutoHideWatcher(label, trayRectRaw);
    }
  } catch (e) {
    log.prettyError("tary", "创建或显示通知窗口失败", e);
  }
};

/**
 * 关闭（销毁）通知窗口
 */
export const CloseNotifyWindow = async () => {
  const label = StoresEnum.NOTIFY;
  try {
    const win = await Window.getByLabel(label);
    if (win) {
      await win.close();
      stopAutoHideWatcher(label);
      log.prettyInfo("tary", "通知窗口已关闭");
    }
  } catch (e) {
    log.prettyWarn("tary", "关闭通知窗口失败或窗口不存在", e);
  }
};

/**
 * 隐藏通知窗口（不销毁）
 * @param label 指定窗口 label（默认 StoresEnum.NOTIFY）
 */
export const hideNotifyWindow = async (label: string = StoresEnum.NOTIFY) => {
  try {
    const win = await Window.getByLabel(label);
    if (win) {
      await win.hide();
      stopAutoHideWatcher(label);
      log.prettyInfo("tary", "通知窗口隐藏");
    }
  } catch (e) {
    log.prettyWarn("tary", "隐藏通知窗口失败或窗口不存在", e);
  }
};

/**
 * 立即根据托盘事件计算是否需要隐藏通知窗口（一次性判断）
 * 适用于托盘 mouseleave/blur 等事件触发后的判断
 *
 * 逻辑要点：
 *  - 统一把托盘 rect 转为 CSS 像素（normalizeRectToCss）
 *  - 尝试读取窗口真实位置（outerPosition -> innerPosition），回退到上次已知位置或 screen
 *  - 计算托盘与窗口的并集 bounds（带 padding 与最小宽度容错）
 *  - sleep(180) 后读取鼠标位置，再依据 bounds 决定是否隐藏
 */
export const calculateHideNotifyWindow = async (event: any) => {
  try {
    const rawTrayPos = event?.rect?.position ?? { x: event?.x, y: event?.y };
    const rawTraySize = event?.rect?.size ?? { width: event?.width, height: event?.height };

    // 如果没有托盘位置信息，记录警告并退出（无法判断）
    if (!rawTrayPos || typeof rawTrayPos.x !== "number" || typeof rawTrayPos.y !== "number") {
      log.prettyWarn("tary", "calculateHideNotifyWindow：未提供托盘位置，忽略");
      return;
    }

    // 统一 normalize 到 CSS 像素
    const trayRectCss = normalizeRectToCss({
      x: rawTrayPos.x,
      y: rawTrayPos.y,
      width: rawTraySize?.width,
      height: rawTraySize?.height
    });

    // 如果 normalize 失败（极少数情况），也退出以避免误判
    if (!trayRectCss) {
      log.prettyWarn("tary", "calculateHideNotifyWindow：托盘 rect normalize 失败，忽略");
      return;
    }

    const label = StoresEnum.NOTIFY;
    const win = await Window.getByLabel(label);
    if (!win || !(await win.isVisible())) {
      log.prettyDebug("tary", "calculateHideNotifyWindow: 通知窗口不存在或不可见，跳过隐藏检测");
      return;
    }

    // 获取窗口尺寸（CSS 像素）
    const size = await win.innerSize();
    if (!size) {
      log.prettyWarn("tary", "calculateHideNotifyWindow: 无法读取窗口尺寸，跳过");
      return;
    }

    // 尝试读取窗口在屏幕上的真实位置（优先 outerPosition，fallback innerPosition）
    let winPos: { x: number; y: number } | null = null;
    try {
      // @ts-ignore - 适配不同 tauri 版本
      const outer = typeof win.outerPosition === "function" ? await win.outerPosition() : null;
      // @ts-ignore
      const inner = typeof win.innerPosition === "function" ? await win.innerPosition() : null;
      winPos = outer ?? inner ?? null;
    } catch (e) {
      // 读取失败仅记录日志，继续使用回退值
      log.prettyDebug("tary", "calculateHideNotifyWindow: 读取窗口位置失败，使用回退值", e);
      winPos = null;
    }

    // 回退：尝试取上次保存的 lastKnownWindowX/Y（若 startAutoHideWatcher 已保存），否则使用屏幕底部右侧作为默认
    const watcherState = hideWatchers.get(label) as any;
    const lastKnownX = watcherState?.lastKnownWindowX;
    const lastKnownY = watcherState?.lastKnownWindowY;

    const windowRectCss = {
      x: winPos
        ? calculateCssPosition(winPos.x)
        : typeof lastKnownX === "number"
          ? lastKnownX
          : Math.max(0, Math.round(window.screen.width - size.width)),
      y: winPos
        ? calculateCssPosition(winPos.y)
        : typeof lastKnownY === "number"
          ? lastKnownY
          : Math.max(0, Math.round(window.screen.height - size.height)),
      width: size.width,
      height: size.height
    };

    // 计算交互区域 bounds（托盘 + 窗口 的并集，含容差）
    const bounds = calculateInteractionBoundsWithTrayOptimized(trayRectCss, windowRectCss, { padding: 12 });

    // 延迟 180ms 避免短时移出（与旧逻辑保持一致）
    await sleep(180);

    // 读取当前鼠标位置（native invoke）
    const pos: any = await invoke("get_mouse_position");
    if (!pos || !Array.isArray(pos) || pos.length < 2) {
      log.prettyDebug("tary", "calculateHideNotifyWindow: 无法读取鼠标位置，跳过隐藏判断");
      return;
    }
    const mouseX = Number(pos[0]);
    const mouseY = Number(pos[1]);

    // 判定是否在 bounds 外
    if (mouseX < bounds.left || mouseX > bounds.right || mouseY < bounds.top || mouseY > bounds.bottom) {
      log.prettyInfo("tary", "calculateHideNotifyWindow: 鼠标移出交互区域，隐藏通知窗口", { mouseX, mouseY, bounds });
      await hideNotifyWindow(label);
    } else {
      log.prettyDebug("tary", "calculateHideNotifyWindow: 鼠标仍在交互区域内", { mouseX, mouseY, bounds });
    }
  } catch (e) {
    log.prettyWarn("tary", "calculateHideNotifyWindow 异常", e);
  }
};

/**
 * 检测当前操作系统（UA 简单识别）
 */
export const detectOS = (): string => {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "iOS";
  if (/Macintosh|Mac OS X/.test(ua)) return "macOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown OS";
};

/** 简单 sleep */
function sleep(time: number) {
  return new Promise(resolve => setTimeout(resolve, time));
}

export default {
  showOrCreateNotifyWindow,
  CloseNotifyWindow,
  hideNotifyWindow,
  calculateHideNotifyWindow,
  detectOS
};
