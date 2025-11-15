<template>
  <div class="contact-page-shell" role="region">
    <el-card v-show="hasGroup" :body-style="{ padding: '18px' }" aria-live="polite" class="contact-card group-card"
      shadow="hover">
      <!-- 顶部：头像 + 基本信息 -->
      <el-row align="middle" class="card-top">
        <el-col :span="6" class="avatar-col no-select">
          <span>
            <Avatar :avatar="avatarSrc || ' '" :name="displayName" :width="84" :borderRadius="6" backgroundColor="#ffb36b" />
          </span>
        </el-col>

        <el-col :span="18" class="meta-col">
          <div class="meta-row">
            <div class="name-and-meta">
              <div class="name">{{ displayName }}</div>

              <div class="meta-tags">
                <span class="tag">{{ groupTypeText }}</span>
              </div>
            </div>
          </div>
        </el-col>
      </el-row>

      <el-divider class="card-divider" />

      <!-- 简要统计 / 说明 -->
      <div class="info-section">
        <div class="info-row">
          <strong class="no-select">{{ $t("group.memberLabel") }}</strong>
          <span>{{ groupInfo.memberCount ?? $t("group.unknown") }}</span>
        </div>

        <div v-if="groupInfo.description" class="info-row signature">
          <strong class="no-select">{{ $t("group.descriptionLabel") }} </strong>
          <span>{{ groupInfo.description }}</span>
        </div>

        <!-- 群公告（从 chats 读取） -->
        <div class="info-row" v-if="groupNoticeText">
          <strong class="no-select">{{ $t('chat.groupChat.groupNotice') }}</strong>
          <span>{{ groupNoticeText }}</span>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="actions-row">
        <el-space>
          <el-button size="default" type="primary" @click="handleEnterGroup(groupInfo)">
            <!-- <i class="iconfont icon-huihua" aria-hidden="true"></i> -->
            <span>{{ $t("group.enterGroup") }} </span>
          </el-button>

          <!-- <el-button type="default" size="default" @click="viewMembers">
            <i class="iconfont icon-members" aria-hidden="true"></i>
            <span>查看成员</span>
          </el-button> -->

          <!-- <el-button type="danger" size="default" @click="confirmLeave">
            <i class="iconfont icon-exit" aria-hidden="true"></i>
            <span>退出群</span>
          </el-button> -->
        </el-space>
      </div>
    </el-card>

    <div v-show="!hasGroup" class="empty-note">{{ $t("group.noSelectionOrEmpty") }}</div>
  </div>
</template>

<script lang="ts" setup>
import { IMessageType } from "@/constants";
import { useFriendsStore } from "@/store/modules/friends";
import { useChatStore } from "@/store/modules/chat";
import { useI18n } from "vue-i18n";
import Avatar from "@/components/Avatar/index.vue";

type Group = {
  groupId: string;
  ownerId?: string;
  groupType?: number; // 例如 1: 普通群, 2: 私密群 等
  groupName?: string;
  applyJoinType?: number; // 1: 直接加入, 2: 需要验证 等
  avatar?: string;
  memberCount?: number;
  description?: string;
};

const chatStore = useChatStore();
const friendStore = useFriendsStore();

// props: group 可直接从父组件传入
// 如果没有传 group，可以在这里放一个 demo（方便单独预览）
// 真实项目请直接传入 props.group
// const demo = ref<Group | null>(null);
// // demo.value = {
// //   groupId: 'e785da85-2456-4315-ba63-c3c623697efc',
// //   ownerId: '100001',
// //   groupType: 1,
// //   groupName: '示例群聊',
// //   applyJoinType: 1,
// //   avatar: '',
// //   memberCount: 12,
// //   description: '这是一个示例群'
// // };
const { t } = useI18n();
const router = useRouter();

// 计算属性：从 store 中读取 Info，确保返回对象类型（避免 null 导致模板报错）
const groupInfo = computed<Group>(() => {
  return friendStore.shipInfo ?? {};
});

// 关联到 chats 的该群会话行（把群名/公告来源切到 chats）
const relatedChat = computed(() => {
  const gid = (groupInfo.value as any)?.groupId;
  if (!gid) return null;
  return chatStore.chatList.find(c => String(c.chatId) === String(gid)) || null;
});

// 展示名：优先用 chats.name，其次回退 groupInfo.groupName
const displayName = computed(() => {
  return relatedChat.value?.name ?? groupInfo.value.groupName ?? '';
});

