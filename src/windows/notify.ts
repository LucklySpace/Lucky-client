// notifyWindow.ts
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalPosition, LogicalSize, PhysicalSize, Window } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { StoresEnum } from "@/constants/index";

const log = useLogger();

// --- Types ---

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WatcherState {
  intervalId: number;
  hideTimerId?: number | null;
  busy: boolean;
  lastKnownWindowRect?: Rect | null;
}

// --- State ---

/** key = window label, value = watcher state */
const hideWatchers = new Map<string, WatcherState>();

// --- Helpers ---

/** Get device pixel ratio (fallback to 1) */
const getDpr = () => window.devicePixelRatio || 1;

/** Convert physical pixel value to CSS/Logical pixel value */
const toCss = (val: number) => val / getDpr();

/** Convert physical rect to CSS Rect */
const toCssRect = (rect: { x: number; y: number; width: number; height: number }): Rect => ({
  x: toCss(rect.x),
  y: toCss(rect.y),
  width: toCss(rect.width),
  height: toCss(rect.height),
});

/** Normalize possibly mixed/raw tray rect to CSS Rect */
function normalizeTrayRect(rect: any): Rect | null {
  if (!rect || typeof rect.x !== "number" || typeof rect.y !== "number") return null;

  // Default width/height to 24 (assumed physical if number, so convert to CSS? 
  // Original logic returned 24 literals. If those were CSS, we keep them. 
  // If they were physical, we should divide. 
  // Assuming 24 is a reasonable CSS size for a tray icon if missing.)
  const w = typeof rect.width === "number" ? rect.width : 24 * getDpr();
  const h = typeof rect.height === "number" ? rect.height : 24 * getDpr();

  return {
    x: toCss(rect.x),
    y: toCss(rect.y),
    width: toCss(w),
    height: toCss(h),
  };
}

/** Robustly detect if tray is at top or bottom */
function detectTrayAnchor(trayRectCss: Rect | null): "top" | "bottom" {
  if (!trayRectCss) return "bottom";
  const trayCenterY = trayRectCss.y + trayRectCss.height / 2;
  // Threshold 0.6 to avoid false positives near middle
  return trayCenterY > window.screen.availHeight * 0.6 ? "bottom" : "top";
}

/** 
 * Calculate interaction bounds (Union of Window + Tray + Padding) 
 * Optimized to handle missing tray, padding, and min-width.
 */
function calculateInteractionBounds(
  trayRectCss: Rect | null,
  winRectCss: Rect,
  padding = 12
) {
  // If no tray, return window + padding
  if (!trayRectCss) {
    return {
      left: Math.floor(winRectCss.x - padding),
      right: Math.ceil(winRectCss.x + winRectCss.width + padding),
      top: Math.floor(winRectCss.y - padding),
      bottom: Math.ceil(winRectCss.y + winRectCss.height + padding),
    };
  }

  // Union
  let left = Math.min(trayRectCss.x, winRectCss.x);
  let right = Math.max(trayRectCss.x + trayRectCss.width, winRectCss.x + winRectCss.width);
  let top = Math.min(trayRectCss.y, winRectCss.y);
  let bottom = Math.max(trayRectCss.y + trayRectCss.height, winRectCss.y + winRectCss.height);

  // Enforce min interactive width (prevent narrow path between tray and window)
  const minInteractiveWidth = Math.max(winRectCss.width, trayRectCss.width, 100);
  const unionWidth = right - left;
  if (unionWidth < minInteractiveWidth) {
    const expand = Math.ceil((minInteractiveWidth - unionWidth) / 2) + padding;
    left -= expand;
    right += expand;
  }

  // Apply padding
  return {
    left: Math.floor(left - padding),
    right: Math.ceil(right + padding),
    top: Math.floor(top - padding),
    bottom: Math.ceil(bottom + padding),
  };
}

/** Get current window CSS Rect with fallbacks */
async function getWindowCssRect(win: Window, lastKnown?: Rect | null): Promise<Rect> {
  let pos: { x: number; y: number } | null = null;
  let size: PhysicalSize | null = null;

  try {
    // @ts-ignore - Handle Tauri version differences
    const outer = typeof win.outerPosition === "function" ? await win.outerPosition() : null;
    // @ts-ignore
    const inner = typeof win.innerPosition === "function" ? await win.innerPosition() : null;
    pos = outer ?? inner;
    size = await win.innerSize();
  } catch (e) {
    // ignore
  }

  // Convert size (Physical) to CSS
  const widthCss = size ? toCss(size.width) : (lastKnown?.width ?? 0);
  const heightCss = size ? toCss(size.height) : (lastKnown?.height ?? 0);

  // Fallback position calculation
  let x: number, y: number;
  
  if (pos) {
    x = toCss(pos.x);
    y = toCss(pos.y);
  } else if (lastKnown) {
    x = lastKnown.x;
    y = lastKnown.y;
  } else {
    // Ultimate fallback: Bottom Right
    x = Math.max(0, window.screen.width - widthCss);
    y = Math.max(0, window.screen.height - heightCss);
  }

  return { x, y, width: widthCss, height: heightCss };
}

