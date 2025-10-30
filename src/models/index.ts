// src/models/message.ts
import { IMessageType, MessageContentType } from "@/constants";

/* -------------------------
   基础类型与 MessageBody
   ------------------------- */

/** 基础 MessageBody（各具体 body 继承） */
abstract class MessageBody {
}

/** 文本 */
class TextMessageBody extends MessageBody {
  text: string;

  constructor(init: { text: string }) {
    super();
    this.text = init.text;
  }
}

/** 图片 */
class ImageMessageBody extends MessageBody {
  path: string;
  name?: string;
  size?: number;

  constructor(init: { path: string; name?: string; size?: number }) {
    super();
    this.path = init.path;
    this.name = init.name;
    this.size = init.size;
  }
}

/** 视频 */
class VideoMessageBody extends MessageBody {
  path: string;
  name?: string;
  duration?: number;
  size?: number;

  constructor(init: { path: string; name?: string; duration?: number; size?: number }) {
    super();
    this.path = init.path;
    this.name = init.name;
    this.duration = init.duration;
    this.size = init.size;
  }
}

/** 音频 */
class AudioMessageBody extends MessageBody {
  path: string;
  duration?: number;
  size?: number;

  constructor(init: { path: string; duration?: number; size?: number }) {
    super();
    this.path = init.path;
    this.duration = init.duration;
    this.size = init.size;
  }
}

/** 文件 */
class FileMessageBody extends MessageBody {
  path: string;
  name?: string;
  suffix?: string;
  size?: number;

  constructor(init: { path: string; name?: string; suffix?: string; size?: number }) {
    super();
    this.path = init.path;
    this.name = init.name;
    this.suffix = init.suffix;
    this.size = init.size;
  }
}

/** 系统文本 */
class SystemMessageBody extends MessageBody {
  text: string;

  constructor(init: { text: string }) {
    super();
    this.text = init.text;
  }
}

/** 群邀请 */
class GroupInviteMessageBody extends MessageBody {
  requestId: string;
  groupId: string;
  groupName: string;
  groupAvatar: string;
  inviterId?: string;
  inviterName?: string;
  userId: string;
  userName?: string;
  approveStatus?: number;

  constructor(init: {
    requestId: string;
    groupId: string;
    groupName: string;
    groupAvatar: string;
    userId: string;
    inviterId?: string;
    inviterName?: string;
    userName?: string;
    approveStatus?: number;
  }) {
    super();
    this.requestId = init.requestId;
    this.groupId = init.groupId;
    this.groupName = init.groupName;
    this.groupAvatar = init.groupAvatar;
    this.inviterId = init.inviterId;
    this.inviterName = init.inviterName;
    this.userId = init.userId;
    this.userName = init.userName;
    this.approveStatus = init.approveStatus;
  }
}

/** 位置 */
class LocationMessageBody extends MessageBody {
  title: string;
  address: string;
  latitude?: number;
  longitude?: number;

  constructor(init: { title: string; address: string; latitude?: number; longitude?: number }) {
    super();
    this.title = init.title;
    this.address = init.address;
    this.latitude = init.latitude;
    this.longitude = init.longitude;
  }
}

/* -------------------------
   ComplexMessageBody
   ------------------------- */

interface ComplexPart {
  type: string;
  content?: Record<string, any> | string;
  meta?: Record<string, any>;
}

class ComplexMessageBody extends MessageBody {
  parts: ComplexPart[];
  images?: ImageMessageBody[];
  videos?: VideoMessageBody[];

  constructor(init?: { parts?: ComplexPart[]; images?: ImageMessageBody[]; videos?: VideoMessageBody[] }) {
    super();
    this.parts = init?.parts ?? [];
    this.images = init?.images ?? [];
    this.videos = init?.videos ?? [];
  }
}

/* -------------------------
   Recall / Edit bodies
   ------------------------- */

/** 撤回（messageContentType = 11） */
class RecallMessageBody extends MessageBody {
  messageId: string;
  operatorId: string;
  reason?: string;
  recallTime: number;
  chatId?: string;
  chatType?: number;

  constructor(init: {
    messageId: string;
    operatorId: string;
    recallTime: number;
    reason?: string;
    chatId?: string;
    chatType?: number;
  }) {
    super();
    this.messageId = init.messageId;
    this.operatorId = init.operatorId;
    this.recallTime = init.recallTime;
    this.reason = init.reason;
    this.chatId = init.chatId;
    this.chatType = init.chatType;
  }
}

