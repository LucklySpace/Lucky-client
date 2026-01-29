import { Window } from "@tauri-apps/api/window";

type MaybeWindow = Window | null;

const windowCache = new Map<string, Window>();

export async function getWindow(label: string, useCache = true): Promise<MaybeWindow> {
  if (useCache) {
    const cached = windowCache.get(label);
    if (cached) return cached;
  }

  try {
    const win = await Window.getByLabel(label);
    if (win) {
      windowCache.set(label, win);
      return win;
    }
  } catch {
    // ignore: window may not exist yet
  }

  return null;
}

export function clearWindowCache(label: string): void {
  windowCache.delete(label);
}

export async function withWindow(
  label: string,
  action: (win: Window) => Promise<void>,
  warnMessage?: string
): Promise<boolean> {
  const win = await getWindow(label);
  if (!win) {
    if (warnMessage) console.warn(warnMessage);
    return false;
  }

  try {
    await action(win);
    return true;
  } catch (error) {
    if (warnMessage) console.warn(warnMessage, error);
    return false;
  }
}

export async function showAndFocus(label: string): Promise<boolean> {
  return withWindow(label, async win => {
    await win.show();
    await win.unminimize();
    await win.setFocus();
  });
}

export async function hideWindow(label: string): Promise<boolean> {
  return withWindow(label, win => win.hide());
}

export async function closeWindow(label: string): Promise<boolean> {
  const closed = await withWindow(label, win => win.close());
  if (closed) clearWindowCache(label);
  return closed;
}