/** Check if mouse is outside bounds */
async function isMouseOutside(bounds: { left: number, right: number, top: number, bottom: number }): Promise<{ isOutside: boolean; mouse: { x: number; y: number } | null }> {
  const pos: any = await invoke("get_mouse_position");
  if (!pos || !Array.isArray(pos) || pos.length < 2) return { isOutside: false, mouse: null };
  
  const x = Number(pos[0]);
  const y = Number(pos[1]);
  
  const isOutside = x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom;
  return { isOutside, mouse: { x, y } };
}

function sleep(time: number) {
  return new Promise(resolve => setTimeout(resolve, time));
}

// --- Exported Functions ---

/**
 * Start auto-hide watcher
 */
export async function startAutoHideWatcher(
  label: string,
  trayRectRaw: any | null = null,
  pollIntervalMs = 200,
  hideDebounceMs = 500
) {
  stopAutoHideWatcher(label);

  const trayRectCss = normalizeTrayRect(trayRectRaw);
  const trayAnchor = detectTrayAnchor(trayRectCss);

  const intervalId = window.setInterval(async () => {
    let state = hideWatchers.get(label);
    
    // Initialize or check busy
    if (!state) {
      state = { intervalId, busy: true, lastKnownWindowRect: null };
      hideWatchers.set(label, state);
    } else if (state.busy) {
      log.prettyDebug?.("tary", "startAutoHideWatcher: busy, skipping", { label });
      return; 
    }
    
    state.busy = true;
    hideWatchers.set(label, state);

    try {
      const win = await Window.getByLabel(label);
      if (!win || !(await win.isVisible())) {
        log.prettyDebug("tary", "startAutoHideWatcher: window missing or hidden, stopping", { label });
        stopAutoHideWatcher(label);
        return;
      }

      // Get Window Rect (update lastKnown)
      const winRectCss = await getWindowCssRect(win, state.lastKnownWindowRect);
      state.lastKnownWindowRect = winRectCss;

      // Calculate Bounds
      const bounds = calculateInteractionBounds(trayRectCss, winRectCss);

      // Check Mouse
      const { isOutside, mouse } = await isMouseOutside(bounds);

      if (isOutside && mouse) {
        log.prettyDebug("tary", "Mouse outside, preparing hide", { mouse, bounds, label });

        if (!state.hideTimerId) {
            const hideTimerId = window.setTimeout(async () => {
                try {
                    log.prettyInfo("tary", "Hide timer fired", { label });
                    await hideNotifyWindow(label);
                } catch (err) {
                    log.prettyWarn("tary", "hideNotifyWindow error", err);
                } finally {
                    const s = hideWatchers.get(label);
                    if (s) s.hideTimerId = null;
                }
            }, hideDebounceMs);
            
            const updatedState = hideWatchers.get(label);
            if (updatedState) {
                updatedState.hideTimerId = hideTimerId;
                // Keep busy until next poll? No, release busy in finally block, but timer runs async.
                hideWatchers.set(label, updatedState);
            }
        }
      } else {
        // Inside: cancel timer if exists
        if (state.hideTimerId) {
            window.clearTimeout(state.hideTimerId);
            state.hideTimerId = null;
            log.prettyDebug("tary", "Mouse inside, cancelled hide timer", { label });
            hideWatchers.set(label, state);
        }
      }

    } catch (e) {
      log.prettyWarn("tary", "Watcher exception", e);
      stopAutoHideWatcher(label);
    } finally {
        const s = hideWatchers.get(label);
        if (s) s.busy = false;
    }

  }, pollIntervalMs);

  hideWatchers.set(label, { intervalId, busy: false, lastKnownWindowRect: null } as WatcherState);
  log.prettyInfo("tary", "startAutoHideWatcher started", { label, intervalId, pollIntervalMs, trayAnchor });
}

/**
 * Stop auto-hide watcher
 */
export function stopAutoHideWatcher(label: string) {
  const state = hideWatchers.get(label);
  if (state) {
    clearInterval(state.intervalId);
    if (state.hideTimerId) clearTimeout(state.hideTimerId);
    hideWatchers.delete(label);
  }
}

/**
 * Show or Create Notify Window
 */