/** 编辑（messageContentType = 12） */
class EditMessageBody extends MessageBody {
  messageId: string;
  editorId: string;
  editTime: number;
  newMessageContentType?: number;
  newMessageBody: Record<string, any>;
  oldPreview?: string;
  chatId?: string;
  chatType?: number;

  constructor(init: {
    messageId: string;
    editorId: string;
    editTime: number;
    newMessageBody: Record<string, any>;
    newMessageContentType?: number;
    oldPreview?: string;
    chatId?: string;
    chatType?: number;
  }) {
    super();
    this.messageId = init.messageId;
    this.editorId = init.editorId;
    this.editTime = init.editTime;
    this.newMessageContentType = init.newMessageContentType;
    this.newMessageBody = init.newMessageBody;
    this.oldPreview = init.oldPreview;
    this.chatId = init.chatId;
    this.chatType = init.chatType;
  }
}

/* -------------------------
   ReplyMessageInfo
   ------------------------- */

export interface ReplyMessageInfo {
  messageId?: string;
  fromId?: string;
  previewText?: string;
  messageContentType?: number;
}

/* -------------------------
   IMessage + Single/Group
   ------------------------- */

/** 通用消息 DTO，messageBody 可用泛型指定 */
class IMessage<T extends MessageBody = MessageBody> {
  fromId: string;
  messageTempId: string;
  messageId?: string;
  messageContentType: number;
  messageTime: number;
  readStatus?: number;
  sequence?: number;
  extra?: Record<string, any>;
  replyMessage?: ReplyMessageInfo;
  mentionedUserIds: string[] = [];
  mentionAll?: boolean = false;
  messageBody: T;

  constructor(init: {
    fromId: string;
    messageTempId: string;
    messageContentType: number;
    messageTime: number;
    messageBody: T;
    messageId?: string;
    readStatus?: number;
    sequence?: number;
    extra?: Record<string, any>;
    replyMessage?: ReplyMessageInfo;
    mentionedUserIds?: string[];
    mentionAll?: boolean;
  }) {
    this.fromId = init.fromId;
    this.messageTempId = init.messageTempId;
    this.messageContentType = init.messageContentType;
    this.messageTime = init.messageTime;
    this.messageBody = init.messageBody;
    this.messageId = init.messageId;
    this.readStatus = init.readStatus;
    this.sequence = init.sequence;
    this.extra = init.extra;
    this.replyMessage = init.replyMessage;
    this.mentionedUserIds = init.mentionedUserIds ?? [];
    this.mentionAll = init.mentionAll ?? false;
  }

  static fromPlainByType<T extends MessageBody = MessageBody>(obj: any): IMSingleMessage<T> | IMGroupMessage<T> {
    if (!obj) throw new Error("empty object");
    if (obj.messageType === IMessageType.SINGLE_MESSAGE.code) {
      return IMSingleMessage.fromPlain(obj);
    } else if (obj.messageType === IMessageType.GROUP_MESSAGE.code) {
      return IMGroupMessage.fromPlain(obj);
    } else {
      throw new Error(`Unknown messageType: ${obj.messageType}`);
    }
  }

  static fromPlain<T extends MessageBody = MessageBody>(obj: any): IMessage<T> {
    if (!obj) throw new Error("empty object");
    const bodyRaw = obj.messageBody ?? {};
    const body = createMessageBody(bodyRaw, obj.messageContentType) as T;
    return new IMessage<T>({
      fromId: obj.fromId,
      messageTempId: obj.messageTempId,
      messageContentType: obj.messageContentType,
      messageTime: obj.messageTime,
      messageBody: body,
      messageId: obj.messageId,
      readStatus: obj.readStatus,
      sequence: obj.sequence,
      extra: obj.extra,
      replyMessage: obj.replyMessage,
      mentionedUserIds: obj.mentionedUserIds,
      mentionAll: obj.mentionAll
    });
  }

