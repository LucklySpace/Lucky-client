function getPlatform(): "win" | "mac" | "linux" {
  const p = (navigator.platform || "").toLowerCase();
  if (p.includes("mac")) return "mac";
  if (p.includes("win")) return "win";
  return "linux";
}

//归一化处理, 统一修饰键&顺序, 仅用于匹配/校验, 真正注册仍用原串
export function normalizeCombo(raw: string): string {
  if (!raw) return "";
  const map: Record<string, string> = {
    control: "Ctrl",
    ctrl: "Ctrl",
    command: "Cmd",
    cmd: "Cmd",
    meta: "Cmd",
    super: "Cmd",
    win: "Cmd", // 统一到 Cmd（仅用于匹配）
    alt: "Alt",
    option: "Alt",
    shift: "Shift",
    del: "Delete",
    delete: "Delete",
    esc: "Esc",
    escape: "Esc",
    prtsc: "PrintScreen",
    printscreen: "PrintScreen"
  };
  const parts = raw
    .split("+")
    .map(p => p.trim())
    .filter(Boolean);
  const mods: string[] = [];
  let main = "";
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const key = map[p.toLowerCase()] || p;
    if (["Ctrl", "Alt", "Shift", "Cmd"].includes(key)) mods.push(key);
    else main = key.length === 1 ? key.toUpperCase() : key;
  }
  mods.sort(); // Ctrl+Alt+Shift+Cmd 固定顺序
  return main ? `${mods.join("+")}${mods.length ? "+" : ""}${main}` : mods.join("+");
}

//打回系统常用键注册
export function isSpecialCombination(combination: string): { blocked: boolean; reason?: string } {
  const norm = normalizeCombo(combination);
  if (!norm) return { blocked: false };
  // 特例：Esc 允许
  if (norm === "Esc") return { blocked: false };

  const common = new Set(["Alt+Tab", "Alt+F4", "Ctrl+Alt+Delete", "Ctrl+Shift+Esc", "PrintScreen"]);

  const win = new Set([
    "Cmd+L",
    "Cmd+D",
    "Cmd+R",
    "Cmd+Tab",
    "Cmd+Shift+S",
    "Cmd+E",
    "Cmd+X",
    "Cmd+I"
    // 说明：此处将 Win 键统一为 Cmd（仅用于匹配），不要与真正 mac 的 Cmd 混淆
  ]);

  const mac = new Set(["Cmd+Tab", "Cmd+Space", "Cmd+Alt+Esc", "Ctrl+Cmd+Power"]);

  const linuxPatterns = [
    /^Ctrl\+Alt\+F([1-9]|1[0-2])$/ // Ctrl+Alt+F1..F12
  ];

  if (common.has(norm)) return { blocked: true, reason: `${norm} 为系统保留快捷键` };

  const platform = getPlatform();
  if (platform === "win" && win.has(norm)) return { blocked: true, reason: `${norm} 为 Windows 系统保留快捷键` };
  if (platform === "mac" && mac.has(norm)) return { blocked: true, reason: `${norm} 为 macOS 系统保留快捷键` };
  if (platform === "linux" && linuxPatterns.some(r => r.test(norm))) {
    return { blocked: true, reason: `${norm} 可能被系统/窗口管理器占用` };
  }
  return { blocked: false };
}
