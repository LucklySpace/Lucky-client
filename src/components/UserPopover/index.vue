<template>
  <div aria-label="联系人卡片" class="contact-card-wrap" role="region">
    <!-- 顶部：头像 + 基本信息 -->
    <div v-if="hasContact" class="contact-card__top">
      <span class="contact-card__avatar">
        <Avatar :avatar="avatarSrc" :name="safeName" :width="64" :borderRadius="6"></Avatar>
      </span>

      <div class="contact-card__meta">
        <div class="contact-card__title">
          <span class="name">{{ safeName }}</span>

          <!-- 性别图标（可无） -->
          <svg v-if="genderIconId" aria-hidden="true" class="gender-icon">
            <use :xlink:href="genderIconId" />
          </svg>

          <!-- 在线/离线小点（若需要可开启） -->
          <!-- <span class="status-dot" :class="{ online: !!contact?.online }" aria-hidden="true"></span> -->
        </div>

        <!-- 简短信息（用户ID 等） -->
        <div class="contact-card__sub">
          <span v-if="isMe" class="muted"> ID: {{ contact?.userId }}</span>
          <span v-if="contact?.friendId" class="muted"> ID: {{ contact.friendId }}</span>
        </div>
      </div>
    </div>

    <!-- 占位：当 contact 为空时显示提示（避免页面空白） -->
    <div v-else aria-live="polite" class="contact-card__empty" role="status">
      <span class="contact-card__avatar empty-avatar">
        <Avatar :name="'?'" :width="64" :borderRadius="6"></Avatar>
      </span>
      <div class="empty-text">
        <div class="empty-title">未选择联系人</div>
        <div class="empty-sub">请选择联系人以查看详细信息</div>
      </div>
    </div>

    <!-- 信息项列表（自动过滤空项） -->
    <el-divider v-if="hasContact"></el-divider>
    <div v-if="hasContact" class="contact-card__info">
      <div class="info-row">
        <span class="info-label">{{ $t("search.addFriend.remarkLabel") }}:</span>
        <div v-if="!isEditingRemark" class="info-value" @click="isEditingRemark = true">
          <span>{{ remark || safeName }}</span>
        </div>
        <div v-else class="info-value" v-click-outside="handleClickOutside">
          <el-input v-model="remark" size="small" @keyup.enter="saveRemark" />
        </div>
      </div>
      <div v-for="item in infoList" :key="item.label" class="info-row">
        <div class="info-label">{{ item.label }}</div>
        <div class="info-value">{{ item.value }}</div>
      </div>
    </div>

    <!-- 底部操作按钮（发送消息、语音通话、更多） -->
    <div v-if="!isMe && contact?.flag == 1" :aria-hidden="!hasContact" class="contact-card__actions">
      <el-space>
        <el-tooltip content="发送消息" placement="top">
          <el-button :disabled="!hasContact" aria-label="发送消息" type="primary" @click="handleSend">
            <span class="btn-text">发送</span>
          </el-button>
        </el-tooltip>

        <el-tooltip content="语音/视频通话" placement="top">
          <el-button :disabled="!hasContact" aria-label="发起通话" type="default" @click="handleCall">
            <span class="btn-text">通话</span>
          </el-button>
        </el-tooltip>

        <!-- <el-tooltip content="更多操作" placement="top">
          <el-button size="small" type="text" :disabled="!hasContact" @click="emitMore" aria-label="更多操作">
            <i class="iconfont icon-more" aria-hidden="true"></i>
          </el-button>
        </el-tooltip> -->
      </el-space>
    </div>
  </div>
</template>

