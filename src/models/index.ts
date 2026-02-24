// src/models/message.ts
import { MessageContentType, MessageType } from "@/constants";


/** 表情条目请求/响应对象  */
export class Emoji {
  /** 所属表情包ID（不能为空，最长 64） */
  packId!: string;

  /** 表情名称（不能为空，最长 128） */
  name!: string;

  /** 标签（逗号分隔，最长 256） */
  tags?: string;

  /** 表情ID */
  emojiId?: string;

  /** 封面图 下载URL（预签名） */
  url?: string;

  constructor(data?: Partial<Emoji>) {
    Object.assign(this, data);
  }
}

/** 表情包请求/响应对象 */
export class EmojiPack {
  /** 包编码（唯一） */
  code?: string;

  /** 包名称（不能为空，最长 128） */
  name!: string;

  /** 包说明（最长 5000） */
  description?: string;

  /** 包ID */
  packId?: string;

  /** 封面图URL */
  url?: string;

  /** 是否启用 */
  enabled?: boolean;

  constructor(data?: Partial<EmojiPack>) {
    Object.assign(this, data);
  }
}

/* -------------------------
   基础类型与 MessageBody
   ------------------------- */

/** 基础 MessageBody（各具体 body 继承） */
abstract class MessageBody {
}

/** 文本 */
class TextMessageBody extends MessageBody {
  text: string;
  replyMessage?: ReplyMessageInfo;
  mentionedUserIds?: string[];
  mentionAll?: boolean;

  constructor(init: { text: string; replyMessage?: ReplyMessageInfo; mentionedUserIds?: string[]; mentionAll?: boolean; }) {
    super();
    this.text = init.text;
    this.replyMessage = init.replyMessage;
    this.mentionedUserIds = Array.isArray(init.mentionedUserIds)
      ? init.mentionedUserIds.map(v => String(v)).filter(Boolean)
      : [];
    this.mentionAll = Boolean(init.mentionAll);
  }
}

/** 图片 */
class ImageMessageBody extends MessageBody {
  path: string;
  name?: string;
  size?: number;
  replyMessage?: ReplyMessageInfo;

  constructor(init: { path: string; name?: string; size?: number; replyMessage?: ReplyMessageInfo; }) {
    super();
    this.path = init.path;
    this.name = init.name;
    this.size = init.size;
    this.replyMessage = init.replyMessage;
  }
}

/** 视频 */
class VideoMessageBody extends MessageBody {
  path: string;
  name?: string;
  duration?: number;
  size?: number;
  replyMessage?: ReplyMessageInfo;

