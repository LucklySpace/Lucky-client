<template>
  <div :aria-label="$t('contacts.contactInfo')" class="contact-page-shell" role="region">
    <el-card
      v-show="hasFriend"
      :body-style="{ padding: '18px' }"
      aria-live="polite"
      class="contact-card"
      shadow="hover"
    >
      <!-- 顶部信息 -->
      <el-row align="middle" class="card-top">
        <el-col :span="6" class="avatar-col no-select">
          <Avatar 
            :avatar="friendInfo.avatar || ''" 
            :name="friendInfo.name" 
            :width="84" 
            :borderRadius="6" 
          />
        </el-col>

        <el-col :span="18" class="meta-col">
          <div class="meta-row">
            <div class="name-and-gender">
              <span class="name">{{ friendInfo.name }}</span>
              <!-- 性别图标 -->
              <svg v-if="friendInfo.gender === 0" aria-hidden="true" class="gender-icon no-select">
                <use xlink:href="#icon-nanxing" />
              </svg>
              <svg v-else-if="friendInfo.gender === 1" aria-hidden="true" class="gender-icon no-select">
                <use xlink:href="#icon-nvxing" />
              </svg>
            </div>

            <div class="sub-info">
              <span v-if="friendInfo.friendId" class="muted">
                {{ $t("contacts.idLabel") }} {{ friendInfo.friendId }}
              </span>
            </div>
          </div>
        </el-col>
      </el-row>

      <el-divider class="card-divider" />

      <!-- 详细信息 -->
      <div class="info-section">
        <!-- 备注 -->
        <div v-if="friendInfo.name" class="info-row">
          <strong class="no-select">{{ $t("search.addFriend.remarkLabel") }}</strong>
          <template v-if="!isEditingRemark">
            <span class="remark-text" @click="startEditRemark">
              {{ displayRemark }}
            </span>
            <el-icon class="edit-icon" @click="startEditRemark"><Edit /></el-icon>
          </template>
          <template v-else>
            <el-input
              v-model="remarkModel"
              size="small"
              class="remark-input"
              @keyup.enter="saveRemark"
              @blur="cancelEdit"
              ref="remarkInputRef"
            />
          </template>
        </div>

        <!-- 昵称 -->
        <div v-if="friendInfo.name" class="info-row">
          <strong class="no-select">{{ $t("contacts.nicknameLabel") }}</strong>
          <span>{{ friendInfo.name }}</span>
        </div>

        <!-- 地区 -->
        <div v-if="friendInfo.location" class="info-row">
          <strong class="no-select">{{ $t("contacts.regionLabel") }}</strong>
          <span>{{ friendInfo.location }}</span>
        </div>

        <!-- 签名 -->
        <div v-if="friendInfo.selfSignature" class="info-row signature">
          <strong class="no-select">{{ $t("contacts.signatureLabel") }}</strong>
          <span>{{ friendInfo.selfSignature }}</span>
        </div>
      </div>

      <!-- 底部操作按钮 -->
      <div class="actions-row">
        <el-space>
          <el-button type="primary" @click="handleSendMessage">
            {{ $t("actions.sendMsg") }}
          </el-button>
          <el-button @click="handleCall">
            {{ $t("actions.videoCall") }}
          </el-button>
        </el-space>
      </div>
    </el-card>

    <div v-show="!hasFriend" class="empty-note">
      {{ $t("contacts.noSelectionOrEmpty") }}
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch, nextTick } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { ElMessage } from "element-plus";
import { Edit } from "@element-plus/icons-vue";

import Avatar from "@/components/Avatar/index.vue";
import { useFriendsStore } from "@/store/modules/friends";
import { useChatStore } from "@/store/modules/chat";
import { useCallStore } from "@/store/modules/call";
import { IMessageType, MAX_REMARK_LEN } from "@/constants";

// 定义接口
interface FriendInfo {
  id?: string;
  friendId?: string;
  name?: string;
  remark?: string;
  avatar?: string;
  gender?: number;
  location?: string;
  selfSignature?: string;
  online?: boolean;
}

const { t } = useI18n();
const router = useRouter();
const friendStore = useFriendsStore();
const chatStore = useChatStore();
const callStore = useCallStore();

