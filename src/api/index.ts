import HttpClient, { HttpParams } from "@/utils/Http.ts";
import { storage } from "@/utils/Storage";
import Signer from "@/utils/Sign";
import { ElMessage } from "element-plus";
import { MessageCode } from "@/constants/MessageCode";

// 创建实例，配置 baseURL、headers 与 timeout
const Http = HttpClient.create({
  baseURL: import.meta.env.VITE_API_SERVER,
  headers: { "Content-Type": "application/json" },
  timeout: 10000
});

// 添加请求拦截器（如：注入 Token 和签名）
Http.interceptors.request.use(async (config: HttpParams) => {
  // 添加 token
  if (storage.get("token")) {
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${storage.get("token")}`
    };
  }

  // 接口签名（基于 data 生成 query params）
  const signedParams = Signer.buildSignedParams(config.data || {}, "yourAppId", "secretFor_yourAppId");
  config.params = {
    ...config.params,
    ...signedParams
  };

  return config;
});

// 添加响应拦截器（如：全局错误处理）
Http.interceptors.response.use(async (data: any) => {
  const code = data.code as number;
  const msg = data.message as string;

  // 1. 成功
  if (code === MessageCode.SUCCESS) {
    return data.data;
  }

  // 2. 权限/鉴权相关
  switch (code) {
    case MessageCode.UNAUTHORIZED:
      ElMessage.warning("登录已过期，请重新登录");
      return Promise.reject(new Error(msg));

    case MessageCode.FORBIDDEN:
      ElMessage.error("无权限访问该资源");
      return Promise.reject(new Error(msg));

    case MessageCode.NOT_FOUND:
      ElMessage.error("请求的资源不存在");
      return Promise.reject(new Error(msg));
  }

  // 3. 服务端错误
  if (code === MessageCode.INTERNAL_SERVER_ERROR) {
    ElMessage.error("服务器内部错误，请稍后重试");
    return Promise.reject(new Error(msg));
  }
  if (code === MessageCode.SERVICE_UNAVAILABLE) {
    ElMessage.error("服务不可用，可能正在维护中");
    return Promise.reject(new Error(msg));
  }
  if (code === MessageCode.SERVICE_EXCEPTION) {
    ElMessage.error("服务异常，请联系管理员");
    return Promise.reject(new Error(msg));
  }
  if (code === MessageCode.REQUEST_DATA_TOO_LARGE) {
    ElMessage.warning("请求数据过大，已被拒绝处理");
    return Promise.reject(new Error(msg));
  }

  // 4. 用户相关业务错误
  switch (code) {
    case MessageCode.INVALID_CREDENTIALS:
      ElMessage.warning("用户名或密码错误");
      break;
    case MessageCode.ACCOUNT_DISABLED:
      ElMessage.warning("账户已被禁用");
      break;
    case MessageCode.ACCOUNT_LOCKED:
      ElMessage.warning("账户已被锁定");
      break;
    case MessageCode.ACCOUNT_EXPIRED:
      ElMessage.warning("账户已过期");
      break;
    case MessageCode.CREDENTIALS_EXPIRED:
      ElMessage.warning("登录凭证已过期");
      break;
    case MessageCode.AUTHENTICATION_FAILED:
      ElMessage.warning("身份验证失败,请检查登录信息是否正确");
      break;
    case MessageCode.CAPTCHA_ERROR:
      ElMessage.warning("验证码错误");
      break;
    case MessageCode.TOKEN_IS_NULL:
      ElMessage.warning("Token 为空");
      break;
    case MessageCode.TOKEN_IS_INVALID:
      ElMessage.warning("Token 无效");
      break;
    case MessageCode.EXCESSIVE_LOGIN_FAILURES:
      ElMessage.warning("登录失败次数过多");
      break;
    case MessageCode.ACCOUNT_NOT_FOUND:
      ElMessage.warning("账户未找到");
      break;
    case MessageCode.SMS_ERROR:
      ElMessage.warning("短信发送失败");
      break;
    case MessageCode.ACCOUNT_ALREADY_EXIST:
      ElMessage.warning("账户已存在");
      break;
    case MessageCode.QRCODE_IS_INVALID:
      ElMessage.warning("二维码无效或已过期");
      break;
    case MessageCode.UNSUPPORTED_AUTHENTICATION_TYPE:
      ElMessage.warning("不支持的认证方式");
      break;
    case MessageCode.VALIDATION_INCOMPLETE:
      ElMessage.warning("验证信息不完整");
      break;
    case MessageCode.USER_OFFLINE:
      // 1017：用户不在线，直接返回 data
      return data.data;

    case MessageCode.NO_PERMISSION:
      ElMessage.error("操作失败：没有权限");
      break;
  }

  // 5. 通用失败
  if (code === MessageCode.FAIL || code < 0) {
    ElMessage.warning(msg || "请求失败，请稍后重试");
  }

  // 默认返回 null 或抛错
  return null;
});

export default {
  /** 发送单聊消息 */
  SendSingleMessage: (data: any) => Http.post("/service/api/v1/message/single", data),

  /** 发送群聊消息 */
  SendGroupMessage: (data: any) => Http.post("/service/api/v1/message/group", data),

  /** 撤回消息 */
  RecallMessage: (data: any) => Http.post("/service/api/v1/message/recall", data),

  /** 获取群成员 */
  GetGroupMember: (data: any) => Http.post("/service/api/v1/group/member", data),

  /** 更新群聊信息 */
  updateGroupInfo: (data: any) => Http.post("/service/api/v1/group/update", data),

  /** 更新修改好友备注名 **/
  updateFriendRemark: (data: any) => Http.post("/service/api/v1/relationship/updateFriendRemark", data),

  /** 同意或拒绝群聊邀请 */
  ApproveGroup: (data: any) => Http.post("/service/api/v1/group/approve", data),

  /** 退出群聊 */
  QuitGroups: (data: any) => Http.post("/service/api/v1/group/quit", data),

  /** 邀请群成员 */
  InviteGroupMember: (data: any) => Http.post("/service/api/v1/group/invite", data),

  /** 获取消息列表 */
  GetMessageList: (data: any) => Http.post("/service/api/v1/message/list", data),

  /** 检查单聊消息 */
  SingleCheck: (data: any) => Http.post("/service/api/v1/message/singleCheck", data),

  /** 发送视频消息 */
  SendCallMessage: (data: any) => Http.post("/service/api/v1/message/media/video", data),

  /** 会话列表 */
  GetChatList: (data: any) => Http.post("/service/api/v1/chat/list", data),

  /** 获取会话 */
  GetChat: (params: any) => Http.get("/service/api/v1/chat/one", { params }),

  /** 已读 */
  ReadChat: (data: any) => Http.post("/service/api/v1/chat/read", data),

  /** 创建会话 */
  CreateChat: (data: any) => Http.post("/service/api/v1/chat/create", data),

  /** 登录 */
  Login: (data: any) => Http.post("/auth/api/v1/auth/login", data),

  /** 退出登录 */
  LoginOut: (data: any) => Http.post("/auth/api/v1/auth/logout", data),

  /** 刷新token */
  RefreshToken: () => Http.get("/auth/api/v1/auth/refresh/token"),

  /** 短信发送 */
  Sms: (params: any) => Http.get("/auth/api/v1/auth/sms", { params }),

  /** 获取二维码 */
  GetQRCode: (params: any) => Http.get("/auth/api/v1/auth/qrcode", { params }),

  /** 扫码登录 */
  ScanQRCode: (data: any) => Http.post("/auth/api/v1/auth/qrcode/scan", data),

  /** 检查二维码状态 */
  CheckQRCodeStatus: (params: any) => Http.get("/auth/api/v1/auth/qrcode/status", { params }),

  /** 获取公钥 */
  GetPublicKey: () => Http.get("/auth/api/v1/auth/publickey"),

  /** 是否在线 */
  GetOnline: (params: any) => Http.get("/auth/api/v1/auth/online", { params }),

  /** 获取个人信息 */
  GetUserInfo: (params: any) => Http.get("/auth/api/v1/auth/info", { params }),

  /** 获取用户信息 */
  UpdateUserInfo: (data: any) => Http.post("/service/api/v1/user/update", data),

  /** 获取好友列表 */
  GetContacts: (params: any) => Http.get("/service/api/v1/relationship/contacts/list", { params }),

  /** 获取群列表 */
  GetGroups: (params: any) => Http.get("/service/api/v1/relationship/groups/list", { params }),

  /** 获取好友添加请求列表 */
  GetNewFriends: (params: any) => Http.get("/service/api/v1/relationship/newFriends/list", { params }),

  /** 获取好友信息 */
  GetContactInfo: (data: any) => Http.post("/service/api/v1/relationship/getFriendInfo", data),

  /** 搜索好友信息 */
  SearchContactInfoList: (data: any) => Http.post("/service/api/v1/relationship/search/getFriendInfoList", data),

  /** 请求添加好友 */
  RequestContact: (data: any) => Http.post("/service/api/v1/relationship/requestContact", data),

  /** 同意或拒绝好友请求 */
  ApproveContact: (data: any) => Http.post("/service/api/v1/relationship/approveContact", data),

  /** 删除好友 */
  DeleteContact: (data: any) => Http.post("/service/api/v1/relationship/deleteFriendById", data),

  /** 获取用户表情包 */
  GetUserEmojis: (params: any) => Http.get("/service/api/v1/emoji/list", { params }),

  /** 获取表情包详情 */
  GetEmojiPackInfo: (id: string) => Http.get(`/plat/api/v1/emoji/pack/${id}`),

  /** 文件上传 */
  UploadFile: (data: any) => Http.upload("/upload/api/v1/file/upload", data),

  /** 文件下载 */
  DownloadFile: (params: any) => Http.get("/upload/api/v1/file/download", { params }),

  /** 图片上传 */
  uploadImage: (data: FormData) => Http.upload("/upload/api/v1/media/image/upload", data),

  /** 头像上传 */
  uploadAvatar: (data: FormData) => Http.upload("/upload/api/v1/media/avatar/upload", data),

  /** 异常上报 */
  ExceptionReport: (params: any) => Http.get("/service/api/v1/tauri/exception/report", { params })
};