  toPlain() {
    return {
      fromId: this.fromId,
      messageTempId: this.messageTempId,
      messageId: this.messageId,
      messageContentType: this.messageContentType,
      messageTime: this.messageTime,
      readStatus: this.readStatus,
      sequence: this.sequence,
      extra: this.extra,
      replyMessage: this.replyMessage,
      mentionedUserIds: this.mentionedUserIds,
      mentionAll: this.mentionAll,
      messageBody: this.messageBody
    };
  }
}

/** 私聊消息 */
class IMSingleMessage<T extends MessageBody = MessageBody> extends IMessage<T> {
  toId: string;
  messageType: number;

  constructor(init: {
    fromId: string;
    messageTempId: string;
    messageContentType: number;
    messageTime: number;
    messageBody: T;
    toId: string;
    messageId?: string;
    readStatus?: number;
    sequence?: number;
    extra?: Record<string, any>;
    replyMessage?: ReplyMessageInfo;
    mentionedUserIds?: string[];
    mentionAll?: boolean;
    messageType?: number;
  }) {
    super({
      fromId: init.fromId,
      messageTempId: init.messageTempId,
      messageContentType: init.messageContentType,
      messageTime: init.messageTime,
      messageBody: init.messageBody,
      messageId: init.messageId,
      readStatus: init.readStatus,
      sequence: init.sequence,
      extra: init.extra,
      replyMessage: init.replyMessage,
      mentionedUserIds: init.mentionedUserIds,
      mentionAll: init.mentionAll
    });
    this.toId = init.toId;
    this.messageType = typeof init.messageType === "number" ? init.messageType : IMessageType.SINGLE_MESSAGE.code;
  }

  static fromPlain<T extends MessageBody = MessageBody>(obj: any): IMSingleMessage<T> {
    if (!obj) throw new Error("empty object");
    const bodyRaw = obj.messageBody ?? {};
    const body = createMessageBody(bodyRaw, obj.messageContentType) as T;
    return new IMSingleMessage<T>({
      fromId: obj.fromId,
      messageTempId: obj.messageTempId,
      messageContentType: obj.messageContentType,
      messageTime: obj.messageTime,
      messageBody: body,
      messageId: obj.messageId,
      readStatus: obj.readStatus,
      sequence: obj.sequence,
      extra: obj.extra,
      replyMessage: obj.replyMessage,
      mentionedUserIds: obj.mentionedUserIds,
      mentionAll: obj.mentionAll,
      toId: obj.toId,
      messageType: obj.messageType ?? IMessageType.SINGLE_MESSAGE
    });
  }

  toPlain() {
    return {
      ...super.toPlain(),
      toId: this.toId,
      messageType: this.messageType
    };
  }
}

/** 群消息 */
class IMGroupMessage<T extends MessageBody = MessageBody> extends IMessage<T> {
  groupId: string;
  toList?: string[];
  messageType: number;

  constructor(init: {
    fromId: string;
    messageTempId: string;
    messageContentType: number;
    messageTime: number;
    messageBody: T;
    groupId: string;
    toList?: string[];
    messageId?: string;
    readStatus?: number;
    sequence?: number;
    extra?: Record<string, any>;
    replyMessage?: ReplyMessageInfo;
    mentionedUserIds?: string[];
    mentionAll?: boolean;
    messageType?: number;
  }) {
    super({
      fromId: init.fromId,
      messageTempId: init.messageTempId,
      messageContentType: init.messageContentType,
      messageTime: init.messageTime,
      messageBody: init.messageBody,
      messageId: init.messageId,
      readStatus: init.readStatus,
      sequence: init.sequence,
      extra: init.extra,
      replyMessage: init.replyMessage,
      mentionedUserIds: init.mentionedUserIds,
      mentionAll: init.mentionAll
    });
    this.groupId = init.groupId;
    this.toList = init.toList;
    this.messageType = typeof init.messageType === "number" ? init.messageType : IMessageType.GROUP_MESSAGE.code;
  }

  static fromPlain<T extends MessageBody = MessageBody>(obj: any): IMGroupMessage<T> {
    if (!obj) throw new Error("empty object");
    const bodyRaw = obj.messageBody ?? {};
    const body = createMessageBody(bodyRaw, obj.messageContentType) as T;
    return new IMGroupMessage<T>({
      fromId: obj.fromId,
      messageTempId: obj.messageTempId,
      messageContentType: obj.messageContentType,
      messageTime: obj.messageTime,
      messageBody: body,
      groupId: obj.groupId,
      toList: obj.toList,
      messageId: obj.messageId,
      readStatus: obj.readStatus,
      sequence: obj.sequence,
      extra: obj.extra,
      replyMessage: obj.replyMessage,
      mentionedUserIds: obj.mentionedUserIds,
      mentionAll: obj.mentionAll,
      messageType: obj.messageType ?? IMessageType.GROUP_MESSAGE
    });
  }

