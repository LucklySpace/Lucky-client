
/**
 * 全局消息状态码及对应的国际化 key
 */
export class MessageCode {
  /** 请求成功 */
  static readonly SUCCESS = 200;
  /** 请求失败 */
  static readonly FAIL = -1;

  // ========== HTTP 状态 ==========
  /** 错误的请求，通常是参数不合法 */
  static readonly BAD_REQUEST = 400;
  /** 未授权或 Token 已过期 */
  static readonly UNAUTHORIZED = 401;
  /** 没有访问权限 */
  static readonly FORBIDDEN = 403;
  /** 请求资源不存在 */
  static readonly NOT_FOUND = 404;
  /** 服务器内部错误 */
  static readonly INTERNAL_SERVER_ERROR = 500;
  /** 服务不可用，可能是维护中或负载过高 */
  static readonly SERVICE_UNAVAILABLE = 503;

  // ========== 用户相关 ==========
  /** 用户名或密码错误 */
  static readonly INVALID_CREDENTIALS = 1001;
  /** 账户已被禁用 */
  static readonly ACCOUNT_DISABLED = 1002;
  /** 账户已被锁定 */
  static readonly ACCOUNT_LOCKED = 1003;
  /** 账户已过期 */
  static readonly ACCOUNT_EXPIRED = 1004;
  /** 登录凭证已过期 */
  static readonly CREDENTIALS_EXPIRED = 1005;
  /** 身份验证失败 */
  static readonly AUTHENTICATION_FAILED = 1006;
  /** 验证码错误 */
  static readonly CAPTCHA_ERROR = 1007;
  /** Token 为空 */
  static readonly TOKEN_IS_NULL = 1008;
  /** Token 无效 */
  static readonly TOKEN_IS_INVALID = 1009;
  /** 登录失败次数过多 */
  static readonly EXCESSIVE_LOGIN_FAILURES = 1010;
  /** 账户未找到 */
  static readonly ACCOUNT_NOT_FOUND = 1011;
  /** 短信发送失败 */
  static readonly SMS_ERROR = 1012;
  /** 账户已存在 */
  static readonly ACCOUNT_ALREADY_EXIST = 1013;
  /** 二维码无效或已过期 */
  static readonly QRCODE_IS_INVALID = 1014;
  /** 不支持的认证方式 */
  static readonly UNSUPPORTED_AUTHENTICATION_TYPE = 1015;
  /** 验证信息不完整 */
  static readonly VALIDATION_INCOMPLETE = 1016;
  /** 用户当前不在线 */
  static readonly USER_OFFLINE = 1017;

  // ========== 权限/业务 ==========
  /** 没有权限访问该资源或操作 */
  static readonly NO_PERMISSION = 2001;

  // ========== 服务相关 ==========
  /** 服务异常 */
  static readonly SERVICE_EXCEPTION = 3000;
  /** 请求数据过大，被拒绝处理 */
  static readonly REQUEST_DATA_TOO_LARGE = 3001;


}
