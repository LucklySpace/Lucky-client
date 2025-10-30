import CryptoJS from "crypto-js";

/**
 * 前端签名工具类
 *
 * appId: 接口调用方唯一标识
 * timestamp: 请求时间戳，用于防止过期请求
 * nonce: 随机字符串，确保请求唯一性
 * sign: 签名值，由后端根据参数与秘钥生成
 */
class Signer {
  /** 5 分钟的过期阈值（秒）——与后端保持一致 */
  private static readonly EXPIRE_TIME = 5 * 60;

  /**
   * 生成随机 nonce
   */
  static generateNonce(length = 16): string {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let nonce = "";
    for (let i = 0; i < length; i++) {
      nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
  }

  /**
   * 获取当前 UNIX 时间戳（秒）
   */
  static getTimestamp(): string {
    return Math.floor(Date.now() / 1000).toString();
  }

  /**
   * 将参数值统一转为字符串（保留基本类型，复杂对象跳过）
   */
  static stringifyParams(params: Record<string, any>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const key in params) {
      const val = params[key];
      const type = typeof val;
      if (type === "string" || type === "number" || type === "boolean") {
        result[key] = String(val);
      }
    }
    return result;
  }

  /**
   * 根据参数和 appSecret 计算签名
   *
   * @param rawParams - 参数对象（不含 sign）
   * @param appSecret - 与后端约定的密钥
   * @returns 大写 MD5 签名字符串
   */
  static calculateSign(
    rawParams: Record<string, any>,
    appSecret: string
  ): string {
    const params = this.stringifyParams(rawParams);

    // 1. 排除 sign 字段，按 key 排序
    const keys = Object.keys(params)
      .filter((k) => k.toLowerCase() !== "sign")
      .sort((a, b) => a.localeCompare(b));

    // 2. 拼接字符串 key=value&...&appSecret=xxx
    const signString =
      keys.map((k) => `${k}=${params[k]}`).join("&") +
      `&appSecret=${appSecret}`;

    // 3. 生成 MD5 签名并转大写
    return CryptoJS.MD5(signString).toString().toUpperCase();
  }

  /**
   * 构建带签名的参数对象（common + bizParams + sign）
   *
   * @param bizParams - 业务参数（不包含 appId、timestamp、nonce、sign）
   * @param appId - 客户端 ID
   * @param appSecret - 与后端约定的密钥
   * @returns 已签名参数对象
   */
  static buildSignedParams(
    bizParams: Record<string, any>,
    appId: string,
    appSecret: string
  ): Record<string, string> {
    const commonParams = {
      appId,
      timestamp: this.getTimestamp(),
      nonce: this.generateNonce()
    };

    // 所有参与签名的参数都应转为字符串（sign 字段除外）
    const allParams = {
      ...commonParams,
      ...this.stringifyParams(bizParams)
    };

    const sign = this.calculateSign(allParams, appSecret);

    return {
      ...commonParams,
      ...this.stringifyParams(bizParams), // 业务参数也转字符串再返回
      sign
    };
  }
}

export default Signer;
