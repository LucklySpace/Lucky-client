<template>
  <div class="user-profile-card no-select" role="region" aria-label="用户资料卡片">
    <!-- 头部信息：头像 + 名字 + 性别 -->
    <div v-if="hasContact" class="profile-header">
      <div class="avatar-box">
        <Avatar :avatar="avatarSrc" :name="safeName" :width="60" :borderRadius="10" />
      </div>
      <div class="basic-info">
        <div class="name-row">
          <span class="display-name" :title="safeName">{{ safeName }}</span>
          <el-icon v-if="genderIcon" :class="['gender-icon', genderClass]">
            <component :is="genderIcon" />
          </el-icon>
        </div>
        <div class="account-id">ID: {{ contact?.friendId || contact?.userId || '---' }}</div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="profile-empty">
      <el-empty :image-size="40" description="未选择联系人" />
    </div>

    <template v-if="hasContact">
      <div class="content-divider"></div>

      <!-- 详细资料列表 -->
      <div class="profile-details">
        <!-- 备注：仅好友显示且可编辑，自己不可编辑 -->
        <div v-if="!isMe && contact?.flag === 1" class="detail-item clickable" @click="handleStartEdit">
          <span class="label">{{ $t("search.addFriend.remarkLabel") }}</span>
          <div class="value">
            <template v-if="!isEditingRemark">
              <span class="text-ellipsis">{{ remark || safeName }}</span>
              <el-icon class="edit-icon">
                <Edit />
              </el-icon>
            </template>
            <el-input v-else ref="remarkInputRef" v-model="remark" size="small" class="remark-input" @blur="saveRemark"
              @keyup.enter="saveRemark" @click.stop />
          </div>
        </div>

        <!-- 通用属性 -->
        <div v-for="item in displayInfo" :key="item.label" class="detail-item">
          <span class="label">{{ item.label }}</span>
          <span class="value text-ellipsis">{{ item.value }}</span>
        </div>
      </div>

      <!-- 底部操作栏：自己不显示操作 -->
      <div v-if="!isMe && contact?.flag === 1" class="profile-actions">
        <el-button type="primary" class="action-btn" @click="handleSend">
          {{ $t("common.sendMessage") || '发送消息' }}
        </el-button>
        <el-button class="action-btn" @click="handleCall">
          {{ $t("common.voiceCall") || '语音通话' }}
        </el-button>
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch, nextTick } from "vue";
import { ElMessage } from "element-plus";
import { Male, Female, Edit } from "@element-plus/icons-vue";
import { useFriendsStore } from "@/store/modules/friends";
import { MAX_REMARK_LEN } from "@/constants";
import Avatar from "@/components/Avatar/index.vue";
import defaultImg from "@/assets/avatar/default.jpg";

const { t: $t } = useI18n();
const friendStore = useFriendsStore();

interface Contact {
  avatar?: string | null;
  name?: string | null;
  gender?: number | null;
  friendId?: string | null;
  userId?: string | null;
  location?: string | null;
  flag?: number;
  remark?: string | null;
  selfSignature?: string | null;
}

const props = withDefaults(
  defineProps<{
    contact?: Contact | null;
    isMe?: boolean;
  }>(),
  {
    isMe: false
  }
);

const emit = defineEmits<{
  (e: "handleSend", payload: Contact): void;
  (e: "call", payload: Contact): void;
}>();

const hasContact = computed(() => !!props.contact && (!!props.contact.name || !!props.contact.userId));
const avatarSrc = computed(() => props.contact?.avatar || defaultImg);
const safeName = computed(() => props.contact?.name || "未知用户");

const remark = ref("");
const isEditingRemark = ref(false);
const remarkInputRef = ref();

watch(() => props.contact, (val) => {
  if (val) remark.value = val.remark ?? val.name ?? "";
}, { immediate: true });

const genderIcon = computed(() => {
  if (props.contact?.gender === 1) return Male;
  if (props.contact?.gender === 0) return Female;
  return null;
});

const genderClass = computed(() => ({
  'is-male': props.contact?.gender === 1,
  'is-female': props.contact?.gender === 0
}));

const displayInfo = computed(() => {
  const list = [
    { label: "昵称", value: props.contact?.name },
    { label: "签名", value: props.contact?.selfSignature },
    { label: "地区", value: props.contact?.location }
  ];
  return list.filter(i => !!i.value);
});

const handleStartEdit = () => {
  if (props.isMe) return;
  isEditingRemark.value = true;
  nextTick(() => remarkInputRef.value?.focus());
};

const saveRemark = async () => {
  if (!isEditingRemark.value) return;
  const next = remark.value.trim();
  if (!next) {
    ElMessage.warning($t("errors.remark.empty"));
    remark.value = props.contact?.remark ?? props.contact?.name ?? "";
    isEditingRemark.value = false;
    return;
  }
  if (next.length > MAX_REMARK_LEN) {
    ElMessage.error($t("errors.remark.tooLong", { max: MAX_REMARK_LEN }));
    return;
  }

  try {
    if (props.contact?.friendId && next !== props.contact.remark) {
      await friendStore.updateFriendRemark(props.contact.friendId, next);
      ElMessage.success("备注已更新");
    }
    isEditingRemark.value = false;
  } catch (e) {
    isEditingRemark.value = false;
  }
};

const handleSend = () => emit("handleSend", props.contact!);
const handleCall = () => emit("call", props.contact!);
</script>

<style lang="scss" scoped>
.user-profile-card {
  width: 100%;
  max-width: 280px;
  background-color: #fff;
  border-radius: 8px;
  overflow: hidden;
}

.profile-header {
  padding: 10px;
  display: flex;
  gap: 16px;
  align-items: center;

  .avatar-box {
    flex-shrink: 0;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    border-radius: 10px;
    overflow: hidden;
  }

  .basic-info {
    flex: 1;
    min-width: 0;

    .name-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;

      .display-name {
        font-size: 16px;
        font-weight: 600;
        color: #1d2129;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .gender-icon {
        font-size: 14px;

        &.is-male {
          color: #1e80ff;
        }

        &.is-female {
          color: #f53f3f;
        }
      }
    }

    .account-id {
      font-size: 12px;
      color: #86909c;
    }
  }
}

.profile-empty {
  padding: 30px 0;
}

.content-divider {
  height: 1px;
  background-color: #f2f3f5;
  margin: 0 20px;
}

.profile-details {
  padding: 12px;

  .detail-item {
    display: flex;
    padding: 8px 0;
    font-size: 13px;
    line-height: 1.5;

    &.clickable {
      cursor: pointer;

      &:hover .edit-icon {
        opacity: 1;
      }
    }

    .label {
      width: 40px;
      color: #86909c;
      flex-shrink: 0;
    }

    .value {
      flex: 1;
      color: #4e5969;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 4px;

      .edit-icon {
        font-size: 12px;
        color: #1e80ff;
        opacity: 0;
        transition: opacity 0.2s;
      }

      .remark-input {
        width: 100%;
      }
    }
  }
}

.profile-actions {
  padding: 16px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;

  .action-btn {
    width: 100%;
    margin: 0;
    height: 36px;
    border-radius: 6px;
    font-weight: 500;
  }
}

.text-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
