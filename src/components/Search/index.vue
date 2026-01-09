<template>
  <div class="search-container no-select">
    <div class="search-bar">
      <div class="search-input-wrapper">
        <el-input ref="headerInputRef" v-model="searchStr" :placeholder="$t('search.placeholder')"
          class="custom-search-input" clearable @clear="handleClear" @click="toggleSearchPopover" @input="handleInput"
          @keydown.enter.prevent="handleEnter">
          <template #prefix>
            <el-icon class="search-icon">
              <Search />
            </el-icon>
          </template>
        </el-input>
      </div>
      <div class="action-btn-wrapper">
        <el-button class="add-btn" @click="openInvite">
          <el-icon>
            <Plus />
          </el-icon>
        </el-button>
      </div>
    </div>

    <el-popover ref="popoverRef" :teleported="true" :virtual-ref="headerInputRef" placement="bottom-start"
      popper-class="modern-search-popover" trigger="focus" virtual-triggering :width="340" @hide="handleClear">
      <div class="search-results-panel" role="dialog">
        <!-- 分类页签 -->
        <div class="search-tabs">
          <div v-for="tab in tabs" :key="tab.value" :class="['tab-item', { active: activeTab === tab.value }]"
            @click="activeTab = tab.value">
            {{ tab.label }}
          </div>
        </div>

        <!-- 结果列表 -->
        <div ref="resultsScrollRef" class="results-viewport" tabindex="0">
          <!-- 搜索更多好友入口 -->
          <div v-if="activeTab === 'all' || activeTab === 'friends'" class="search-more-entry"
            @click="openFriendSearchDialog">
            <div class="entry-icon">
              <el-icon>
                <Search />
              </el-icon>
            </div>
            <div class="entry-text">
              <div class="title">{{ t("search.moreFriends.title") }}</div>
              <div class="subtitle">{{ t("search.moreFriends.subtitle") }}</div>
            </div>
          </div>

          <!-- 联系人结果 -->
          <div v-if="(activeTab === 'all' || activeTab === 'friends') && friends.length" class="result-section">
            <div class="section-title">{{ t("search.section.contacts") }}</div>
            <div v-for="(f, idx) in friends" :key="`friend-${f.userId}`"
              :class="['result-item', { focused: isFocused(flatIndex('friend', idx)) }]"
              @click="selectResult('friend', f)" @mousemove="setHover(flatIndex('friend', idx))">
              <Avatar :avatar="f.avatar || ''" :name="f.remark ?? f.name" :width="40" :borderRadius="6" />
              <div class="item-info">
                <div class="item-row">
                  <span class="name" v-html="highlight(f.remark || f.name)"></span>
                  <span v-if="f.location" class="tag" v-html="highlight(f.location)"></span>
                </div>
                <div class="item-sub">{{ f.selfSignature || "" }}</div>
              </div>
            </div>
          </div>

          <!-- 消息结果 -->
          <div v-if="(activeTab === 'all' || activeTab === 'messages') && messages.length" class="result-section">
            <div class="section-title">{{ t("search.section.messages") }}</div>
            <div v-for="(m, idx) in messages" :key="`msg-${m.chatId}`"
              :class="['result-item', { focused: isFocused(flatIndex('message', idx)) }]"
              @click="selectResult('message', m)" @mousemove="setHover(flatIndex('message', idx))">
              <Avatar :avatar="m.avatar || ''" :name="m.name" :width="40" :borderRadius="6"
                :backgroundColor="m.chatType === IMessageType.GROUP_MESSAGE.code ? '#ffb36b' : undefined" />
              <div class="item-info">
                <div class="item-row">
                  <span class="name">{{ m.name || "未知" }}</span>
                  <span class="time">{{ useFriendlyTime(m.messageTime as number) }}</span>
                </div>
                <div class="item-sub">
                  <span class="preview" v-html="highlight(m.message)"></span>
                  <span class="count">{{ t("search.count", { count: m.count }) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 空状态 -->
          <!-- <div v-show="!hasAnyResult" class="empty-state">
            <el-empty :image-size="60" :description="t('search.noResult')" />
          </div> -->
        </div>
      </div>
    </el-popover>

    <!-- 弹窗部分 -->
    <el-dialog v-model="inviteDialogVisible" :title="$t('search.invite.title')" width="550px" destroy-on-close
      class="modern-dialog">
      <SelectContact @handleAddGroupMember="handleAddGroupMember" @handleClose="inviteDialogVisible = false" />
    </el-dialog>

    <el-dialog v-model="friendSearchDialogVisible" :title="$t('search.friendSearch.title')" width="400px"
      destroy-on-close class="modern-dialog">
      <div class="friend-search-body">
        <el-input v-model="searchFriendStr" :placeholder="$t('search.friendSearch.title')" clearable
          class="search-input-large" @keydown.enter.prevent="handleFriendSearch">
          <template #append>
            <el-button type="primary" @click="handleFriendSearch">{{ t("search.friendSearch.searchBtn") }}</el-button>
          </template>
        </el-input>

        <div class="search-results-list">
          <div v-for="friend in searchedFriends" :key="friend.userId" class="friend-item">
            <Avatar :avatar="friend.avatar || ''" :name="friend.name" :width="44" :borderRadius="8" />
            <div class="info">
              <div class="name">{{ friend.name }}</div>
              <div class="id">ID: {{ friend.friendId }}</div>
            </div>
            <div class="action">
              <el-button v-if="friend.flag == 1" link disabled>{{ t("search.addFriend.addedLabel") }}</el-button>
              <el-button v-else type="primary" size="small" @click="handleAddFriend(friend)">{{
                t("search.addFriend.addButton") }}</el-button>
            </div>
          </div>
          <div v-if="!searchedFriends.length && searchFriendStr" class="no-data">{{ t("search.friendSearch.noResult") }}
          </div>
        </div>
      </div>
    </el-dialog>

    <el-dialog v-model="addFriendDialogVisible" :title="$t('search.addFriend.title')" width="380px"
      class="modern-dialog">
      <el-form label-position="top">
        <el-form-item :label="$t('search.addFriend.verifyLabel')">
          <el-input v-model="verifyMsg" type="textarea" :rows="3" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item :label="$t('search.addFriend.remarkLabel')">
          <el-input v-model="remark" maxlength="20" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addFriendDialogVisible = false">{{ t("common.cancel") }}</el-button>
        <el-button type="primary" @click="confirmAddFriend">{{ t("common.confirm") }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, ref, unref, watch } from "vue";
import { useI18n } from "vue-i18n";
import SelectContact from "../SelectContact/index.vue";
import { useSearchStore } from "@/store/modules/search";
import { useFriendsStore } from "@/store/modules/friends";
import Avatar from "@/components/Avatar/index.vue";
import { IMessageType } from "@/constants";
import { ElMessage } from "element-plus";
import { escapeHtml } from "@/utils/Strings";
import { useTimeFormat } from "@/hooks/useTimeFormat";
import { useUserStore } from "@/store/modules/user";
import { useChatStore } from "@/store/modules/chat";

/* -------------------- 类型定义 -------------------- */
interface Chat {
  chatId: string;
  chatType: number;
  name: string;
  avatar?: string;
  message?: string;
  messageTime?: number;
  count?: number;
}

interface Friend {
  userId: string;
  friendId: string;
  name: string;
  remark?: string;
  avatar?: string;
  location?: string;
  flag?: number;
  selfSignature?: string;
}

/* -------------------- 依赖与状态 -------------------- */
const { t } = useI18n();
const userStore = useUserStore();
const messageStore = useChatStore();
const searchStore = useSearchStore();
const friendStore = useFriendsStore();
const { useFriendlyTime } = useTimeFormat();

const searchStr = ref("");
const activeTab = ref<"all" | "friends" | "messages">("all");
const tabs = computed(() => [
  { label: t("search.tabs.all"), value: "all" as const },
  { label: t("search.tabs.friends"), value: "friends" as const },
  { label: t("search.tabs.messages"), value: "messages" as const }
]);

const inviteDialogVisible = ref(false);
const friendSearchDialogVisible = ref(false);
const addFriendDialogVisible = ref(false);

const searchFriendStr = ref("");
const searchedFriends = ref<Friend[]>([]);
const currentAddingFriend = ref<Friend | null>(null);
const verifyMsg = ref("");
const remark = ref("");

const friends = ref<Friend[]>([]);
const messages = ref<Chat[]>([]);

const popoverRef = ref<any>(null);
const headerInputRef = ref<any>(null);
const resultsScrollRef = ref<HTMLElement | null>(null);
const focusedIndex = ref<number>(-1);

const DEBOUNCE_MS = 300;

/* -------------------- 计算属性 -------------------- */
const flatList = computed(() => {
  const arr: { type: string; index: number; item: any }[] = [];
  if (activeTab.value === "all" || activeTab.value === "friends") {
    friends.value.forEach((it, i) => arr.push({ type: "friend", index: i, item: it }));
  }
  if (activeTab.value === "all" || activeTab.value === "messages") {
    messages.value.forEach((it, i) => arr.push({ type: "message", index: i, item: it }));
  }
  return arr;
});

const hasAnyResult = computed(() => friends.value.length + messages.value.length > 0);

/* -------------------- 搜索逻辑 -------------------- */
async function performSearch(query: string) {
  const trimmed = (query ?? "").trim();
  if (!trimmed) {
    friends.value = [];
    messages.value = [];
    focusedIndex.value = -1;
    return;
  }

  try {
    const [friendRes, messageRes] = await Promise.all([
      searchStore.searchFriends(trimmed),
      searchStore.searchMessages(trimmed)
    ]);

    friends.value = (friendRes as any) ?? [];
    messages.value = (messageRes as any) ?? [];
    focusedIndex.value = flatList.value.length > 0 ? 0 : -1;

    await nextTick();
    scrollFocusedIntoView();
  } catch (err) {
    console.error("Search error:", err);
  }
}

const debouncedPerformSearch = useDebounceWithCancel(() => performSearch(searchStr.value), DEBOUNCE_MS);

function handleInput() {
  focusedIndex.value = -1;
  debouncedPerformSearch();
}

async function handleEnter() {
  debouncedPerformSearch.cancel?.();
  await performSearch(searchStr.value);
  if (focusedIndex.value >= 0) {
    const sel = flatList.value[focusedIndex.value];
    if (sel) selectResult(sel.type, sel.item);
  }
}

function handleClear() {
  debouncedPerformSearch.cancel?.();
  searchStr.value = "";
  friends.value = [];
  messages.value = [];
  focusedIndex.value = -1;
}

function toggleSearchPopover() {
  const pop = unref(popoverRef);
  if (pop?.popperRef?.isShow) pop.hide?.();
  else pop?.show?.();
}

function selectResult(type: string, item: any) {
  const pop = unref(popoverRef);
  if (pop?.popperRef?.isShow) pop.hide?.();

  if (type === 'message' || type === 'friend') {
    const chatId = item.chatId || item.userId;
    if (chatId) {
      // TODO: 实现跳转到会话逻辑
      // messageStore.handleSelectChat(chatId);
    }
  }
}

/* -------------------- 好友搜索与添加 -------------------- */
function openFriendSearchDialog() {
  searchFriendStr.value = searchStr.value;
  unref(popoverRef).hide?.();
  friendSearchDialogVisible.value = true;
}

async function handleFriendSearch() {
  const query = searchFriendStr.value.trim();
  if (!query) return;
  try {
    const res = await friendStore.handleSearchFriendInfo?.(query);
    searchedFriends.value = (res as any) || [];
  } catch (err) {
    ElMessage.error(t("search.friendSearch.noResult"));
  }
}

function handleAddFriend(friend: Friend) {
  currentAddingFriend.value = friend;
  verifyMsg.value = `我是 ${userStore.name}`;
  remark.value = friend.name;
  addFriendDialogVisible.value = true;
}

async function confirmAddFriend() {
  if (!currentAddingFriend.value) return;
  try {
    await friendStore.handleAddContact(currentAddingFriend.value, verifyMsg.value.trim(), remark.value.trim());
    ElMessage.success(t("search.message.sentRequest", { name: currentAddingFriend.value.name }));
    addFriendDialogVisible.value = false;
  } catch (err) {
    console.error("Add friend error:", err);
  }
}

function openInvite() {
  inviteDialogVisible.value = true;
}

function handleAddGroupMember(arr: any[]) {
  if (arr?.length) {
    messageStore.handleAddGroupMember(arr, false);
    inviteDialogVisible.value = false;
  }
}

/* -------------------- 工具函数 -------------------- */
function useDebounceWithCancel<T extends (...args: any[]) => any>(fn: T, wait = 300) {
  let tid: number | undefined;
  const wrapped = (...args: Parameters<T>) => {
    if (tid) clearTimeout(tid);
    tid = window.setTimeout(() => fn(...args), wait);
  };
  (wrapped as any).cancel = () => {
    if (tid) {
      clearTimeout(tid);
      tid = undefined;
    }
  };
  return wrapped as T & { cancel: () => void };
}

function highlight(text?: string) {
  if (!searchStr.value) return escapeHtml(text ?? "");
  const q = escapeHtml(searchStr.value.trim());
  if (!q) return escapeHtml(text ?? "");
  try {
    const re = new RegExp(`(${q})`, "ig");
    return escapeHtml(text ?? "").replace(re, "<mark class=\"highlight-text\">$1</mark>");
  } catch {
    return escapeHtml(text ?? "");
  }
}

function scrollFocusedIntoView() {
  nextTick(() => {
    const container = resultsScrollRef.value;
    if (!container || focusedIndex.value < 0) return;
    const items = container.querySelectorAll(".result-item");
    const el = items[focusedIndex.value] as HTMLElement;
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });
}

function flatIndex(type: string, localIndex: number) {
  let idx = 0;
  if (activeTab.value === "all") {
    if (type === "friend") return localIndex;
    idx += friends.value.length;
    return idx + localIndex;
  }
  return localIndex;
}

function setHover(globalIndex: number) {
  focusedIndex.value = globalIndex;
}

function isFocused(globalIndex: number) {
  return globalIndex >= 0 && focusedIndex.value === globalIndex;
}

watch(searchStr, v => {
  if (!v?.trim()) handleClear();
});
</script>

<style lang="scss" scoped>
.search-container {
  padding: 12px 8px;
  background-color: #fff;

  .search-bar {
    display: flex;
    align-items: center;
    gap: 5px;

    .search-input-wrapper {
      flex: 1;

      .custom-search-input {
        :deep(.el-input__wrapper) {
          background-color: #f2f3f5;
          box-shadow: none;
          border-radius: 6px;
          padding: 0 5px;
          transition: all 0.2s;

          &.is-focus {
            background-color: #fff;
            box-shadow: 0 0 0 1px #409eff inset;
          }
        }

        .search-icon {
          color: #8a919f;
          font-size: 16px;
        }
      }
    }

    .add-btn {
      width: 32px;
      height: 32px;
      padding: 0;
      border-radius: 6px;
      background-color: #f2f3f5;
      border: none;
      color: #4e5969;

      &:hover {
        background-color: #e5e6eb;
        color: #1d2129;
      }

      .el-icon {
        font-size: 18px;
      }
    }
  }
}

.search-results-panel {
  display: flex;
  flex-direction: column;
  max-height: 500px;
  background-color: #fff;

  .search-tabs {
    display: flex;
    padding: 8px 12px;
    gap: 8px;
    border-bottom: 1px solid #f2f3f5;

    .tab-item {
      padding: 4px 12px;
      font-size: 13px;
      color: #8a919f;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;

      &:hover {
        background-color: #f2f3f5;
        color: #4e5969;
      }

      &.active {
        background-color: #e8f3ff;
        color: #1e80ff;
        font-weight: 500;
      }
    }
  }

  .results-viewport {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;

    &::-webkit-scrollbar {
      width: 4px;
    }

    &::-webkit-scrollbar-thumb {
      background: #e5e6eb;
      border-radius: 4px;
    }

    .search-more-entry {
      display: flex;
      align-items: center;
      padding: 10px 16px;
      gap: 12px;
      cursor: pointer;
      border-radius: 6px;
      transition: background 0.2s;
      background-color: #f2f3f5;

      &:hover {
        background-color: #e3e6eb;
      }

      .entry-icon {
        width: 40px;
        height: 40px;
        background-color: #e8f3ff;
        color: #1e80ff;
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
      }

      .entry-text {
        .title {
          font-size: 14px;
          color: #1d2129;
        }

        .subtitle {
          font-size: 12px;
          color: #86909c;
        }
      }
    }

    .result-section {
      .section-title {
        padding: 8px 16px 4px;
        font-size: 12px;
        color: #86909c;
      }

      .result-item {
        display: flex;
        padding: 10px 16px;
        gap: 12px;
        cursor: pointer;
        transition: background 0.2s;

        &:hover,
        &.focused {
          background-color: #f7f8fa;
        }

        .item-info {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;

          .item-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 2px;

            .name {
              font-size: 14px;
              color: #1d2129;
              font-weight: 500;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }

            .time,
            .tag {
              font-size: 12px;
              color: #86909c;
              flex-shrink: 0;
            }
          }

          .item-sub {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            color: #86909c;

            .preview {
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }

            .count {
              flex-shrink: 0;
              color: #1e80ff;
            }
          }
        }
      }
    }
  }
}

.friend-search-body {
  padding: 20px;

  .search-input-large {
    margin-bottom: 16px;
  }

  .search-results-list {
    max-height: 300px;
    overflow-y: auto;

    .friend-item {
      display: flex;
      align-items: center;
      padding: 12px 0;
      gap: 12px;
      border-bottom: 1px solid #f2f3f5;

      &:last-child {
        border-bottom: none;
      }

      .info {
        flex: 1;

        .name {
          font-size: 14px;
          color: #1d2129;
          font-weight: 500;
        }

        .id {
          font-size: 12px;
          color: #86909c;
        }
      }
    }

    .no-data {
      padding: 30px 0;
      text-align: center;
      color: #86909c;
      font-size: 14px;
    }
  }
}

:deep(.modern-search-popover) {
  padding: 0 !important;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  border: none;
}

:deep(.modern-dialog) {
  border-radius: 6px;

  .el-dialog__header {
    padding: 20px 24px 12px;
    margin-right: 0;
    border-bottom: 1px solid #f2f3f5;
  }

  // .el-dialog__body {
  //   padding: 24px;
  // }

  .el-dialog__footer {
    padding: 12px 24px 20px;
    border-top: 1px solid #f2f3f5;
  }
}

:deep(.highlight-text) {
  background-color: transparent;
  color: #1e80ff;
  font-weight: bold;
}
</style>