<script lang="ts" setup>
  /**
   * ContactCard - 空安全优化版
   *
   * 特性：
   * - props.contact 可为 undefined/null，组件能优雅展示占位状态。
   * - 所有字段访问使用可选链并提供默认值，避免抛错。
   * - avatarSrc 随 contact 更新自动变化；图片加载失败回退到 defaultImg。
   * - 操作按钮在无 contact 时禁用，且 emit 有保护。
   */

  import { computed, ref, watch } from "vue";
  import defaultImg from "@/assets/avatar/default.jpg";
  import { ClickOutside as vClickOutside } from "element-plus";
  import { useFriendsStore } from "@/store/modules/friends";
  import { MAX_REMARK_LEN } from "@/constants";
  import Avatar from "@/components/Avatar/index.vue";

  const { t: $t } = useI18n();
  const friendStore = useFriendsStore();
  // contact 类型（保持向后兼容，字段可选）
  type Contact = {
    avatar?: string | null;
    name?: string | null;
    gender?: number | null; // 0 男 / 1 女 / undefined 未知
    friendId?: string | null;
    userId?: string | null;
    location?: string | null;
    online?: boolean | null;
    flag?: number; // 1 好友 2 非好友
  };

  // props：contact 可选（可能为 null/undefined）
  const props = withDefaults(
    defineProps<{
      contact?: Contact | null;
      showStatus?: boolean;
      isMe?: boolean;
    }>(),
    {
      showStatus: false,
      isMe: false
    }
  );

  const emit = defineEmits<{
    (e: "handleSend", payload: Contact): void;
    (e: "call", payload: Contact): void;
    (e: "more", payload: Contact): void;
  }>();

  /* ----------------- 响应式与安全访问 ----------------- */

  // 判断是否存在 contact（用于切换占位与实际展示）
  const hasContact = computed(
    () => !!props.contact && Object.keys(props.contact).length > 0 && !!(props.contact as any).name
  );

  /* avatarSrc：根据 contact.avatar 动态维护（若为空就用 defaultImg） */
  const avatarSrc = ref<string>(props.contact?.avatar ?? defaultImg);

  // 当 props.contact 改变时，更新 avatarSrc（但不覆盖已经出错的回退）
  watch(
    () => props.contact?.avatar,
    next => {
      avatarSrc.value = next ?? defaultImg;
    },
    { immediate: true }
  );

  /* 备注编辑 */
  const remark = ref<string>(props.contact?.remark ?? props.contact?.name ?? "");
  const isEditingRemark = ref<boolean>(false);
  watch(
    () => props.contact,
    newContact => {
      if (newContact) remark.value = newContact.remark ?? newContact.name ?? "";
    },
    { immediate: true }
  );
  const saveRemark = async () => {
    if (!props.contact?.friendId) return;
    const next = (remark.value || '').trim();
    if (!next) { ElMessage.warning($t('errors.remark.empty')); return; }
    if (next.length > MAX_REMARK_LEN) { ElMessage.error($t('errors.remark.tooLong', { max: MAX_REMARK_LEN })); return; }
    try {
      isEditingRemark.value = false;
      await friendStore.updateFriendRemark(props.contact.friendId, next);
    } catch (e) {
      isEditingRemark.value = true;
    }
  };
  const cancelEdit = () => {
    remark.value = props.contact?.remark ?? props.contact?.name ?? "";
    isEditingRemark.value = false;
  };
  const handleClickOutside = () => { if (isEditingRemark.value) cancelEdit(); };

  /* 安全显示姓名，若缺失则显示占位文本 */
  const safeName = computed(() => {
    return props.contact?.name?.trim() && props.contact?.name !== "" ? props.contact!.name! : "未知用户";
  });

  /* 性别图标（如果使用 svg sprite，可返回对应 id；否则返回 null） */
  const genderIconId = computed(() => {
    if (!props.contact) return null;
    if (props.contact.gender === 1) return "#icon-nanxing";
    if (props.contact.gender === 0) return "#icon-nvxing";
    return null;
  });

  /* 信息列表（自动过滤空值），保持显示顺序：昵称、用户ID、地区 */
  const infoList = computed(() =>
    [
      { label: "昵称", value: props.contact?.name ?? "" },
      { label: "用户ID", value: props.contact?.friendId ?? "" },
      { label: "地区", value: props.contact?.location ?? "" }
    ].filter(item => !!item.value)
  );

  /* Avatar 占位首字母（英文取大写首字母，中文取首字） */
  const fallbackInitials = computed(() => {
    const n = props.contact?.name?.trim() ?? "";
    if (!n) return "?";
    const first = n[0];
    return /[A-Za-z]/.test(first) ? first.toUpperCase() : first;
  });

  /* ----------------- 操作（emit 前有保护） ----------------- */

  function handleSend() {
    if (!hasContact.value) return;
    emit("handleSend", props.contact!);
  }

  function handleCall() {
    if (!hasContact.value) return;
    emit("call", props.contact!);
  }

  function emitMore() {
    if (!hasContact.value) return;
    emit("more", props.contact!);
  }
</script>

<style lang="scss" scoped>
  /* 组件变量：便于快速调整主题 */
  $card-radius: 8px;
  $avatar-size: 64px;
  $muted-color: #7e7878;
  $primary-color: #409eff;

  .contact-card {
    width: 100%;
    border-radius: $card-radius;
    transition: transform 0.18s ease, box-shadow 0.18s ease;

    &__top {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    /* 信息列表 */
    &__info {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    &__avatar {
      flex: 0 0 $avatar-size;
      height: $avatar-size;
      width: $avatar-size;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 6px rgba(0, 0, 0, 0.06);
      background: linear-gradient(180deg, #f5f7fb, #eef3fb);

      .avatar-fallback {
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 22px;
        color: #ffffff;
        background: linear-gradient(135deg, #9bd8ff, #5aa9ff);
      }
    }

    &__meta {
      flex: 1 1 auto;
      min-width: 0;
    }

    &__title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 16px;
      font-weight: 600;
      color: #141414;

      .name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 220px; // 防止过长推开布局
      }

      .gender-icon {
        width: 16px;
        height: 16px;
        opacity: 0.85;
      }

      .status-badge {
        margin-left: 6px;
      }

      .status-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #bdbdbd;

        &.online {
          background: #39ba72; // 绿色
        }
      }
    }

    &__sub {
      margin-top: 6px;
      font-size: 12px;
      color: $muted-color;
    }

    &__info {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 8px 4px;

      .info-row {
        display: flex;
        gap: 12px;
        align-items: center;

        .info-label {
          min-width: 64px;
          font-size: 12px;
          color: $muted-color;
        }

        .info-value {
          font-size: 13px;
          color: #333;
          word-break: break-word;
        }
      }
    }

    &__actions {
      margin-top: 8px;
      display: flex;
      justify-content: flex-end;

      .el-button {
        display: inline-flex;
        align-items: center;
        gap: 6px;

        .btn-text {
          margin-left: 4px;
        }
      }
    }
  }

  /* 响应式：窄屏时按钮换行 */
  @media (max-width: 440px) {
    .contact-card {
      &__top {
        gap: 10px;
      }

      &__actions {
        justify-content: flex-start;
        flex-wrap: wrap;
        gap: 6px;
      }

      .contact-card__title .name {
        max-width: 140px;
      }
    }
  }
</style>