export const showOrCreateNotifyWindow = async (chatCount: number, options: any) => {
  if (chatCount <= 0) {
    log.prettyWarn("tary", "Message count 0, ignore");
    return;
  }

  const width = 220;
  const height = 70 + Math.min(chatCount, 6) * 48;
  const label = StoresEnum.NOTIFY;

  // Calculate Position
  const rawPos = options?.rect?.position ?? { x: options?.x, y: options?.y };
  const rawSize = options?.rect?.size ?? { width: options?.width, height: options?.height };
  
  // Tray Center X or Screen Right (fallback)
  let targetX: number;
  if (rawPos && typeof rawPos.x === "number") {
      const trayX = toCss(rawPos.x);
      targetX = Math.round(trayX - width / 2);
  } else {
      targetX = window.screen.width - width / 2;
  }
  // Clamp X
  targetX = Math.max(0, Math.min(window.screen.width - width, targetX));
  
  // Y is always bottom - height
  const targetY = screen.availHeight - height;

  try {
    let win = await Window.getByLabel(label).catch(() => null);

    if (!win) {
        const config = {
            label,
            title: "消息通知",
            url: "/notify",
            width, height, x: targetX, y: targetY,
            resizable: false, decorations: false, alwaysOnTop: true, transparent: false, shadow: false
        };
        win = new WebviewWindow(label, config);
        log.prettyInfo("tary", "Created notify window", label);
    } else {
        await Promise.all([
            win.setAlwaysOnTop(true),
            win.setSize(new LogicalSize(width, height)),
            win.setPosition(new LogicalPosition(targetX, targetY)),
            win.show(),
            win.setFocus()
        ]);
        win.setContentProtected(true).catch(e => log.prettyWarn("tary", "setContentProtected failed", e));
        log.prettyInfo("tary", "Updated notify window", { x: targetX, y: targetY, width, height });
    }

    // Start Watcher after delay
    setTimeout(() => {
        const trayRectRaw = (rawPos && typeof rawPos.x === 'number') 
            ? { x: rawPos.x, y: rawPos.y, width: rawSize?.width, height: rawSize?.height }
            : null;
        startAutoHideWatcher(label, trayRectRaw);
    }, 300);

  } catch (e) {
      log.prettyError("tary", "Failed to show notify window", e);
  }
};

/**
 * Close Notify Window
 */
export const CloseNotifyWindow = async () => {
    const label = StoresEnum.NOTIFY;
    try {
        const win = await Window.getByLabel(label);
        if (win) {
            await win.close();
            stopAutoHideWatcher(label);
            log.prettyInfo("tary", "Closed notify window");
        }
    } catch (e) { log.prettyWarn("tary", "Close failed", e); }
};

/**
 * Hide Notify Window
 */
export const hideNotifyWindow = async (label: string = StoresEnum.NOTIFY) => {
    try {
        const win = await Window.getByLabel(label);
        if (win) {
            await win.hide();
            stopAutoHideWatcher(label);
            log.prettyInfo("tary", "Hidden notify window");
        }
    } catch (e) { log.prettyWarn("tary", "Hide failed", e); }
};

/**
 * Immediate hide check (e.g. on blur)
 */
export const calculateHideNotifyWindow = async (event: any) => {
    try {
        // Extract tray info
        const rawPos = event?.rect?.position ?? { x: event?.x, y: event?.y };
        const rawSize = event?.rect?.size ?? { width: event?.width, height: event?.height };
        
        // If basic pos missing, ignore
        if (!rawPos || typeof rawPos.x !== "number" || typeof rawPos.y !== "number") {
             log.prettyWarn("tary", "calculateHideNotifyWindow: missing tray pos");
             return;
        }

        const trayRectCss = normalizeTrayRect({ ...rawPos, ...rawSize });
        if (!trayRectCss) return;

        const label = StoresEnum.NOTIFY;
        const win = await Window.getByLabel(label).catch(() => null);
        if (!win || !(await win.isVisible())) return;

        // Get window rect with fallback to watcher's last known
        const watcherState = hideWatchers.get(label);
        const winRectCss = await getWindowCssRect(win, watcherState?.lastKnownWindowRect);

        // Bounds
        const bounds = calculateInteractionBounds(trayRectCss, winRectCss);

        await sleep(180);

        const { isOutside, mouse } = await isMouseOutside(bounds);
        if (isOutside && mouse) {
            log.prettyInfo("tary", "Mouse outside after check, hiding", { mouse, bounds });
            await hideNotifyWindow(label);
        } else {
            log.prettyDebug("tary", "Mouse inside, keeping open");
        }

    } catch (e) {
        log.prettyWarn("tary", "calculateHideNotifyWindow error", e);
    }
};

/** Detect OS */
export const detectOS = (): string => {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "iOS";
  if (/Macintosh|Mac OS X/.test(ua)) return "macOS";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown OS";
};

export default {
  showOrCreateNotifyWindow,
  CloseNotifyWindow,
  hideNotifyWindow,
  calculateHideNotifyWindow,
  detectOS
};