  toPlain() {
    return {
      ...super.toPlain(),
      groupId: this.groupId,
      toList: this.toList,
      messageType: this.messageType
    };
  }
}

/** 视频消息 */
export interface IMVideoMessage {
  fromId: string;
  toId: string;
  url: string;
  type?: number;
}

/** 可选：构造器工具（如果你偏好 class 风格） */
export class IMVideoMessageModel implements IMVideoMessage {
  fromId: string;
  toId: string;
  url: string;
  type?: number;

  constructor(init: { fromId: string; toId: string; url: string; type?: number }) {
    this.fromId = init.fromId;
    this.toId = init.toId;
    this.url = init.url;
    this.type = init.type;
  }

  static fromPlain(obj: any): IMVideoMessageModel {
    return new IMVideoMessageModel({
      fromId: obj.fromId,
      toId: obj.toId,
      url: obj.url,
      type: obj.type ?? IMessageType.VIDEO_MESSAGE.code
    });
  }

  toPlain(): IMVideoMessage {
    return {
      fromId: this.fromId,
      toId: this.toId,
      url: this.url,
      type: this.type
    };
  }
}

type IMessagePart = {
  type: "text" | "at" | "image" | "file" | "video";
  content: string;
  id?: string;
  name?: string;
  file?: File;
  mentionedUserIds?: string[];
  mentionAll?: boolean;
  replyMessage?: any;
};

/**
 * 通用的 bodyFactory 函数，根据 messageContentType 创建对应的 MessageBody 实例。
 * 会先检查 raw 是否为 JSON 字符串，如果是则解析为对象。
 * @param messageContentType messageContentType 值
 * @param raw messageBody 的原始数据（对象或 JSON 字符串）
 * @returns 对应的 MessageBody 子类实例
 */
function createMessageBody(raw: any, messageContentType: number): MessageBody {
  // 检查 raw 是否为字符串并尝试解析为 JSON
  let parsedRaw = raw;
  if (typeof raw === "string") {
    try {
      parsedRaw = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Invalid JSON string for messageBody: ${raw}`);
    }
  }

  // 根据 messageContentType 创建对应的 MessageBody 实例
  switch (messageContentType) {
    case MessageContentType.TEXT.code:
      return new TextMessageBody(parsedRaw);
    case MessageContentType.IMAGE.code:
      return new ImageMessageBody(parsedRaw);
    case MessageContentType.VIDEO.code:
      return new VideoMessageBody(parsedRaw);
    case MessageContentType.AUDIO.code:
      return new AudioMessageBody(parsedRaw);
    case MessageContentType.FILE.code:
      return new FileMessageBody(parsedRaw);
    case MessageContentType.TIP.code:
      return new SystemMessageBody(parsedRaw);
    case MessageContentType.GROUP_INVITE.code:
      return new GroupInviteMessageBody(parsedRaw);
    case MessageContentType.GROUP_JOIN_APPROVE.code:
      // 假设 GroupJoinApproveMessageBody 与 GroupInviteMessageBody 类似
      // 如果有独立的类，请替换为对应的类
      return new GroupInviteMessageBody(parsedRaw);
    case MessageContentType.LOCAL.code:
      return new LocationMessageBody(parsedRaw);
    case MessageContentType.COMPLEX.code:
      return new ComplexMessageBody(parsedRaw);
    default:
      throw new Error(`Unknown messageContentType: ${messageContentType}`);
  }
}

export {
  MessageBody,
  TextMessageBody,
  ImageMessageBody,
  VideoMessageBody,
  AudioMessageBody,
  FileMessageBody,
  SystemMessageBody,
  GroupInviteMessageBody,
  LocationMessageBody,
  ComplexMessageBody,
  RecallMessageBody,
  EditMessageBody,
  IMessage,
  IMSingleMessage,
  IMGroupMessage,
  createMessageBody
};

export type { IMessagePart };
