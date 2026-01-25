import { useNow } from "@vueuse/core";
import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { useI18n } from "vue-i18n";

/**
 * Vue3 Hook：集成 i18n 的时间格式化工具
 */
export function useTimeFormat() {

  const { t } = useI18n();

  /**
   * 响应式时间展示
   * @param timestamp 毫秒时间戳（或日期对象/ISO字符串）
   * @param dateFmt   日期格式
   * @param withTime  是否附加时间
   */

  function useFriendlyTime(
    timestamp: MaybeRefOrGetter<number | string | Date>,
    dateFmt = "yyyy/MM/dd",
    withTime = false
  ) {
    // 刷新间隔：30s，更新“刚刚/分钟/小时”之类
    const now = useNow({ interval: 30_000 });

    return computed(() => {
      const nowVal = new Date(toValue(now));
      const srcVal = toValue(timestamp);
      const src = srcVal instanceof Date ? srcVal : new Date(srcVal as any);

      if (isNaN(src.getTime())) return t("common.status.unknown");

      const delta = nowVal.getTime() - src.getTime();

      // 小于 1 分钟
      if (delta < 60_000) return t("common.time.justNow");

      const startOfToday = getStartOfDay(nowVal);
      const timeStr = formatDate(src, "hh:mm");

      // 如果 dateFmt 已经包含时间 token，则不再额外追加 timeStr
      const dateFmtHasTime = /h+|m+|s+/i.test(dateFmt);
      const appendTime = withTime && !dateFmtHasTime;

      // 今天：只显示时间（例如 21:52）
      if (src >= startOfToday) {
        return timeStr;
      }

      const yesterday = offsetDays(startOfToday, -1);
      const dayBeforeYesterday = offsetDays(startOfToday, -2);
      const sevenDaysAgo = offsetDays(startOfToday, -7);

      if (src >= yesterday) return t("common.time.yesterday") + (appendTime ? ` ${timeStr}` : "");
      if (src >= dayBeforeYesterday) return t("common.time.dayBeforeYesterday") + (appendTime ? ` ${timeStr}` : "");

      if (src >= sevenDaysAgo) {
        const weekday = src.getDay(); // 0-6，0 是 星期日
        const key = weekday === 0 ? "weekday7" : `weekday${weekday}`;
        return t(`time.${key}`) + (appendTime ? ` ${timeStr}` : "");
      }

      // 其它情况：按 dateFmt 格式化，只有当 dateFmt 不包含时间时才会追加时间
      return formatDate(src, dateFmt) + (appendTime ? ` ${timeStr}` : "");
    });
  }

  /** Token map for formatDate */
  const TOKEN_MAP: Record<string, (d: Date) => number> = {
    "M+": (d: Date) => d.getMonth() + 1,
    "d+": (d: Date) => d.getDate(),
    "h+": (d: Date) => d.getHours(),
    "m+": (d: Date) => d.getMinutes(),
    "s+": (d: Date) => d.getSeconds(),
    "q+": (d: Date) => Math.floor((d.getMonth() + 3) / 3),
    S: (d: Date) => d.getMilliseconds()
  };

  /**
   * 格式化日期（更健壮）
   */
  function formatDate(date: Date, fmt: string): string {
    if (!(date instanceof Date) || isNaN(date.getTime())) return "";

    // Year (support y or yy or yyyy)
    fmt = fmt.replace(/(y+)/g, (_, yToken) => {
      const full = date.getFullYear() + "";
      return full.slice(full.length - yToken.length);
    });

    // Replace other tokens (use global RegExp to replace all occurrences)
    for (const [pattern, getter] of Object.entries(TOKEN_MAP)) {
      fmt = fmt.replace(new RegExp(`(${pattern})`, "g"), (_, token) => {
        const val = getter(date).toString();
        return token.length === 1 ? val : val.padStart(token.length, "0");
      });
    }

    return fmt;
  }

  /** 返回某天 00:00:00 */
  function getStartOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  /** 偏移天 */
  function offsetDays(base: Date, days: number): Date {
    const result = new Date(base);
    result.setDate(result.getDate() + days);
    return result;
  }

  return {
    formatDate,
    useFriendlyTime
  };
}

// import { computed, toValue, type MaybeRefOrGetter } from "vue";
// import { useI18n } from "vue-i18n";
// import { useNow } from "@vueuse/core"

// /**
//  * Vue3 Hook：集成 i18n 的时间格式化工具
//  */
// export function useTimeFormat() {
//   const { t } = useI18n();

//   function formatDate(date: Date, fmt: string): string {
//     const map: Record<string, number> = {
//       "M+": date.getMonth() + 1,
//       "d+": date.getDate(),
//       "h+": date.getHours(),
//       "m+": date.getMinutes(),
//       "s+": date.getSeconds(),
//       "q+": Math.floor((date.getMonth() + 3) / 3),
//       S: date.getMilliseconds()
//     };

//     fmt = fmt.replace(/(y+)/, (_, yearToken) => (date.getFullYear() + "").slice(4 - yearToken.length));

//     return Object.keys(map).reduce((str, pattern) => {
//       return str.replace(new RegExp(`(${pattern})`), (_, token) => {
//         const val = map[pattern].toString();
//         return token.length === 1 ? val : val.padStart(token.length, "0");
//       });
//     }, fmt);
//   }

//   /**
//    * 响应式时间展示
//    * @param timestamp 毫秒时间戳（或日期对象/ISO字符串）
//    * @param dateFmt   日期格式
//    * @param withTime  是否附加时间
//    */
//   function useFriendlyTime(
//     timestamp: MaybeRefOrGetter<number | string | Date>,
//     dateFmt = "yyyy/MM/dd",
//     withTime = false
//   ) {
//     const now = useNow({ interval: 30000 }); // 每 30 秒更新

//     // 动态显示时间
//     const display = computed(() => {
//       const nowVal = new Date(toValue(now));
//       const src = new Date(toValue(timestamp));
//       const delta = nowVal.getTime() - src.getTime();

//       if (isNaN(src.getTime())) return t("common.status.unknown");

//       // 刚刚（1 分钟内）
//       if (delta < 60 * 1000) return t("time.justNow");

//       const startOfToday = new Date(nowVal.getFullYear(), nowVal.getMonth(), nowVal.getDate());

//       // 今天：直接 hh:mm
//       if (src >= startOfToday) {
//         return formatDate(src, "hh:mm");
//       }

//       const offset = (d: Date, n: number) => {
//         const dd = new Date(d);
//         dd.setDate(dd.getDate() - n);
//         return dd;
//       };

//       // 昨天
//       const yesterday = offset(startOfToday, 1);
//       // 前天
//       const dayBefore = offset(startOfToday, 2);

//       // 本周内（7 天内，不含前两天）
//       const sevenDaysAgo = offset(startOfToday, 7);
//       const timePart = withTime ? " " + formatDate(src, "hh:mm") : "";

//       if (src >= yesterday) return t("time.yesterday") + timePart;
//       if (src >= dayBefore) return t("time.dayBeforeYesterday") + timePart;
//       if (src >= sevenDaysAgo) {
//         const day = src.getDay(); // 0-6
//         const key = day === 0 ? "weekday7" : `weekday${day}`;
//         return t(`time.${key}`) + timePart;
//       }

//       // 其它：按 dateFmt 格式化，后面可选附加时间
//       return formatDate(src, dateFmt) + (withTime ? " " + formatDate(src, "hh:mm") : "");
//     });

//     return display;
//   }

//   return {
//     formatDate,
//     useFriendlyTime
//   };
// }
