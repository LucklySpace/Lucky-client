<template>
  <div v-memo="[message, isOwner]" :class="['bubble', message.type, { owner: isOwner }]" class="message-bubble">
    <template v-if="message.messageContentType == MessageContentType.TEXT.code">
      <div v-dompurify="handleMessageProcess(message.messageBody?.text)" class="text-bubble" translate="yes"></div>
    </template>

    <template v-if="message.messageContentType == MessageContentType.IMAGE.code">
      <img :src="message.messageBody?.path" alt="Image message" class="img-bubble lazy-img"
        @click="handlePreview(message.messageBody?.path)" />
    </template>

    <template v-if="message.messageContentType == MessageContentType.VIDEO.code">
      <div class="video-bubble" style="cursor: pointer" @click="handlePreview(message.messageBody?.path)">
        <div class="play-icon">
          <i class="iconfont icon-bofang1" style="color: white; font-size: 60px"></i>
        </div>
        <video controls style="pointer-events: none">
          <source :src="message.messageBody?.path" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      </div>
    </template>
    <template v-if="message.messageContentType == MessageContentType.FILE.code">
      <div :style="hasPath ? 'cursor: pointer;' : ''" :title="message.messageBody?.name" class="file-bubble"
        @click="openFile()">
        <svg class="file-icon">
          <use :xlink:href="fileIcon"></use>
        </svg>
        <div class="file-details">
          <div class="file-name no-select">{{ message.messageBody?.name }}</div>
          <div class="file-size no-select">{{ formatFileSize(message.messageBody?.size) }}</div>
        </div>
        <div v-if="!hasPath" class="download-btn" @click="downloadFile(message)">
          <i class="iconfont icon-xiazai"></i>
        </div>
      </div>
      <!-- 下载按钮（当本地无路径时显示） -->
      <button v-if="!hasPath" class="download-btn" @click.stop="download(message)">
        <i class="iconfont icon-xiazai"></i>
      </button>
    </template>
  </div>
</template>

<script lang="ts" setup>
import { MessageContentType } from "@/constants";
import { ShowPreviewWindow } from "@/windows/preview";
import { useChatStore } from "@/store/modules/chat";

const messageStore = useChatStore();

const props = defineProps({
  message: {
    type: Object,
    required: true
  },
  isOwner: {
    type: Boolean,
    required: true
  }
});

// 处理预览
const handlePreview = (url: string) => {
  ShowPreviewWindow("", url);
};

const download = (m: any) => {
  console.log(m);
};

/**
 * 处理文本消息
 * @param message 文本消息
 */
const handleMessageProcess = (message: string) => {
  //message = message.replace(/\n/g, '<br>');
  // 判断是否有 `url`
  message = urlToLink(message);
  return message;
};

const urlToLink = (str: string) => {
  const re: RegExp = new RegExp("(ftp|http|https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/[^\s]*)?", "g");
  return str.replace(re, function (website) {
    return (
      "<a href='" + website + "' style='text-decoration: none; cursor: pointer;' target='_blank'>" + website + "</a>"
    );
  });
};

// 判断是否有 `path`
const hasPath = computed(() => !!props.message.messageBody?.path);

// 获取文件图标
const fileIconMap = {
  md: "#icon-Markdown",
  "7z": "#icon-file_rar",
  rar: "#icon-file_rar",
  zip: "#icon-file_rar",
  pdf: "#icon-file-b-3",
  doc: "#icon-file-b-5",
  docx: "#icon-file-b-5",
  xls: "#icon-file-b-9",
  xlsx: "#icon-file-b-9",
  ppt: "#icon-file-b-4",
  pptx: "#icon-file-b-4",
  txt: "#icon-file-b-2",
  default: "#icon-file_rar"
};

const fileIcon = computed(() => {
  const extension = props.message.messageBody?.name?.split(".").pop();
  return (fileIconMap as any)[extension] || fileIconMap.default;
});

// 打开文件
const openFile = () => {
  const data = props.message.messageBody;
  if (data.path && data.path !== "") {
    //messageStore.handleOpenFile(data.path);
  }
};

// 下载文件
const downloadFile = (message: any) => {
  //messageStore.handleDownloadAndSaveFile(message);
};

// 格式化文件大小
const formatFileSize = (size: number) => {
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  if (size === 0) return "0 Byte";
  const i = Math.floor(Math.log(size) / Math.log(1024));
  return (size / Math.pow(1024, i)).toFixed(2) + " " + sizes[i];
};
</script>

<style lang="scss" scoped>
.file-bubble {
  display: flex;
  align-items: center;
  background-color: #fff;
  width: 220px;
  padding: 12px;
  border-radius: 5px;
  border: 1px solid #e7e7e7;
  box-shadow: 1px 1px 1px rgba(0, 0, 0, 0.1);
}

.file-icon {
  width: 28px;
  height: 28px;
  fill: currentColor;
  overflow: hidden;
  margin-right: 10px;
}

.file-details {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}

.file-name {
  width: 130px;
  font-weight: bold;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  padding-top: 5px;
  font-size: 12px;
  color: #888;
}

.download-btn {
  color: white;
  border: none;
  padding: 6px 8px;
  cursor: pointer;

  .icon-xiazai {
    color: #777;
    font-size: 22px;
  }
}

.download-btn:hover {
  color: #555;
  // font-size: 20px;
  scale: 1.2;
}

.text-bubble {
  padding: 10px;
}

.message-bubble {
  display: inline-block;
  border-radius: 8px;
  //padding: 8px;
  font-size: 14px;
  color: #333;
  position: relative;
  //width: 80%;
  max-width: 60%;
  word-wrap: break-word;
  // overflow: hidden;
  background-color: #e1f5fe;
  //color: #333;
}

.message-bubble.text {
  background-color: #e1f5fe;
  white-space: break-spaces;
}

.message-bubble img,
.message-bubble video {
  width: 200px;
  //height: 100%;
  border-radius: 5px;
  cursor: pointer;
}

.message-bubble.owner {
  background-color: #dcf8c6;
  /* Different color for owner */
}

.message-bubble:not(.owner) span {
  content: " ";
  //font-size: 14px;
  position: absolute;
  left: -15px;
  /* Default position */
  top: 10px;
  display: inline-block;
  border: 8px solid #e1f5fe;
  border-top-color: transparent;
  border-left-color: transparent;
  border-bottom-color: transparent;
}

.message-bubble.owner span {
  content: " ";
  //font-size: 14px;
  position: absolute;
  right: -15px;
  /* Adjust position for owner */
  top: 10px;
  display: inline-block;
  border: 8px solid #dcf8c6;
  border-top-color: transparent;
  border-right-color: transparent;
  border-bottom-color: transparent;
}

.video-bubble {
  color: white;
}

.play-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: white;
  font-size: 30px;
  pointer-events: none;
  z-index: 9;
}

//全屏按钮
video::-webkit-media-controls-fullscreen-button {
  display: none;
}

//播放按钮
video::-webkit-media-controls-play-button {
  display: none;
}

//进度条
video::-webkit-media-controls-timeline {
  display: none;
}

//观看的当前时间
video::-webkit-media-controls-current-time-display {
  display: none;
}

//剩余时间
video::-webkit-media-controls-time-remaining-display {
  display: none;
}

//音量按钮
video::-webkit-media-controls-mute-button {
  display: none;
}

video::-webkit-media-controls-toggle-closed-captions-button {
  display: none;
}

//音量的控制条
video::-webkit-media-controls-volume-slider {
  display: none;
}

//所有控件
video::-webkit-media-controls-enclosure {
  display: none;
}
</style>
