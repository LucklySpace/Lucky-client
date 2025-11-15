import "moment/locale/zh-cn"; // 根据需要加载其他语言

/**
 * 将数字补齐为两位字符（不足前置“0”）
 * @param num 要补零的数字
 */
function pad2(num: number): string {
  return String(num).padStart(2, "0");
}

/**
 * 根据出生日期计算年龄（周岁）
 * @param birthDate - 出生日期，支持 Date 对象、时间戳（毫秒）或 ISO 字符串
 * @returns 年龄（整数）
 */
export function calculateAge(birthDate: Date | string | number): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();

  // 若尚未过当年生日，则减一岁
  const thisYearBirthday = new Date(
    today.getFullYear(),
    birth.getMonth(),
    birth.getDate()
  );
  if (today < thisYearBirthday) {
    age--;
  }
  return age;
}

/**
 * 以“X月Y日”格式返回指定日期
 * @param date - 日期，支持 Date 对象、时间戳（毫秒）或 ISO 字符串
 */
export function getDateDayAndMonth(date: Date | string | number): string {
  const d = new Date(date);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${month}月${day}日`;
}

/**
 * 以“YYYY-MM-DD”格式返回指定日期
 * @param date - 日期，支持 Date 对象、时间戳（毫秒）或 ISO 字符串
 */
export function getYearDayMonth(date: Date | string | number): string {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

/**
 * 格式化一个时间戳，为聊天等场景提供“友好”显示：
 * - 刚刚（<1 分钟）
 * - 今天 hh:mm
 * - 昨天 hh:mm
 * - 本周内（7 天内，不含今天、昨天）：星期X hh:mm
 * - 其它：YYYY-MM-DD hh:mm
 * @param dateTime - 时间戳（毫秒）或可被 Date 构造的字符串
 */
export function formatTime(dateTime: Date | string | number): string {
  const now = new Date();
  const d = new Date(dateTime);
  const diffMs = now.getTime() - d.getTime();

  const oneMinute = 60 * 1000;
  const oneDay = 24 * 60 * oneMinute;
  const oneWeek = 7 * oneDay;

  // 刚刚
  if (diffMs < oneMinute) {
    return "刚刚";
  }

  // 今日
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  if (d.getTime() >= startOfToday) {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  // 昨天
  const startOfYesterday = startOfToday - oneDay;
  if (d.getTime() >= startOfYesterday) {
    return `昨天 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  // 本周内（不含前两天）
  if (diffMs < oneWeek) {
    const weekdays = [
      "星期日",
      "星期一",
      "星期二",
      "星期三",
      "星期四",
      "星期五",
      "星期六"
    ];
    return `${weekdays[d.getDay()]} ${pad2(d.getHours())}:${pad2(
      d.getMinutes()
    )}`;
  }

  // 其它
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

/**
 * ISO 或本地日期时间字符串 → “YYYY-MM-DD”
 * @param dateTimeString - 可被 Date 构造的字符串
 */
export function formatDateString(dateTimeString: string): string {
  const d = new Date(dateTimeString);
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

/**
 * 将秒数格式化为“HH:mm:ss”
 * @param totalSeconds - 秒数
 */
export function formatTimingTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

/**
 * 将 Date 格式化为指定格式
 * 支持：
 *   yyyy 年
 *   MM   月（01-12）
 *   dd   日（01-31）
 *   hh   时（00-23）
 *   mm   分（00-59）
 *   ss   秒（00-59）
 *   q    季度（1-4）
 *   S    毫秒（0-999）
 */
export function formatDate(date: Date, fmt: string): string {

  const map: Record<string, number> = {
    "M+": date.getMonth() + 1,
    "d+": date.getDate(),
    "h+": date.getHours(),
    "m+": date.getMinutes(),
    "s+": date.getSeconds(),
    "q+": Math.floor((date.getMonth() + 3) / 3),
    "S": date.getMilliseconds()
  };

  // 年份单独替换
  fmt = fmt.replace(/(y+)/, (_, yearToken) =>
    (date.getFullYear() + "").slice(4 - yearToken.length)
  );

  // 其他格式
  return Object.keys(map).reduce((acc, pattern) => {
    return acc.replace(new RegExp(`(${pattern})`), (_, token) => {
      const val = map[pattern].toString();
      // 如果 token 长度 > 1，就左侧补零
      return token.length === 1 ? val : val.padStart(token.length, "0");
    });
  }, fmt);
}

/**
 * “友好”地展示一个时间戳
 * - 1 分钟内：刚刚
 * - 今天：hh:mm
 * - 昨天／前天：昨天 hh:mm / 前天 hh:mm（可选带时间）
 * - 本周内（7 天内，不含今天、昨天、前天）：星期X hh:mm?
 * - 其它：按 `timeFormat` + 可选时间
 *
 * @param timestamp    时间戳（毫秒）
 * @param timeFormat   日期格式，如 'yyyy/MM/dd'
 * @param mustIncludeTime 是否在昨天／前天等文字后面带上小时分钟
 */

export function useFriendlyTime(
  timestamp: number,
  timeFormat: string,
  mustIncludeTime = false
): string {
  const now = new Date();
  const src = new Date(timestamp);

  const timeStr = mustIncludeTime ? " " + formatDate(src, "hh:mm") : "";

  // 当天 00:00
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 判断“刚刚”
  if (now.getTime() - src.getTime() < 60 * 1000) {
    return "刚刚";
  }

  const srcDateStr = src.toDateString();
  const todayStr = startOfToday.toDateString();

  // 判断“今天”
  if (srcDateStr === todayStr) {
    return formatDate(src, "hh:mm");
  }

  // 判断“昨天”与“前天”
  const yesterday = new Date(startOfToday);
  yesterday.setDate(yesterday.getDate() - 1);
  const dayBeforeYesterday = new Date(startOfToday);
  dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2);

  if (srcDateStr === yesterday.toDateString()) {
    return `昨天${timeStr}`;
  }
  if (srcDateStr === dayBeforeYesterday.toDateString()) {
    return `前天${timeStr}`;
  }

  // 判断是否为本周内（最近7天，排除前两天）
  const sevenDaysAgo = new Date(startOfToday);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  if (src >= sevenDaysAgo) {
    const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
    return weekdays[src.getDay()] + timeStr;
  }

  // 其他情况
  return formatDate(src, timeFormat) + timeStr;
}


// export function useFriendlyTime(
//     timestamp: number,
//     timeFormat: string,
//     mustIncludeTime = false
// ): string {
//     const now = Date.now();
//     const src = new Date(timestamp);
//     const diff = now - timestamp;
//     const oneMinute = 60 * 1000;
//     const oneHour = 60 * oneMinute;
//     const oneDay = 24 * oneHour;
//     const weekMs = 7 * oneDay;

//     // 1. 刚刚
//     if (diff < oneMinute) {
//         return '刚刚';
//     }

//     // 2. 今天
//     const startOfToday = new Date().setHours(0, 0, 0, 0);
//     if (timestamp >= startOfToday) {
//         return formatDate(src, 'hh:mm');
//     }

//     // 3. 昨天、前天
//     const daysAgo = Math.floor((startOfToday - timestamp) / oneDay);
//     const timeStr = mustIncludeTime ? ' ' + formatDate(src, 'hh:mm') : '';
//     if (daysAgo === 1) {
//         return `昨天${timeStr}`;
//     }
//     if (daysAgo === 2) {
//         return `前天${timeStr}`;
//     }

//     // 4. 本周内（不含前两天）
//     if (diff < weekMs) {
//         const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
//         return weekdays[src.getDay()] + (mustIncludeTime ? ' ' + formatDate(src, 'hh:mm') : '');
//     }

//     // 5. 其它
//     return formatDate(src, timeFormat) + (mustIncludeTime ? ' ' + formatDate(src, 'hh:mm') : '');
// }


// /**
//  * 格式化日期对象为指定格式的字符串
//  * @param date - 需要格式化的日期对象
//  * @param fmt - 格式化字符串，例如 "yyyy-MM-dd hh:mm:ss"
//  * @returns 格式化后的日期字符串
//  */
// const formatDate = (date: Date, fmt: string): string => {
//     const o: { [key: string]: number } = {
//         "M+": date.getMonth() + 1,
//         "d+": date.getDate(),
//         "h+": date.getHours(),
//         "m+": date.getMinutes(),
//         "s+": date.getSeconds(),
//         "q+": Math.floor((date.getMonth() + 3) / 3),
//         "S": date.getMilliseconds(),
//     };

//     if (/(y+)/.test(fmt)) {
//         fmt = fmt.replace(RegExp.$1, (date.getFullYear() + "").slice(4 - RegExp.$1.length));
//     }

//     for (const k in o) {
//         if (new RegExp(`(${k})`).test(fmt)) {
//             fmt = fmt.replace(RegExp.$1, RegExp.$1.length === 1 ? o[k].toString() : `00${o[k]}`.slice(-RegExp.$1.length));
//         }
//     }

//     return fmt;
// };

// /**
//  * 根据时间戳获取用户友好的时间显示格式
//  * @param timestamp - 时间戳，可以是数字或字符串
//  * @param timeFormat - 需要显示的时间格式，例如 "yy/MM/dd"
//  * @param mustIncludeTime -  显示日期时是否必须包含时间（小时和分钟）
//  * @returns 友好的时间显示字符串
//  */

// export const useFriendlyTime = (timestamp: number, timeFormat: string, mustIncludeTime: boolean): string => {
//     const currentDate = new Date();
//     const srcDate = new Date(timestamp);
//     const deltaTime = currentDate.getTime() - timestamp;
//     const timeExtraStr = mustIncludeTime ? ` ${formatDate(srcDate, "hh:mm")}` : "";

//     if (deltaTime < 60 * 1000) return "刚刚";

//     if (currentDate.toDateString() === srcDate.toDateString()) return formatDate(srcDate, "hh:mm");

//     const dayDiff = currentDate.getDate() - srcDate.getDate();
//     if (dayDiff === 1) return `昨天${timeExtraStr}`;
//     if (dayDiff === 2) return `前天${timeExtraStr}`;
//     if (deltaTime < 7 * 24 * 3600 * 1000) {
//         return ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][srcDate.getDay()] + timeExtraStr;
//     }

//     return formatDate(srcDate, timeFormat) + timeExtraStr;
// };


// const formatDate = (date: Date, fmt: string) => {
//     const o: any = {
//         "M+": date.getMonth() + 1,
//         "d+": date.getDate(),
//         "h+": date.getHours(),
//         "m+": date.getMinutes(),
//         "s+": date.getSeconds(),
//         "q+": Math.floor((date.getMonth() + 3) / 3),
//         "S": date.getMilliseconds()
//     };
//     if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (date.getFullYear() + "").substr(4 - RegExp.$1.length));
//     for (const k in o)
//         if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, RegExp.$1.length == 1 ? o[k] : ("00" + o[k]).substr(("" + o[k]).length));
//     return fmt;
// };

// export const useFriendlyTime = (timestamp: any, timeFormat: any, mustIncludeTime: any) => {
//     const currentDate = new Date();
//     const srcDate = new Date(parseInt(timestamp));

//     const deltaTime = currentDate.getTime() - timestamp;
//     const timeExtraStr = mustIncludeTime ? " " + formatDate(srcDate, "hh:mm") : "";

//     if (deltaTime < 60 * 1000) {
//         return "刚刚";
//     } else if (deltaTime < 24 * 3600 * 1000) {
//         if (currentDate.getDate() === srcDate.getDate()) {
//             return formatDate(srcDate, "hh:mm");
//         } else if (currentDate.getDate() - srcDate.getDate() === 1) {
//             return "昨天" + timeExtraStr;
//         } else if (currentDate.getDate() - srcDate.getDate() === 2) {
//             return "前天" + timeExtraStr;
//         } else {
//             return formatDate(srcDate, "MM-dd") + timeExtraStr;
//         }
//     } else if (deltaTime < 7 * 24 * 3600 * 1000) {
//         const weekday = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
//         return weekday[srcDate.getDay()] + timeExtraStr;
//     } else {
//         return formatDate(srcDate, timeFormat) + timeExtraStr;
//         // return formatDate(srcDate, "yy/MM/dd") + timeExtraStr;
//     }
// };
