export const MessageType = {
    ERROR: { code: -1, description: "协议错误/非法数据包" },
    SUCCESS: { code: 0, description: "成功响应" },

    LOGIN: { code: 1, description: "登录" },
    LOGOUT: { code: 2, description: "退出登录" },
    LOGIN_EXPIRED: { code: 3, description: "登录过期" },
    REFRESH_TOKEN: { code: 4, description: "刷新Token" },
    FORCE_LOGOUT: { code: 5, description: "强制下线" },
    TOKEN_ERROR: { code: 6, description: "Token错误" },
    NOT_LOGIN: { code: 7, description: "未登录" },

    REGISTER: { code: 100, description: "注册" },
    HEART_BEAT: { code: 101, description: "心跳" },
    CONNECT: { code: 102, description: "建立连接" },
    DISCONNECT: { code: 103, description: "断开连接" },
    DUPLICATE_LOGIN: { code: 104, description: "异地登录" },
    PRESENCE_UPDATE: { code: 105, description: "在线状态更新" },
    LAST_SEEN_UPDATE: { code: 106, description: "最后在线时间更新" },
    LOGIN_FAILED_TOO_MANY_TIMES: { code: 107, description: "登录失败次数过多" },
    REGISTER_SUCCESS: { code: 120, description: "注册成功" },
    REGISTER_FAILED: { code: 121, description: "注册失败" },
    HEART_BEAT_SUCCESS: { code: 130, description: "心跳成功" },
    HEART_BEAT_FAILED: { code: 131, description: "心跳失败" },

    

    RTC_START_AUDIO_CALL: { code: 500, description: "发起语音通话" },
    RTC_START_VIDEO_CALL: { code: 501, description: "发起视频通话" },
    RTC_ACCEPT: { code: 502, description: "接受通话" },
    RTC_REJECT: { code: 503, description: "拒绝通话" },
    RTC_CANCEL: { code: 504, description: "取消通话" },
    RTC_FAILED: { code: 505, description: "通话失败" },
    RTC_HANDUP: { code: 506, description: "挂断通话" },
    RTC_CANDIDATE: { code: 507, description: "同步Candidate" },
    RTC_OFFLINE: { code: 508, description: "对方离线" },

    SINGLE_MESSAGE: { code: 1000, description: "私聊消息" },
    GROUP_MESSAGE: { code: 1001, description: "群聊消息" },
    VIDEO_MESSAGE: { code: 1002, description: "视频消息" },
    SYSTEM_MESSAGE: { code: 1003, description: "系统消息" },
    BROADCAST_MESSAGE: { code: 1004, description: "广播消息" },

    USER: { code: 2000, description: "普通用户" },
    ROBOT: { code: 2001, description: "机器人" },
    PUBLIC_ACCOUNT: { code: 2002, description: "公众号" },
    CUSTOMER_SERVICE: { code: 2003, description: "客服" },

    UNKNOWN: { code: 9999, description: "未知指令" },
} as const;
