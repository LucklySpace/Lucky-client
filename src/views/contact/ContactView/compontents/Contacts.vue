<template>
  <!-- 外层容器：负责居中（水平 + 垂直），并提供页内留白 -->
  <div :aria-label="$t('contacts.contactInfo')" class="contact-page-shell" role="region">
    <!-- 卡片：适度放大，阴影与圆角 -->
    <el-card v-show="hasFriend" :body-style="{ padding: '18px' }" aria-live="polite" class="contact-card"
      shadow="hover">
      <!-- 顶部：头像 + 基本信息 -->
      <el-row align="middle" class="card-top">
        <el-col :span="6" class="avatar-col no-select">
          <!-- 使用 el-avatar 可自动处理图片裁切 & 可提供占位插槽 -->
          <el-avatar :alt="friendInfo.name || 'avatar'" :size="84" :src="friendInfo.avatar ?? defaultImg"></el-avatar>
        </el-col>

        <el-col :span="18" class="meta-col">
          <div class="meta-row">
            <div class="name-and-gender">
              <span class="name">{{ friendInfo.name }}</span>

              <!-- 性别 svg（使用 sprite） -->
              <svg v-if="friendInfo.gender === 0" aria-hidden="true" class="gender-icon no-select">
                <use xlink:href="#icon-nanxing" />
              </svg>
              <svg v-else-if="friendInfo.gender === 1" aria-hidden="true" class="gender-icon no-select">
                <use xlink:href="#icon-nvxing" />
              </svg>

              <!-- 简单在线提示（可根据需求改为真实在线状态） -->
              <!-- <span
                class="online-dot"
                :class="{ online: friendInfo.online }"
                v-if="friendInfo.online !== undefined"
                :title="friendInfo.online ? '在线' : '离线'"
              ></span> -->
            </div>

            <div class="sub-info">
              <span v-if="friendInfo.friendId" class="muted">{{ $t("contacts.idLabel") }} {{ friendInfo.friendId
                }}</span>
            </div>
          </div>
        </el-col>
      </el-row>

      <!-- Divider -->
      <el-divider class="card-divider" />

      <!-- 信息详情 -->
      <div class="info-section">
        <div v-if="friendInfo.name" class="info-row">
          <strong class="no-select">{{ $t("contacts.nicknameLabel") }}</strong> <span>{{ friendInfo.name }}</span>
        </div>
        <!-- <div v-if="friendInfo.friendId" class="info-row">
          <strong>用户ID:</strong> <span>{{ friendInfo.friendId }}</span>
        </div> -->
        <div v-if="friendInfo.location" class="info-row">
          <strong class="no-select">{{ $t("contacts.regionLabel") }}</strong> <span>{{ friendInfo.location }}</span>
        </div>
        <div v-if="friendInfo.selfSignature" class="info-row signature">
          <strong class="no-select">{{ $t("contacts.signatureLabel") }}</strong>
          <span>{{ friendInfo.selfSignature }}</span>
        </div>
      </div>

      <!-- 操作按钮：发送消息（主动作），其它为补充（可按需启用） -->
      <div class="actions-row">
        <el-space>
          <el-button size="default" type="primary" @click="handleSendMessage(friendInfo)">
            <!-- <i class="iconfont icon-huihua" aria-hidden="true"></i> -->
            <span>{{ $t("actions.sendMsg") }}</span>
          </el-button>

          <el-button size="default" type="default" @click="handleCall(friendInfo)">
            <!-- <i class="iconfont icon-phone" aria-hidden="true"></i> -->
            <span>{{ $t("actions.videoCall") }}</span>
          </el-button>

          <!-- <el-button type="text" size="default" @click="$emit('more', friendInfo)">
            <i class="iconfont icon-more" aria-hidden="true"></i>
          </el-button> -->
        </el-space>
      </div>
    </el-card>

    <!-- 可选：当没有 friendInfo 时展示友好提示 -->
    <div v-show="!hasFriend" class="empty-note">{{ $t("contacts.noSelectionOrEmpty") }}</div>
  </div>
</template>

<script lang="ts" setup>
/**
 * - 保持原有 store 逻辑（chatStore、messageStore、friendStore 不变）
 * - 对 avatar 做错误回退，并提供首字母占位（中文取首字）
 * - 提供 handleCall 与 handleSendMessage 两个出口（handleCall 可在未来接入通话逻辑）
 */

import { computed } from "vue";
import { useRouter } from "vue-router";
import { IMessageType } from "@/constants";
import { useFriendsStore } from "@/store/modules/friends";
import { useChatStore } from "@/store/modules/chat";

import defaultImg from "@/assets/avatar/default.jpg";
import { useCallStore } from "@/store/modules/call";

type Friend = {
  avatar?: string;
  name?: string;
  gender?: number;
  friendId?: string;
  location?: string;
  selfSignature?: string;
  online?: boolean;
};

const router = useRouter();
const callStore = useCallStore();
const chatMessageStore = useChatStore();
const friendStore = useFriendsStore();

// 计算属性：从 store 中读取 friendInfo，确保返回对象类型（避免 null 导致模板报错）
const friendInfo = computed<Friend>(() => {
  return friendStore.shipInfo ?? {};
});

