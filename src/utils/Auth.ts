/**
 * RSA 加密工具类
 * 基于 jsencrypt 和 encryptlong 实现
 * - jsencrypt: 短文本加密
 * - encryptlong: 长文本分段加密（基于 jsencrypt 扩展）
 */
import JSEncrypt from "jsencrypt";
import Encrypt from "encryptlong";

/**
 * RSA 加密解密类
 */
export default class RSA {
  /**
   * 公钥（来自后台）
   */
  private publicKey: string = "********************";

  /**
   * 私钥（来自后台）
   */
  private privateKey: string = "********************";

  /**
   * 获取公钥
   * @returns 公钥字符串
   */
  getPublicKey(): string {
    return this.publicKey;
  }

  /**
   * 设置公钥
   * @param key 公钥字符串
   */
  setPublicKey(key: string): void {
    this.publicKey = key;
  }

  /**
   * 获取私钥
   * @returns 私钥字符串
   */
  getPrivateKey(): string {
    return this.privateKey;
  }

  /**
   * 设置私钥
   * @param key 私钥字符串
   */
  setPrivateKey(key: string): void {
    this.privateKey = key;
  }

  /**
   * 使用公钥加密（JSEncrypt 短文本）
   * @param data 待加密的字符串
   * @returns 加密后的字符串，失败返回 false
   */
  rsaPublicData(data: string): string | false {
    try {
      const jsencrypt = new JSEncrypt();
      jsencrypt.setPublicKey(this.publicKey);
      return jsencrypt.encrypt(data);
    } catch (error) {
      console.error("RSA 公钥加密失败:", error);
      return false;
    }
  }

  /**
   * 使用私钥解密（JSEncrypt 短文本）
   * @param data 待解密的字符串
   * @returns 解密后的字符串，失败返回 false
   */
  rsaPrivateData(data: string): string | false {
    try {
      const jsencrypt = new JSEncrypt();
      jsencrypt.setPrivateKey(this.privateKey);
      return jsencrypt.decrypt(data);
    } catch (error) {
      console.error("RSA 私钥解密失败:", error);
      return false;
    }
  }

  /**
   * 使用公钥加密长文本（分段加密）
   * @param data 待加密的字符串
   * @returns 加密后的字符串
   */
  encrypt(data: string): string {
    try {
      const encryptor = new Encrypt();
      encryptor.setPublicKey(this.publicKey);
      return encryptor.encryptLong(data);
    } catch (error) {
      console.error("RSA 长文本加密失败:", error);
      throw error;
    }
  }

  /**
   * 使用私钥解密长文本（分段解密）
   * @param data 待解密的字符串
   * @returns 解密后的字符串
   */
  decrypt(data: string): string {
    try {
      const encryptor = new Encrypt();
      encryptor.setPrivateKey(this.privateKey);
      return encryptor.decryptLong(data);
    } catch (error) {
      console.error("RSA 长文本解密失败:", error);
      throw error;
    }
  }
}