// 当前选中的好友信息
const friendInfo = computed<FriendInfo>(() => friendStore.shipInfo ?? {});
const hasFriend = computed(() => !!friendInfo.value.friendId);

// 备注相关逻辑
const isEditingRemark = ref(false);
const remarkModel = ref("");
const remarkInputRef = ref();

const displayRemark = computed(() => {
  return friendInfo.value.remark || friendInfo.value.name || "";
});

watch(
  () => friendInfo.value,
  (newVal) => {
    remarkModel.value = newVal.remark || newVal.name || "";
  },
  { immediate: true }
);

function startEditRemark() {
  if (!hasFriend.value) return;
  remarkModel.value = displayRemark.value;
  isEditingRemark.value = true;
  nextTick(() => {
    remarkInputRef.value?.focus();
  });
}

function cancelEdit() {
  isEditingRemark.value = false;
  remarkModel.value = displayRemark.value;
}

async function saveRemark() {
  const newVal = remarkModel.value.trim();
  const id = friendInfo.value.friendId;
  
  if (!id) return;
  if (!newVal) {
    ElMessage.warning(t("errors.remark.empty"));
    return;
  }
  if (newVal.length > MAX_REMARK_LEN) {
    ElMessage.error(t("errors.remark.tooLong", { max: MAX_REMARK_LEN }));
    return;
  }

  try {
    await friendStore.updateFriendRemark(id, newVal);
    isEditingRemark.value = false;
  } catch (error) {
    console.error("Failed to update remark:", error);
    ElMessage.error(t("errors.remark.failed") || "保存失败");
  }
}

// 消息与通话
async function handleSendMessage() {
  if (!friendInfo.value.friendId) return;
  
  // 切换到聊天
  await chatStore.startChat({
    chatId: friendInfo.value.friendId,
    name: displayRemark.value,
    avatar: friendInfo.value.avatar,
    chatType: IMessageType.PRIVATE_MESSAGE.code,
  });
  
  router.push("/chat");
}

function handleCall() {
  if (!friendInfo.value.friendId) return;
  
  callStore.startCall({
    targetId: friendInfo.value.friendId,
    type: "video", // 默认为视频通话
    userInfo: {
      name: displayRemark.value,
      avatar: friendInfo.value.avatar,
    }
  });
}
</script>

<style lang="scss" scoped>
/* 使用 SCSS 变量管理间距与颜色 */
.contact-page-shell {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--el-bg-color-page); /* 页面背景色 */
  padding: 20px;
  box-sizing: border-box;
}

.contact-card {
  width: 100%;
  max-width: 480px;
  border-radius: 12px;
  
  /* 深度选择器覆盖 Element Plus Card 样式 */
  :deep(.el-card__body) {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
}

.card-top {
  padding-bottom: 8px;
}

.avatar-col {
  display: flex;
  justify-content: center;
}

.meta-col {
  padding-left: 12px;
}

.meta-row {
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 84px; /* 与头像高度对齐 */
}

.name-and-gender {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  
  .name {
    font-size: 20px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    margin-right: 8px;
  }

  .gender-icon {
    width: 16px;
    height: 16px;
    fill: currentColor;
    color: var(--el-text-color-regular);
  }
}

.sub-info {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.card-divider {
  margin: 8px 0 !important;
}

.info-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 0;
}

.info-row {
  display: flex;
  align-items: center;
  font-size: 14px;
  min-height: 24px;
  
  strong {
    width: 80px;
    color: var(--el-text-color-regular);
    font-weight: normal;
    flex-shrink: 0;
  }
  
  span {
    color: var(--el-text-color-primary);
    word-break: break-all;
  }

  &.signature {
    align-items: flex-start;
  }
}

.remark-text {
  cursor: pointer;
  border-bottom: 1px dashed transparent;
  transition: border-color 0.2s;
  
  &:hover {
    border-bottom-color: var(--el-border-color);
  }
}

.edit-icon {
  margin-left: 8px;
  cursor: pointer;
  color: var(--el-text-color-secondary);
  font-size: 14px;
  
  &:hover {
    color: var(--el-color-primary);
  }
}

.remark-input {
  width: 200px;
}

.actions-row {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}

.empty-note {
  color: var(--el-text-color-placeholder);
  font-size: 14px;
}
</style>
