/* 产引入jsencrypt实现数据RSA加密 */
import JSEncrypt from "jsencrypt"; // 处理长文本数据时报错 jsencrypt.js Message too long for RSA
/* 产引入encryptlong实现数据RSA加密 */
import Encrypt from "encryptlong"; // encryptlong是基于jsencrypt扩展的长文本分段加解密功能。


// 完整的加密解密函数
export default class RSA {

  // 公钥key
  private publicKey: string = "********************"; // 密钥来自后台，我们需要的是公钥

  // 私钥key
  private privateKey: string = "********************"; // 密钥来自后台，我们需要的是私钥

  getPublicKey() {
    return this.publicKey;
  }

  setPublicKey(key: string) {
    this.publicKey = key;
  }

  /* JSEncrypt加密 */
  rsaPublicData(data: string) {
    var jsencrypt = new JSEncrypt();
    jsencrypt.setPublicKey(this.publicKey);
    // 如果是对象/数组的话，需要先JSON.stringify转换成字符串
    var result = jsencrypt.encrypt(data);
    jsencrypt.setPublicKey;
    return result;
  }

  /* JSEncrypt解密 */
  rsaPrivateData(data: string) {
    var jsencrypt = new JSEncrypt();
    jsencrypt.setPrivateKey(this.privateKey);
    // 如果是对象/数组的话，需要先JSON.stringify转换成字符串
    var result = jsencrypt.encrypt(data);
    return result;
  }

  /* 加密 */
  encrypt(data: string) {
    const PUBLIC_KEY = this.publicKey;
    var encryptor = new Encrypt();
    encryptor.setPublicKey(PUBLIC_KEY);
    // 如果是对象/数组的话，需要先JSON.stringify转换成字符串
    const result = encryptor.encryptLong(data);
    return result;
  }

  /* 解密 - PRIVATE_KEY - 验证 */
  decrypt(data: string) {
    const PRIVATE_KEY = this.privateKey;
    var encryptor = new Encrypt();
    encryptor.setPrivateKey(PRIVATE_KEY);
    // 如果是对象/数组的话，需要先JSON.stringify转换成字符串
    var result = encryptor.decryptLong(data);
    return result;
  }

}
