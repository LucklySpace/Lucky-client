<template>
  <div :aria-label="$t('contacts.contactInfo')" class="contact-detail" role="region">
    <!-- 联系人卡片 -->
    <el-card v-if="hasFriend" :body-style="{ padding: '18px' }" class="contact-detail__card" shadow="hover">
      <!-- 头部：头像 + 基本信息 -->
      <el-row align="middle" class="contact-detail__header">
        <el-col :span="6" class="no-select">
          <Avatar :avatar="friendInfo.avatar || ' '" :name="friendInfo.name" :width="84" :borderRadius="6" />
        </el-col>

        <el-col :span="18" class="contact-detail__meta">
          <div class="contact-detail__name-row">
            <span class="contact-detail__name">{{ friendInfo.name }}</span>
            <svg v-if="friendInfo.gender === 1" aria-hidden="true" class="contact-detail__gender no-select">
              <use xlink:href="#icon-nanxing" />
            </svg>
            <svg v-else-if="friendInfo.gender === 0" aria-hidden="true" class="contact-detail__gender no-select">
              <use xlink:href="#icon-nvxing" />
            </svg>
          </div>
          <div v-if="friendInfo.friendId" class="contact-detail__id">
            {{ $t("contacts.idLabel") }} {{ friendInfo.friendId }}
          </div>
        </el-col>
      </el-row>

      <el-divider />

      <!-- 详细信息 -->
      <div class="contact-detail__info">
        <InfoRow v-if="friendInfo.name" :label="$t('profile.remark')">
          <template v-if="!isEditingRemark">
            <span class="contact-detail__remark" @click="startEditRemark">
              {{ remark || friendInfo.name }}
            </span>
            <el-icon class="contact-detail__edit-icon"><Edit /></el-icon>
          </template>
          <el-input
            v-else
            v-model="remark"
            size="small"
            class="contact-detail__remark-input"
            @keyup.enter="saveRemark"
            @blur="cancelEdit"
          />
        </InfoRow>

        <InfoRow v-if="friendInfo.name" :label="$t('contacts.nicknameLabel')">
          {{ friendInfo.name }}
        </InfoRow>

        <InfoRow v-if="friendInfo.location" :label="$t('contacts.regionLabel')">
          {{ friendInfo.location }}
        </InfoRow>

        <InfoRow v-if="friendInfo.selfSignature" :label="$t('contacts.signatureLabel')" class="contact-detail__signature">
          {{ friendInfo.selfSignature }}
        </InfoRow>
      </div>

      <!-- 操作按钮 -->
      <div class="contact-detail__actions">
        <el-button type="primary" @click="handleSendMessage">
          {{ $t("actions.sendMsg") }}
        </el-button>
        <el-button @click="handleCall">
          {{ $t("actions.videoCall") }}
        </el-button>
      </div>
    </el-card>

    <!-- 空状态 -->
    <div v-else class="contact-detail__empty">{{ $t("contacts.noSelectionOrEmpty") }}</div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch, h } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { MessageType, MAX_REMARK_LEN } from "@/constants";
import { useFriendsStore } from "@/store/modules/friends";
import { useChatStore } from "@/store/modules/chat";
import { useCallStore } from "@/store/modules/call";
import Avatar from "@/components/Avatar/index.vue";

// ========================= 类型定义 =========================
interface Friend {
  avatar?: string;
  name?: string;
  gender?: number;
  friendId?: string;
  location?: string;
  selfSignature?: string;
  remark?: string;
}

// ========================= 内联组件 =========================
const InfoRow = (props: { label: string }, { slots }: { slots: any }) => {
  return h("div", { class: "contact-detail__row" }, [
    h("strong", { class: "no-select" }, props.label),
    h("span", {}, slots.default?.()),
  ]);
};

// ========================= Store & Router =========================
const { t } = useI18n();
const router = useRouter();
const chatStore = useChatStore();
const friendStore = useFriendsStore();
const callStore = useCallStore();

// ========================= Computed =========================
const friendInfo = computed<Friend>(() => friendStore.shipInfo ?? {});
const hasFriend = computed(() => friendInfo.value && Object.keys(friendInfo.value).length > 0);

// ========================= 备注编辑 =========================
const remark = ref("");
const isEditingRemark = ref(false);

watch(
  friendInfo,
  (info) => {
    remark.value = info?.remark ?? info?.name ?? "";
  },
  { immediate: true }
);

const startEditRemark = () => {
  if (hasFriend.value) isEditingRemark.value = true;
};

const cancelEdit = () => {
  remark.value = friendInfo.value?.remark ?? friendInfo.value?.name ?? "";
  isEditingRemark.value = false;
};

const saveRemark = async () => {
  const trimmed = remark.value.trim();
  const id = friendInfo.value?.friendId;

  if (!id) return;

  if (!trimmed) {
    ElMessage.warning(t("errors.remark.empty"));
    return;
  }

  if (trimmed.length > MAX_REMARK_LEN) {
    ElMessage.error(t("errors.remark.tooLong", { max: MAX_REMARK_LEN }));
    return;
  }

  try {
    await friendStore.updateFriendRemark(id, trimmed);
    isEditingRemark.value = false;
  } catch {
    ElMessage.error(t("errors.saveFailed"));
  }
};

// ========================= 操作方法 =========================
const navigateToChat = async (friend: Friend, messageType: number) => {
  if (!friend) return;

  await chatStore.handleChangeCurrentChatByTarget(friend, messageType);
  chatStore.handleResetMessage();
  await chatStore.handleGetMessageCount();
  await chatStore.handleGetMessageList(chatStore.currentChat);
  router.push("/message");
};

const handleSendMessage = () => {
  navigateToChat(friendInfo.value, MessageType.SINGLE_MESSAGE.code);
};

const handleCall = async () => {
  await navigateToChat(friendInfo.value, MessageType.SINGLE_MESSAGE.code);
  callStore.handleCreateCallMessage?.();
};
</script>

<style lang="scss" scoped>
.contact-detail {
  min-height: calc(100vh - 80px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  margin-top: -50px;
  box-sizing: border-box;

  &__card {
    width: 600px;
    max-width: calc(100% - 32px);
    border-radius: 5px;
    transition: box-shadow 0.18s ease;

    &:hover {
      box-shadow: 0 12px 36px rgba(16, 24, 40, 0.08);
    }
  }

  &__header {
    margin-bottom: 8px;
  }

  &__meta {
    padding-left: 12px;
  }

  &__name-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__name {
    font-size: 18px;
    font-weight: 700;
    color: #111827;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__gender {
    width: 18px;
    height: 18px;
    opacity: 0.85;
  }

  &__id {
    margin-top: 6px;
    color: #6b6b6b;
    font-size: 13px;
  }

  &__info {
    margin-bottom: 12px;
  }

  &__row {
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

  &__remark {
    cursor: pointer;
    color: var(--main-text-color);
  }

  &__edit-icon {
    font-size: 12px;
    color: #6b6b6b;
    margin-left: 4px;
  }

  &__remark-input {
    max-width: 220px;
  }

  &__signature {
    color: #495057;
    font-style: italic;
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 12px;

    .el-button {
      min-width: 110px;
    }
  }

  &__empty {
    color: #8b8b8b;
    font-size: 14px;
    text-align: center;
    padding: 18px;
  }
}

@media (max-width: 520px) {
  .contact-detail__card {
    width: 92%;

    .contact-detail__actions {
      justify-content: center;

      .el-button {
        min-width: 86px;
      }
    }
  }
}
</style>