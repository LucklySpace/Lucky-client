/**
 * 获取系统
 * @returns "macos" | "windows" | "linux" | "unknown"
 */
export default function getSystem() {

  const ua = navigator.userAgent;

  const platform = navigator.platform;

  if (ua.includes("Mac OS X") || platform === "darwin") return "macos";

  if (/win64|win32/i.test(ua) || platform === "win32") return "windows";

  if (/linux/i.test(ua)) return "linux";

  return "unknown";
}