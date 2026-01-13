<template>
  <div class="group-detail" role="region">
    <!-- 群组卡片 -->
    <el-card v-if="hasGroup" :body-style="{ padding: '18px' }" class="group-detail__card" shadow="hover">
      <!-- 头部：头像 + 基本信息 -->
      <el-row align="middle" class="group-detail__header">
        <el-col :span="6" class="no-select">
          <Avatar
            :avatar="avatarSrc || ' '"
            :name="displayName"
            :width="84"
            :borderRadius="6"
            backgroundColor="#ffb36b"
          />
        </el-col>

        <el-col :span="18" class="group-detail__meta">
          <div class="group-detail__name">{{ displayName }}</div>
          <div class="group-detail__tags">
            <span class="group-detail__tag">{{ groupTypeText }}</span>
          </div>
        </el-col>
      </el-row>

      <el-divider />

      <!-- 详细信息 -->
      <div class="group-detail__info">
        <div class="group-detail__row">
          <strong class="no-select">{{ $t("group.memberLabel") }}</strong>
          <span>{{ groupInfo.memberCount ?? $t("group.unknown") }}</span>
        </div>

        <div v-if="groupInfo.description" class="group-detail__row">
          <strong class="no-select">{{ $t("group.descriptionLabel") }}</strong>
          <span>{{ groupInfo.description }}</span>
        </div>

        <div v-if="groupNotice" class="group-detail__row">
          <strong class="no-select">{{ $t("chat.groupChat.groupNotice") }}</strong>
          <span>{{ groupNotice }}</span>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="group-detail__actions">
        <el-button type="primary" @click="handleEnterGroup">
          {{ $t("group.enterGroup") }}
        </el-button>
      </div>
    </el-card>

    <!-- 空状态 -->
    <div v-else class="group-detail__empty">{{ $t("group.noSelectionOrEmpty") }}</div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { MessageType } from "@/constants";
import { useFriendsStore } from "@/store/modules/friends";
import { useChatStore } from "@/store/modules/chat";
import Avatar from "@/components/Avatar/index.vue";

// ========================= 类型定义 =========================
interface Group {
  groupId?: string;
  ownerId?: string;
  groupType?: number;
  groupName?: string;
  avatar?: string;
  memberCount?: number;
  description?: string;
}

// ========================= Store & Router =========================
const { t } = useI18n();
const router = useRouter();
const chatStore = useChatStore();
const friendStore = useFriendsStore();

// ========================= Computed =========================
const groupInfo = computed<Group>(() => friendStore.shipInfo ?? {});

const relatedChat = computed(() => {
  const gid = groupInfo.value?.groupId;
  if (!gid) return null;
  return chatStore.chatList.find((c) => String(c.chatId) === String(gid)) ?? null;
});

const displayName = computed(() =>
  relatedChat.value?.name ?? groupInfo.value.groupName ?? ""
);

const hasGroup = computed(() =>
  groupInfo.value && Object.keys(groupInfo.value).length > 0 && Boolean(groupInfo.value.groupId)
);

const avatarSrc = ref<string | undefined>();

watch(
  () => [relatedChat.value?.avatar, groupInfo.value.avatar],
  () => {
    avatarSrc.value = relatedChat.value?.avatar ?? groupInfo.value.avatar;
  },
  { immediate: true }
);

const groupTypeText = computed(() => {
  const typeMap: Record<number, string> = {
    1: t("group.type.normal"),
    2: t("group.type.private"),
  };
  return typeMap[groupInfo.value.groupType ?? 0] ?? t("group.type.default");
});

const groupNotice = computed(() =>
  ((relatedChat.value as any)?.notification ?? "").trim()
);

// ========================= 操作方法 =========================
const handleEnterGroup = async () => {
  const group = groupInfo.value;
  if (!group) return;

  await chatStore.handleChangeCurrentChatByTarget(group, MessageType.GROUP_MESSAGE.code);
  chatStore.handleResetMessage();
  await chatStore.handleGetMessageCount();
  await chatStore.handleGetMessageList(chatStore.currentChat);
  router.push("/message");
};
</script>

<style lang="scss" scoped>
.group-detail {
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

  &__name {
    font-size: 18px;
    font-weight: 700;
    color: #111827;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__tags {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  &__tag {
    font-size: 12px;
    color: #556;
    background: #f3f6f9;
    padding: 2px 8px;
    border-radius: 999px;
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

  &__actions {
    display: flex;
    justify-content: flex-end;
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
  .group-detail__card {
    width: 92%;

    .group-detail__actions {
      justify-content: center;

      .el-button {
        min-width: 86px;
      }
    }
  }
}
</style>
