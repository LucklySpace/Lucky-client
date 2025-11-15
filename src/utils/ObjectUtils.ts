/*
 * 通用类型判断与空值检测工具类
 */

/**
 * Utils - 提供常用的类型判断、空值检测等静态方法
 */
export default class ObjectUtils {
  /**
   * 判断是否为字符串
   * @param value 任意值
   */
  static isString(value: any): value is string {
    return Object.prototype.toString.call(value) === "[object String]";
  }

  /**
   * 判断是否为数字
   * @param value 任意值
   */
  static isNumber(value: any): value is number {
    return Object.prototype.toString.call(value) === "[object Number]" && !isNaN(value);
  }

  /**
   * 判断是否为布尔值
   * @param value 任意值
   */
  static isBoolean(value: any): value is boolean {
    return Object.prototype.toString.call(value) === "[object Boolean]";
  }

  /**
   * 判断是否为函数
   * @param value 任意值
   */
  static isFunction(value: any): value is Function {
    return typeof value === "function";
  }

  /**
   * 判断是否为数组
   * @param value 任意值
   */
  static isArray<T = any>(value: any): value is T[] {
    return Array.isArray(value);
  }

  /**
   * 判断是否为对象（不包括 null、数组等）
   * @param value 任意值
   */
  static isObject(value: any): value is object {
    return Object.prototype.toString.call(value) === "[object Object]";
  }

  /**
   * 判断是否为 null
   * @param value 任意值
   */
  static isNull(value: any): value is null {
    return value === null;
  }

  /**
   * 判断是否为 undefined
   * @param value 任意值
   */
  static isUndefined(value: any): value is undefined {
    return value === undefined;
  }

  /**
   * 判断是否为 null 或 undefined
   * @param value 任意值
   */
  static isNil(value: any): value is null | undefined {
    return value === null || value === undefined;
  }

  /**
   * 判断是否为日期对象
   * @param value 任意值
   */
  static isDate(value: any): value is Date {
    return Object.prototype.toString.call(value) === "[object Date]";
  }

  /**
   * 判断是否为正则
   * @param value 任意值
   */
  static isRegExp(value: any): value is RegExp {
    return Object.prototype.toString.call(value) === "[object RegExp]";
  }

  /**
   * 判断是否为 Promise
   * @param value 任意值
   */
  static isPromise<T = any>(value: any): value is Promise<T> {
    return (
      !!value &&
      (typeof value === "object" || typeof value === "function") &&
      typeof value.then === "function" &&
      typeof value.catch === "function"
    );
  }

  /**
   * 判断是否为 Map
   * @param value 任意值
   */
  static isMap<K = any, V = any>(value: any): value is Map<K, V> {
    return Object.prototype.toString.call(value) === "[object Map]";
  }

  /**
   * 判断是否为 Set
   * @param value 任意值
   */
  static isSet<T = any>(value: any): value is Set<T> {
    return Object.prototype.toString.call(value) === "[object Set]";
  }

  /**
   * 判断是否为空
   * 对于字符串、数组，判断 length === 0
   * 对于对象，判断无自身可枚举属性
   * 对于 Map/Set，判断 size === 0
   * 对于 null/undefined，视为空
   * @param value 任意值
   */
  static isEmpty(value: any): boolean {
    if (this.isNil(value)) return true;
    if (this.isString(value) || this.isArray(value)) return value.length === 0;
    if (this.isMap(value) || this.isSet(value)) return value.size === 0;
    if (this.isObject(value)) return Object.keys(value).length === 0;
    return false;
  }

  /**
   * 判断是否非空
   * @param value 任意值
   */
  static isNotEmpty(value: any): boolean {
    return !this.isEmpty(value);
  }

  /**
   * 检查给定的多个值是否全部为空
   * @param values 任意值数组
   * @returns 所有值均为空时返回 true，否则返回 false
   */
  static isAllEmpty(...values: any[]): boolean {
    return values.every(v => this.isEmpty(v));
  }

  /**
   * 检查给定的多个值是否全部非空
   * @param values 任意值数组
   * @returns 所有值均非空时返回 true，否则返回 false
   */
  static isAllNotEmpty(...values: any[]): boolean {
    return values.every(v => !this.isEmpty(v));
  }

}