// 判断是否有有效 friend 信息（用于 v-show）
const hasFriend = computed(() => {
  // 如果对象为空或没有 name 则判为空
  return friendInfo.value && Object.keys(friendInfo.value).length > 0;
});

// 头像回退逻辑：优先使用 store 的 avatar，否则显示默认资源
//const DEFAULT_AVATAR = "/images/default-avatar.png";
// const avatarSrc = ref<string>( ?? DEFAULT_AVATAR);

// // 监听 friendInfo 变化时更新 avatarSrc（防止老图片残留）
// // 这里不使用 watch 以避免额外代码量，你可以在需要时添加 watch(friendInfo, ...)
// if (friendInfo.value.avatar) {
//   avatarSrc.value = friendInfo.value.avatar;
// }

// 图片加载错误回退到默认头像
// function onAvatarError() {
//   avatarSrc.value = DEFAULT_AVATAR;
// }

// 首字母占位（中文/英文兼容）
// const fallbackInitials = computed(() => {
//   const name = (friendInfo.value?.name || "").toString().trim();
//   if (!name) return "?";
//   const first = name[0];
//   return /[A-Za-z]/.test(first) ? first.toUpperCase() : first;
// });

// 发送消息
const handleSendMessage = async (fi: any) => {
  if (!fi) return;
  await chatMessageStore.handleChangeCurrentChatByTarget(fi, IMessageType.SINGLE_MESSAGE.code);

  // 请求消息数量与列表
  chatMessageStore.handleResetMessage();
  await chatMessageStore.handleGetMessageCount();
  await chatMessageStore.handleGetMessageList(chatMessageStore.currentChat);
  //await messageStore.handleSearchMessageUrl(chatStore.currentChat);

  // 跳转到消息页面
  router.push("/message");
};

// 占位：发起通话
async function handleCall(fi: any) {
  if (!fi) return;
  await chatMessageStore.handleChangeCurrentChatByTarget(fi, IMessageType.SINGLE_MESSAGE.code);

  // 请求消息数量与列表
  chatMessageStore.handleGetMessageCount();
  chatMessageStore.handleGetMessageList(chatMessageStore.currentChat);
  chatMessageStore.handleSearchMessageUrl(chatMessageStore.currentChat);

  // 跳转到消息页面
  router.push("/message");

  callStore.handleCreateCallMessage?.();
}
</script>

<style lang="scss" scoped>
/* 外层容器：全屏居中（垂直 + 水平），并提供背景留白 */
.contact-page-shell {
  min-height: calc(100vh - 80px);
  /* 留出顶部栏等空间 */
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  margin-top: -50px;
  box-sizing: border-box;
}

/* 卡片主体：放大尺寸、圆角与微动效 */
.contact-card {
  width: 600px;
  max-width: calc(100% - 32px);
  /* 在窄屏下自动适配 */
  border-radius: 5px;
  transition: transform 0.18s ease, box-shadow 0.18s ease;

  &:hover {
    //transform: translateY(-6px);
    box-shadow: 0 12px 36px rgba(16, 24, 40, 0.08);
  }

  .card-top {
    margin-bottom: 8px;
  }

  /* 覆盖 ElementPlus 默认圆形样式 */
  .el-avatar {
    border-radius: 5px !important;
    /* 关键：改为矩形圆角 */
    width: 84px !important;
    height: 84px !important;
    overflow: hidden;
    /* 确保图片不会溢出圆角 */
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  }

  /* 让图片完整填充 avatar 区域并保持裁切（居中裁剪） */
  .el-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  /* 同步修改占位首字母的圆角（插槽 fallback） */
  .avatar-fallback {
    border-radius: 5px;
  }

  .meta-col {
    padding-left: 12px;
  }

  .name-and-gender {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .name {
    font-size: 18px;
    font-weight: 700;
    color: #111827;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .gender-icon {
    width: 18px;
    height: 18px;
    opacity: 0.85;
  }

  .online-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    margin-left: 6px;
    // border-radius: 50%;
    background: #bdbdbd;

    /* 离线色 */
    &.online {
      background: #39ba72;
      /* 在线色 */
      box-shadow: 0 0 6px rgba(57, 186, 114, 0.18);
    }
  }

  .sub-info {
    margin-top: 6px;
    color: #6b6b6b;
    font-size: 13px;
  }

  .card-divider {
    margin: 12px 0;
  }

  .info-section {
    .info-row {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      font-size: 14px;
      color: #333;
      margin-bottom: 8px;

      strong {
        color: #6b6b6b;
        min-width: 84px;
      }
    }

    .signature {
      color: #495057;
      font-style: italic;
    }
  }

  .actions-row {
    margin-top: 12px;
    display: flex;
    justify-content: flex-end;

    .el-button {
      min-width: 110px;
    }
  }
}

/* 头像占位首字母样式 */
.avatar-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #9bd8ff, #5aa9ff);
}

/* 窄屏适配：卡片宽度降低，按钮居中换行 */
@media (max-width: 520px) {
  .contact-card {
    width: 92%;

    .actions-row {
      justify-content: center;

      .el-button {
        min-width: 86px;
      }
    }
  }
}

/* 当无联系人时提示文本 */
.empty-note {
  color: #8b8b8b;
  font-size: 14px;
  text-align: center;
  padding: 18px;
}
</style>
