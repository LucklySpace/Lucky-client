/**
 * 消息内容枚举
 */
export const MessageContentType = {
  TEXT: { code: 1, type: "文字" },
  IMAGE: { code: 2, type: "图片" },
  VIDEO: { code: 3, type: "视频" },
  AUDIO: { code: 4, type: "语音" },
  FILE: { code: 5, type: "文件" },
  LOCAL: { code: 6, type: "位置" },
  COMPLEX: { code: 7, type: "混合" },
  GROUP_INVITE: { code: 8, type: "群组邀请" },
  GROUP_JOIN_APPROVE: { code: 9, type: "群组加入审批" },
  TIP: { code: 10, type: "系统提示" }
};

/**
 * webrtc枚举
 */
export const WebRTCType = {
  RTC_CALL: { code: 101, type: "呼叫" },
  RTC_ACCEPT: { code: 102, type: "接受" },
  RTC_REJECT: { code: 103, type: "拒绝" },
  RTC_CANCEL: { code: 104, type: "取消呼叫" },
  RTC_FAILED: { code: 105, type: "呼叫失败" },
  RTC_HANDUP: { code: 106, type: "挂断" },
  RTC_CANDIDATE: { code: 107, type: "同步candidate" }
};

/**
 * websocket 通信枚举
 */
export const IMessageType = {
  ERROR: { code: -1, description: "信息异常" },
  LOGIN_OVER: { code: 900, description: "登录过期" },
  REFRESHTOKEN: { code: 999, description: "刷新token" },
  LOGIN: { code: 1000, description: "登陆" },
  HEART_BEAT: { code: 1001, description: "心跳" },
  FORCE_LOGOUT: { code: 1002, description: "强制下线" },
  SINGLE_MESSAGE: { code: 1003, description: "私聊消息" },
  GROUP_MESSAGE: { code: 1004, description: "群发消息" },
  VIDEO_MESSAGE: { code: 1005, description: "视频消息" },
  AUDIO_MESSAGE: { code: 1006, description: "音频通话" },

  CREATE_GROUP: { code: 1500, description: "创建群聊" },
  GROUP_INVITE: { code: 1501, description: "群聊邀请" },

  ROBOT: { code: 2000, description: "机器人" },
  PUBLIC: { code: 2001, description: "公众号" }
};

/**
 * 状态枚举
 */
export const MessageSendCode = {
  SUCCESS: { code: 0, type: "成功" },
  FAILED: { code: 1, type: "失败" },
  SENDING: { code: 2, type: "发送中" },
  OTHER: { code: 3, type: "其它异常" }
};

/**
 * 消息状态枚举
 */
export const MessageStatus = {
  UNREAD: { code: 0, type: "未读" },
  ALREADY_READ: { code: 1, type: "已读" },
  RECALL: { code: 2, type: "已撤回" }
};

/**
 * 视频通话枚举
 */
export const VideoMaster = {
  CALLER: { code: 0, type: "呼叫方" },
  ACCEPT: { code: 1, type: "接收方" }
};

/**
 * 视频通话连接状态枚举
 */
export const ConnectionStatus = {
  CONNECTING: { code: 100, type: "正在连接" },
  DISCONNECTED: { code: 200, type: "未连接" },
  CONNECTED: { code: 300, type: "连接中" },
  CONNECTION_REFUSED: { code: 400, type: "拒绝连接" },
  CONNECTION_LOST: { code: 500, type: "连接断开" },
  CANCELLED: { code: 600, type: "取消连接" },
  CLOSED: { code: 700, type: "连接关闭" },
  ERROR: { code: 800, type: "连接错误" }
};

/** pinia存储的名称 */
export enum StoresEnum {
  /** 用户 */
  USER = "user",
  /** 用户 */
  FRIENDS = "friends",
  /** 设置 */
  SETTING = "setting",
  /** 在线状态 */
  MESSAGE = "message",
  /** 历史内容 */
  HISTORY = "history",
  /** 聊天列表 */
  CHAT = "chat",
  /** 预览 */
  PREVIEW_MEDIA = "preview_media",
  PREVIEW_FILE = "preview_file",
  /** 主窗口 */
  MAIN = "main",
  /** 视频或语音通话 */
  CALL = "call",
  /** 视频通话弹窗 */
  CALLACCEPT = "callaccept",
  /** 通知 */
  NOTIFY = "notify",
  /** 截图 */
  SCREEN = "screen",
  /** 录屏 */
  RECORD = "record",
  /** 搜索 */
  SEARCH = "search",
  /** 登录 */
  LOGIN = "login",
  /** 媒体缓存 */
  MEDIA_CACHE = "mediaCache"
}

export enum CacheEnum {
  IMAGE_CACHE = "image_cache",

  VIDEO_CACHE = "video_cache"
}

/** 备注最大长度 */
export const MAX_REMARK_LEN = 20;

/** 文件类型枚举 */
export enum FileType {
  Video = "video",
  Markdown = "markdown",
  Image = "image",
  Pdf = "pdf",
  Word = "word",
  Excel = "excel",
  Powerpoint = "powerpoint",
  Other = "file"
}

/** 每个 FileType 对应的后缀列表 */
const extensionMap: Record<FileType, string[]> = {
  [FileType.Video]: ["mp4", "mov", "avi", "wmv", "mkv", "mpeg", "flv", "webm"],
  [FileType.Markdown]: ["md"],
  [FileType.Image]: ["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp"],
  [FileType.Pdf]: ["pdf"],
  [FileType.Word]: ["doc", "docx", "odt", "rtf"],
  [FileType.Excel]: ["xls", "xlsx"],
  [FileType.Powerpoint]: ["ppt", "pptx"],
  [FileType.Other]: [] // 默认类型，无需后缀
};

// /**
//  * 从文件名中提取扩展名（不包含点），小写返回
//  * @param fileName 文件名，例如 "example.PDF"
//  */
// function getExtension(fileName: string): string {
//   const idx = fileName.lastIndexOf('.');
//   if (idx === -1 || idx === fileName.length - 1) {
//     return '';
//   }
//   return fileName.slice(idx + 1).toLowerCase();
// }

// /**
//  * 根据扩展名（不含点）返回对应的 FileType 枚举
//  * @param extension 扩展名，如 "pdf"
//  */
// export function fromExtension(extension: string): FileType {
//   const ext = extension.toLowerCase();
//   for (const [type, exts] of Object.entries(extensionMap)) {
//     if (exts.includes(ext)) {
//       return type as FileType;
//     }
//   }
//   return FileType.Other;
// }

// /**
//  * 根据文件名返回对应的 FileType 枚举
//  * @param fileName 文件名，例如 "report.PPTX"
//  */
// export function fromFileName(fileName: string): FileType {
//   const ext = getExtension(fileName);
//   return fromExtension(ext);
// }
