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
          <el-icon class="edit-icon"><Edit /></el-icon>
        </div>
        <div v-else class="info-value" v-click-outside="saveRemark">
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
    remark?: string | null;
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
    const next = (remark.value || "").trim();
    console.log("next", next);
    if (!next) {
      ElMessage.warning($t("errors.remark.empty"));
      return;
    }
    if (next.length > MAX_REMARK_LEN) {
      ElMessage.error($t("errors.remark.tooLong", { max: MAX_REMARK_LEN }));
      return;
    }
    try {
      isEditingRemark.value = false;
      await friendStore.updateFriendRemark(props.contact.friendId, next);
    } catch (e) {
      isEditingRemark.value = true;
    }
  };
  // const cancelEdit = () => {
  //   remark.value = props.contact?.remark ?? props.contact?.name ?? "";
  //   isEditingRemark.value = false;
  // };
  //失焦取消编辑
  // const handleClickOutside = () => {
  //   if (isEditingRemark.value) {
  //     cancelEdit();
  //   }
  // };

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
  /* 变量：建议使用 Element Plus 的变量，或者根据你的深色主题调整 */
  $avatar-size: 64px;
  $text-main: #ffffff;      /* 主文字改为白色 */
  $text-sub: #a6a6a6;       /* 次要文字改为浅灰 */
  $bg-hover: rgba(255, 255, 255, 0.05); /* 鼠标悬停背景 */

  .contact-card-wrap {
    box-sizing: border-box;
    width: 100%;
    /* 如果卡片本身需要背景色，可以在这里加，不需要则透明 */
    /* background-color: #1e1e1e; */ 
  }

  .contact-card {
    width: 100%;
    transition: all 0.2s ease;

    &__top {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    /* === 修复重点：头像容器 === */
    &__avatar {
      /* 固定尺寸 */
      flex: 0 0 $avatar-size;
      width: $avatar-size;
      height: $avatar-size;
      
      /* 关键修改：移除背景色和阴影，消除“白边” */
      background: transparent; 
      box-shadow: none; 
      
      /* 保持居中 */
      display: flex;
      align-items: center;
      justify-content: center;
      
      /* 如果 Avatar 组件自带圆角，这里可以去掉，或者保持一致 */
      border-radius: 6px; 
      overflow: hidden;

      /* 强制内部图片/组件填满 */
      :deep(.el-avatar), :deep(img), :deep(.avatar-container) {
        display: block;
        width: 100% !important;
        height: 100% !important;
        border-radius: 6px; /* 确保内部也有圆角 */
      }
    }

    &__meta {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: center; /* 垂直居中文字块 */
    }

    &__title {
      display: flex;
      align-items: center;
      gap: 8px;
      line-height: 1.4;

      .name {
        font-size: 16px;
        font-weight: 600;
        color: $text-main; /* 修复：白色文字 */
        
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 200px;
      }

      .gender-icon {
        width: 16px;
        height: 16px;
        fill: $text-sub; /* 修复：图标颜色 */
        display: block;
      }
    }

    &__sub {
      margin-top: 4px;
      font-size: 12px;
      color: $text-sub; /* 修复：浅灰文字 */
    }

    /* === 信息列表部分 === */
    &__info {
      display: flex;
      flex-direction: column;
      gap: 10px; /*稍微拉大间距*/
      padding: 8px 0;

      .info-row {
        display: flex;
        gap: 12px;
        align-items: center;
        line-height: 1.5;

        .info-label {
          width: 60px; /* 固定宽度，对齐更整齐 */
          flex-shrink: 0;
          font-size: 13px;
          color: $text-sub; /* 修复：标签颜色 */
        }

        .info-value {
          font-size: 13px;
          color: $text-main; /* 修复：内容颜色 */
          flex: 1;
          word-break: break-all;
          display: flex;
          align-items: center;

          .edit-icon {
            margin-left: 6px;
            color: $text-sub;
            cursor: pointer;
            font-size: 14px;
            
            &:hover {
              color: #409eff;
            }
          }
        }
      }
    }

    &__actions {
      margin-top: 12px;
      display: flex;
      justify-content: flex-end;
    }
    
    /* === 空状态修复 === */
    &__empty {
      display: flex;
      align-items: center;
      gap: 12px;
      .empty-text {
         .empty-title { color: $text-main; font-size: 14px; }
         .empty-sub { color: $text-sub; font-size: 12px; }
      }
    }
  }

  /* 输入框深色适配 (如果是 Element Plus) */
  :deep(.el-input__wrapper) {
    background-color: transparent;
    box-shadow: 0 0 0 1px #4c4d4f; /* 深色边框 */
  }
  :deep(.el-input__inner) {
    color: white;
  }
</style>