  constructor(init: { path: string; name?: string; duration?: number; size?: number; replyMessage?: ReplyMessageInfo }) {
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
  replyMessage?: ReplyMessageInfo;

  constructor(init: { path: string; duration?: number; size?: number; replyMessage?: ReplyMessageInfo; }) {
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
  replyMessage?: ReplyMessageInfo;

  constructor(init: { path: string; name?: string; suffix?: string; size?: number; replyMessage?: ReplyMessageInfo; }) {
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

class GroupOperationMessageBody extends MessageBody {
  operationType: number;
  groupId: string;
  groupName?: string;
  groupAvatar?: string;
  operatorId: string;
  operatorName?: string;
  targetUserId?: string;
  targetUserName?: string;
  operationTime: number;
  extra?: Record<string, any>;
  description?: string;

  constructor(init: {
    operationType: number;
    groupId: string;
    operatorId: string;
    operationTime: number;
    groupName?: string;
    groupAvatar?: string;
    operatorName?: string;
    targetUserId?: string;
    targetUserName?: string;
    extra?: Record<string, any>;
    description?: string;
  }) {
    super();
    this.operationType = init.operationType;
    this.groupId = init.groupId;
    this.groupName = init.groupName;
    this.groupAvatar = init.groupAvatar;
    this.operatorId = init.operatorId;
    this.operatorName = init.operatorName;
    this.targetUserId = init.targetUserId;
    this.targetUserName = init.targetUserName;
    this.operationTime = init.operationTime;
    this.extra = init.extra;
    this.description = init.description;
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

/** 合并消息体 */
class MergeMessageBody extends MessageBody {

  messages: MessageBody[];

  constructor(init: { messages: MessageBody[]; }) {
    super();
    this.messages = init.messages ?? [];
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

/** IMessage 构造函数参数 */
interface IMessageInit<T extends MessageBody = MessageBody> {
  fromId: string;
  messageTempId: string;
  messageContentType: number;
  messageTime: number;
  messageBody: T;
  messageId?: string;
  readStatus?: number;
  sequence?: number;
  extra?: Record<string, any>
}

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
  messageBody: T;

  constructor(init: IMessageInit<T>) {
    this.fromId = init.fromId;
    this.messageTempId = init.messageTempId;
    this.messageContentType = init.messageContentType;
    this.messageTime = init.messageTime;
    this.messageBody = init.messageBody;
    this.messageId = init.messageId;
    this.readStatus = init.readStatus;
    this.sequence = init.sequence;
    this.extra = init.extra;
  }

  static fromPlainByType<T extends MessageBody = MessageBody>(obj: any): IMessage<T> {
    if (!obj) throw new Error("empty object");
    if (obj.messageType === MessageType.SINGLE_MESSAGE.code) {
      return IMSingleMessage.fromPlain(obj);
    } else if (obj.messageType === MessageType.GROUP_MESSAGE.code) {
      return IMGroupMessage.fromPlain(obj);
    } else if (obj.messageType === MessageType.MESSAGE_OPERATION.code) {
      return IMessageAction.fromPlain(obj);
    } else {
      throw new Error(`Unknown messageType: ${obj.messageType}`);
    }
  }

  static fromPlain<T extends MessageBody = MessageBody>(obj: any): IMessage<T> {
    if (!obj) throw new Error("empty object");
    return new IMessage<T>(createMessageInitFromPlain(obj));
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
      messageBody: this.messageBody
    };
  }
}

/** 私聊消息 */
class IMSingleMessage<T extends MessageBody = MessageBody> extends IMessage<T> {
  toId: string;
  messageType: number;

  constructor(init: IMessageInit<T> & { toId: string; messageType?: number }) {
    super(init);
    this.toId = init.toId;
    this.messageType = typeof init.messageType === "number" ? init.messageType : MessageType.SINGLE_MESSAGE.code;
  }

  static fromPlain<T extends MessageBody = MessageBody>(obj: any): IMSingleMessage<T> {
    if (!obj) throw new Error("empty object");
    const init = createMessageInitFromPlain<T>(obj);
    return new IMSingleMessage<T>({
      ...init,
      toId: obj.toId,
      messageType: obj.messageType ?? MessageType.SINGLE_MESSAGE.code,
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

  constructor(init: IMessageInit<T> & { groupId: string; toList?: string[]; messageType?: number }) {
    super(init);
    this.groupId = init.groupId;
    this.toList = init.toList;
    this.messageType = typeof init.messageType === "number" ? init.messageType : MessageType.GROUP_MESSAGE.code;
  }

  static fromPlain<T extends MessageBody = MessageBody>(obj: any): IMGroupMessage<T> {
    if (!obj) throw new Error("empty object");
    const init = createMessageInitFromPlain<T>(obj);
    return new IMGroupMessage<T>({
      ...init,
      groupId: obj.groupId,
      toList: obj.toList,
      messageType: obj.messageType ?? MessageType.GROUP_MESSAGE.code,
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
      type: obj.type ?? MessageType.VIDEO_MESSAGE.code
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


/** 消息操作（撤回/编辑等，messageType = MESSAGE_OPERATION） */
class IMessageAction<T extends MessageBody = MessageBody> extends IMessage<T> {
  toId?: string;
  groupId?: string;
  messageType: number;

  constructor(init: IMessageInit<T> & { toId?: string; groupId?: string; messageType?: number }) {
    super(init);
    this.toId = init.toId;
    this.groupId = init.groupId;
    this.messageType = typeof init.messageType === "number" ? init.messageType : MessageType.MESSAGE_OPERATION.code;
  }

  static fromPlain<T extends MessageBody = MessageBody>(obj: any): IMessageAction<T> {
    if (!obj) throw new Error("empty object");
    const init = createMessageInitFromPlain<T>(obj);
    return new IMessageAction<T>({
      ...init,
      toId: obj.toId,
      groupId: obj.groupId,
      messageType: obj.messageType ?? MessageType.MESSAGE_OPERATION.code,
    });
  }

  toPlain() {
    return {
      ...super.toPlain(),
      toId: this.toId,
      groupId: this.groupId,
      messageType: this.messageType
    };
  }
}



/** 群操作（messageType = MESSAGE_OPERATION） */
class IMGroupAction<T extends MessageBody = MessageBody> extends IMessage<T> {
  toList?: string[];
  groupId?: string;
  messageType: number;

  constructor(init: IMessageInit<T> & { toList?: string[]; groupId?: string; messageType?: number }) {
    super(init);
    this.toList = init.toList;
    this.groupId = init.groupId;
    this.messageType = typeof init.messageType === "number" ? init.messageType : MessageType.MESSAGE_OPERATION.code;
  }

  static fromPlain<T extends MessageBody = MessageBody>(obj: any): IMGroupAction<T> {
    if (!obj) throw new Error("empty object");
    const init = createMessageInitFromPlain<T>(obj);
    return new IMGroupAction<T>({
      ...init,
      toList: obj.toList,
      groupId: obj.groupId,
      messageType: obj.messageType ?? MessageType.MESSAGE_OPERATION.code,
    });
  }

  toPlain() {
    return {
      ...super.toPlain(),
      toList: this.toList,
      groupId: this.groupId,
      messageType: this.messageType
    };
  }
}

/**
 * 消息组成部分
 * 用于编辑器解析和消息发送
 */
type IMessagePart = {
  /** 部分类型 */
  type: "text" | "at" | "image" | "file" | "video";
  /** 内容（文本内容或资源路径） */
  content: string;
  /** 用户/资源 ID */
  id?: string;
  /** 用户名/文件名 */
  name?: string;
  /** 附件文件 */
  file?: File;
  /** 引用消息信息 */
  replyMessage?: ReplyMessageInfo;
  /** 被 @ 的用户 ID 列表 */
  mentionedUserIds?: string[];
  /** 是否 @所有人 */
  mentionAll?: boolean;
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
    case MessageContentType.RECALL_MESSAGE.code:
      return new RecallMessageBody(parsedRaw);
    case MessageContentType.EDIT_MESSAGE.code:
      return new EditMessageBody(parsedRaw);
    case MessageContentType.MERGE_MESSAGE.code:
      return new MergeMessageBody(parsedRaw);
    case MessageType.GROUP_OPERATION.code:
      return new GroupOperationMessageBody(parsedRaw);
    case MessageContentType.INVITE_TO_GROUP.code:
      return new GroupInviteMessageBody(parsedRaw);
    case MessageContentType.JOIN_APPROVE_GROUP.code:
      return new GroupInviteMessageBody(parsedRaw);
    case MessageContentType.LOCATION.code:
      return new LocationMessageBody(parsedRaw);
    case MessageContentType.COMPLEX.code:
      return new ComplexMessageBody(parsedRaw);
    default:
      throw new Error(`Unknown messageContentType: ${messageContentType}`);
  }
}

/** 从普通对象创建 IMessageInit */
function createMessageInitFromPlain<T extends MessageBody>(obj: any): IMessageInit<T> {
  if (!obj) throw new Error("empty object for createMessageInitFromPlain");
  const bodyRaw = obj.messageBody ?? {};
  const body = createMessageBody(bodyRaw, obj.messageContentType) as T;

  return {
    fromId: obj.fromId,
    messageTempId: obj.messageTempId,
    messageContentType: obj.messageContentType,
    messageTime: obj.messageTime,
    messageBody: body,
    messageId: obj.messageId,
    readStatus: obj.readStatus,
    sequence: obj.sequence,
    extra: obj.extra
  };
}

export {
  AudioMessageBody, ComplexMessageBody, createMessageBody, EditMessageBody, FileMessageBody, GroupInviteMessageBody, GroupOperationMessageBody, ImageMessageBody, IMessage, IMessageAction, IMGroupMessage, IMSingleMessage, LocationMessageBody, MergeMessageBody, MessageBody, RecallMessageBody, SystemMessageBody, TextMessageBody, VideoMessageBody
};

export type { IMessagePart };