// 是否存在有效群数据
const hasGroup = computed(() => {
  const g = groupInfo.value;
  return g && Object.keys(g).length > 0 && Boolean(g.groupId);
});

/* Avatar 回退逻辑：优先使用 groupInfo.avatar；若为空或加载出错显示首字母 */
const avatarSrc = ref<string | undefined>(relatedChat.value?.avatar ?? groupInfo.value.avatar);
watch(
  () => [relatedChat.value?.avatar, groupInfo.value.avatar],
  () => {
    avatarSrc.value = relatedChat.value?.avatar ?? groupInfo.value.avatar;
  }
);
// watch(
//   () => groupInfo.value.avatar,
//   v => {
//     avatarSrc.value = v;
//   }
// );

/* 首字母（群名） */
const initials = computed(() => {
  const n = (displayName.value ?? "").trim();
  if (!n) return "#";
  const first = n[0];
  return /[A-Za-z0-9]/.test(first) ? first.toUpperCase() : first;
});

/* 人性化文本显示 */
const groupTypeText = computed(() => {
  switch (groupInfo.value.groupType) {
    case 1:
      return t("group.type.normal");
    case 2:
      return t("group.type.private");
    default:
      return t("group.type.default");
  }
});

// 群公告文本（来自 chats.notification）
const groupNoticeText = computed(() => {
  const txt = (relatedChat.value as any)?.notification ?? '';
  return (txt || '').trim();
});

// const applyJoinText = computed(() => {
//   switch (groupInfo.value.applyJoinType) {
//     case 1:
//       return "直接加入";
//     case 2:
//       return "需要验证";
//     default:
//       return "入群方式未知";
//   }
// });

/* 操作：进入群聊 / 查看成员 / 退出群 */
async function handleEnterGroup(fi: any) {
  if (!fi) return;
  await chatStore.handleChangeCurrentChatByTarget(fi, IMessageType.GROUP_MESSAGE.code);

  // 请求消息数量与列表
  chatStore.handleResetMessage();
  await chatStore.handleGetMessageCount();
  await chatStore.handleGetMessageList(chatStore.currentChat);
  //await messageStore.handleSearchMessageUrl(chatStore.currentChat);

  // 跳转到消息页面
  router.push("/message");

  // if (!groupInfo.value.groupId) return;
  // router.push({ name: "GroupChat", params: { id: groupInfo.value.groupId } });
}

// function viewMembers() {
//   if (!groupInfo.value.groupId) return;
//   router.push({ name: "GroupMembers", params: { id: groupInfo.value.groupId } });
// }

// async function confirmLeave() {
//   if (!groupInfo.value.groupId) return;
//   try {
//     await ElMessageBox.confirm("确认要退出该群吗？退出后需要重新申请加入（如果群仍然开放）。", "退出群聊", {
//       confirmButtonText: "确认退出",
//       cancelButtonText: "取消",
//       type: "warning"
//     });
//     // TODO: 真实逻辑：调用 API / store action 退出群
//     // await groupStore.leaveGroup(groupInfo.value.groupId)
//     ElMessage.success("已退出群聊（示例）");
//     // 可选择跳转回消息列表
//     router.push({ path: "/message" });
//   } catch (err) {
//     // 取消或错误
//     // console.log('leave cancelled', err);
//   }
// }
</script>

<style lang="scss" scoped>
.contact-page-shell {
  min-height: calc(100vh - 80px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
  margin-top: -50px;
  box-sizing: border-box;
}

.contact-card {
  width: 600px;
  max-width: calc(100% - 32px);
  border-radius: 5px;
  transition: transform 0.18s ease, box-shadow 0.18s ease;

  .card-top {
    margin-bottom: 8px;
  }

  .el-avatar {
    border-radius: 5px !important;
    width: 84px !important;
    height: 84px !important;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  }

  .el-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .meta-col {
    padding-left: 12px;
  }

  .name-and-meta {
    display: flex;
    flex-direction: column;
    gap: 6px;
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

  .meta-tags {
    display: flex;
    gap: 8px;
    margin-top: 2px;
  }

  .tag {
    font-size: 12px;
    color: #556;
    background: #f3f6f9;
    padding: 2px 8px;
    border-radius: 999px;
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

/* avatar fallback 样式 */
.avatar-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #ffd59e, #ffb36b);
}

/* 窄屏适配 */
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

/* 当无群时提示文本 */
.empty-note {
  color: #8b8b8b;
  font-size: 14px;
  text-align: center;
  padding: 18px;
}
</style>
