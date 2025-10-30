<template>
  <div class="search-container no-select">
    <el-row style="height: 60px">
      <el-col :span="20">
        <div class="search-container__input">
          <el-input
            ref="headerInputRef"
            v-model="searchStr"
            :placeholder="$t('search.placeholder')"
            class="header-input"
            clearable
            @clear="handleClear"
            @click="toggleSearchPopover"
            @input="handleInput"
            @keydown.enter.prevent="handleEnter"
          >
            <template #prefix>
              <i slot="suffix" class="iconfont icon-sousuo"></i>
            </template>
          </el-input>
        </div>
      </el-col>

      <el-col :span="4">
        <div class="search-container__btn">
          <el-button style="width: 30px" @click="openInvite">
            <i class="iconfont icon-jia" style="font-size: 18px"></i>
          </el-button>
        </div>
      </el-col>
    </el-row>

    <el-popover
      ref="popoverRef"
      :teleported="true"
      :virtual-ref="headerInputRef"
      placement="bottom-start"
      popper-class="search-popover"
      trigger="focus"
      virtual-triggering
      width="360"
      @hide="handleClear"
    >
      <!-- Popover 内容：完整搜索结果面板 -->
      <div :aria-label="$t('search.resultsLabel')" class="search-popover__content" role="dialog">
        <!-- tabs -->
        <div class="search-popover__tabs">
          <button
            :class="['search-popover__tab', activeTab === 'all' ? 'search-popover__tab--active' : '']"
            @click="activeTab = 'all'"
          >
            {{ t("search.tabs.all") }}
          </button>
          <button
            :class="['search-popover__tab', activeTab === 'friends' ? 'search-popover__tab--active' : '']"
            @click="activeTab = 'friends'"
          >
            {{ t("search.tabs.friends") }}
          </button>
          <button
            :class="['search-popover__tab', activeTab === 'messages' ? 'search-popover__tab--active' : '']"
            @click="activeTab = 'messages'"
          >
            {{ t("search.tabs.messages") }}
          </button>
        </div>

        <!-- 结果区域：固定高度，内部滚动 -->
        <div ref="resultsScrollRef" class="search-popover__results-scroll" tabindex="0">
          <!-- 好友搜索特殊项（放在联系人后，仅在 all 或 friends tab 显示） -->

          <section v-if="activeTab === 'all' || activeTab === 'friends'" class="search-popover__section new-friend">
            <ul class="search-popover__list">
              <li
                class="search-popover__list-item search-popover__list-item--search-more"
                @click="openFriendSearchDialog"
              >
                <i class="iconfont icon-sousuo search-popover__search-icon" style="font-size: 20px"></i>
                <div class="search-popover__meta">
                  <div class="search-popover__row">
                    <div class="search-popover__name">{{ t("search.moreFriends.title") }}</div>
                  </div>
                  <div class="search-popover__row search-popover__row--sub">
                    <div class="search-popover__preview">{{ t("search.moreFriends.subtitle") }}</div>
                  </div>
                </div>
              </li>
            </ul>
          </section>
          <!-- 联系人 -->
          <section
            v-if="(activeTab === 'all' || activeTab === 'friends') && friends.length"
            class="search-popover__section"
          >
            <h4 class="search-popover__section-title">{{ t("search.section.contacts") }}</h4>
            <ul class="search-popover__list">
              <li
                v-for="(f, idx) in friends"
                :key="`friend-${f.userId}-${f.friendId}`"
                :class="{ 'search-popover__list-item--focused': isFocused(flatIndex('friend', idx)) }"
                class="search-popover__list-item"
                @click="selectResult('friend', f)"
                @mousemove="setHover(flatIndex('friend', idx))"
              >
                <img v-if="f.avatar" :src="f.avatar" class="search-popover__avatar" />
                <div v-else class="search-popover__avatar-fallback">{{ initials(f.name || f.alias) }}</div>
                <div class="search-popover__meta">
                  <div class="search-popover__row">
                    <div class="search-popover__name" v-html="highlight(f.alias || f.name)"></div>
                    <div v-if="f.location" class="search-popover__tag" v-html="highlight(f.location ?? '')"></div>
                  </div>
                  <div class="search-popover__row search-popover__row--sub">
                    <div class="search-popover__preview">{{ f.selfSignature || "" }}</div>
                  </div>
                </div>
              </li>
            </ul>
          </section>

          <!-- 消息 -->
          <section
            v-if="(activeTab === 'all' || activeTab === 'messages') && messages.length"
            class="search-popover__section"
          >
            <h4 class="search-popover__section-title">{{ t("search.section.messages") }}</h4>
            <ul class="search-popover__list">
              <li
                v-for="(m, idx) in messages"
                :key="`msg-${m.chatId}`"
                :class="{ 'search-popover__list-item--focused': isFocused(flatIndex('message', idx)) }"
                class="search-popover__list-item"
                @click="selectResult('message', m)"
                @mousemove="setHover(flatIndex('message', idx))"
              >
                <img v-if="m.avatar" :src="m.avatar" class="search-popover__avatar" />
                <div v-else class="search-popover__avatar-fallback">{{ initials(m.name) }}</div>
                <div class="search-popover__meta">
                  <div class="search-popover__row">
                    <div class="search-popover__name">{{ m.name || "未知" }}</div>
                    <div class="search-popover__time">{{ useFriendlyTime(m.messageTime as number) }}</div>
                  </div>
                  <div class="search-popover__row search-popover__row--sub">
                    <div class="search-popover__preview" v-html="highlight(m.message)"></div>
                    <div class="search-popover__count">
                      {{ t("search.count", { count: m.count }) }}
                    </div>
                  </div>
                </div>
              </li>
            </ul>
          </section>

          <!-- 无结果提示 -->
          <div v-show="!hasAnyResult" class="search-popover__no-result">{{ t("search.noResult") }}</div>
        </div>
      </div>
    </el-popover>

    <!-- 邀请对话框（如需） -->
    <el-dialog
      :destroy-on-close="true"
      :model-value="inviteDialogVisible"
      :title="$t('search.invite.title')"
      style="height: 450px"
      width="550"
      @close="inviteDialogVisible = false"
    >
      <SelectContact @handleAddGroupMember="handleAddGroupMember" @handleClose="openInvite" />
    </el-dialog>

    <!-- 好友搜索弹窗 -->
    <el-dialog
      :destroy-on-close="true"
      :model-value="friendSearchDialogVisible"
      :title="$t('search.friendSearch.title')"
      width="300"
      @close="closeFriendSearchDialog"
    >
      <div class="friend-search__container">
        <el-input
          v-model="searchFriendStr"
          :placeholder="$t('search.friendSearch.title')"
          clearable
          @keydown.enter.prevent="handleFriendSearch"
        >
          <template #prefix>
            <i slot="suffix" class="iconfont icon-sousuo"></i>
          </template>
          <template #append>
            <el-button type="primary" @click="handleFriendSearch"> {{ t("search.friendSearch.searchBtn") }}</el-button>
          </template>
        </el-input>

        <!-- 搜索结果列表（示例：显示搜索到的好友） -->
        <ul v-if="searchedFriends.length" class="friend-search__list" role="list">
          <li
            v-for="friend in searchedFriends"
            :key="friend.userId"
            class="friend-search__item"
            role="listitem"
            tabindex="0"
          >
            <!-- 左：头像 -->
            <div aria-hidden="true" class="friend-search__avatar-wrap">
              <img v-if="friend.avatar" :src="friend.avatar" alt="" class="friend-search__avatar" />
              <div v-else class="friend-search__avatar-fallback">{{ initials(friend.name) }}</div>
            </div>

            <!-- 中：name + friendId （竖排）-->
            <div class="friend-search__content">
              <div :title="friend.name" class="friend-search__name">{{ friend.name }}</div>
              <div :title="friend.friendId" class="friend-search__id">{{ friend.friendId }}</div>
            </div>

            <el-button v-if="friend.flag == 1" class="friend-search__add-btn" link size="small">
              {{ t("search.addFriend.addedLabel") }}
            </el-button>

            <el-button
              v-else
              class="friend-search__add-btn"
              size="small"
              type="primary"
              @click.stop="handleAddFriend(friend)"
            >
              {{ t("search.addFriend.addButton") }}
            </el-button>
          </li>
        </ul>

        <div v-else-if="searchFriendStr" class="friend-search__no-result">{{ t("search.friendSearch.noResult") }}</div>
      </div>
    </el-dialog>

    <el-dialog
      :destroy-on-close="true"
      :model-value="addFriendDialogVisible"
      :show-close="false"
      :title="$t('search.addFriend.title')"
      width="350"
      @close="closeAddFriendDialog"
    >
      <div class="add-friend-verify__container">
        <el-form label-width="80px">
          <el-form-item :label="$t('search.addFriend.verifyLabel')" required>
            <el-input
              v-model="verifyMsg"
              :placeholder="$t('search.addFriend.verifyLabel')"
              :rows="3"
              maxlength="200"
              show-word-limit
              type="textarea"
            />
          </el-form-item>
          <el-form-item :label="$t('search.addFriend.remarkLabel')">
            <el-input v-model="remark" :placeholder="$t('search.addFriend.remarkLabel')" maxlength="50" />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="closeAddFriendDialog">{{ t("search.addFriend.addButton") }}</el-button>
          <el-button type="primary" @click="confirmAddFriend">{{ t("search.addFriend.addButton") }}</el-button>
        </span>
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
  import { ElMessage } from "element-plus";
  import { escapeHtml } from "@/utils/Strings";
  import { useTimeFormat } from "@/hooks/useTimeFormat";
  import { useUserStore } from "@/store/modules/user";
  import { useMessageStore } from "@/store/modules/message";

  /* -------------------- 类型定义（简化） -------------------- */
  interface Chat {
    id: string;
    chatId: string;
    chatType: number;
    name: string;
    avatar?: string;
    unread?: number;
    message?: string;
    messageTime?: number;
    count?: number;
  }

  interface Friend {
    userId: string;
    friendId: string;
    name: string;
    alias?: string;
    avatar?: string;
    location?: string;
    flag?: number;
    selfSignature?: string;
  }

  /* -------------------- 依赖与状态 -------------------- */
  const { t } = useI18n();
  const userStore = useUserStore();
  const messageStore = useMessageStore();
  const searchStore = useSearchStore();
  const friendStore = useFriendsStore();
  const { useFriendlyTime } = useTimeFormat(); // hook 返回格式化函数

  // 输入与控制
  const searchStr = ref("");
  const activeTab = ref<"all" | "friends" | "groups" | "messages">("all");
  const inviteDialogVisible = ref(false);
  const friendSearchDialogVisible = ref(false);
  const searchFriendStr = ref("");
  const searchedFriends = ref<Friend[]>([]); // 假设 Friend 类型已定义

  const addFriendDialogVisible = ref(false);
  const currentAddingFriend = ref<Friend | null>(null);
  const verifyMsg = ref("");
  const remark = ref("");

  // 结果
  const friends = ref<Friend[]>([]);
  const messages = ref<Chat[]>([]);

  // DOM refs（template 中对应 ref）
  const popoverRef = ref<any>(null);
  const headerInputRef = ref<any>(null);
  const resultsScrollRef = ref<HTMLElement | null>(null);

  // 键盘导航焦点索引
  const focusedIndex = ref<number>(-1);

  /* 防抖间隔（ms） */
  const DEBOUNCE_MS = 280;

  /* -------------------- 计算属性 -------------------- */
  /**
   * 扁平化列表（用于键盘上下导航）
   * 返回格式：{ type: 'friend'|'message', index, item } 的数组
   */
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

  /** 是否有任意结果（用于 all tab 的无结果提示） */
  const hasAnyResult = computed(() => friends.value.length + messages.value.length > 0);

  /* -------------------- 搜索主流程 -------------------- */
  /**
   * performSearch
   * - 负责调用 store 的 searchFriends/searchMessages（并行）
   * - 接受原始 query（不负责 trim 校验的太多逻辑外部已处理）
   * - 将结果写回 friends/messages，并重置聚焦/滚动
   */
  async function performSearch(query: string) {
    const trimmed = (query ?? "").trim();
    if (!trimmed) {
      // 空查询：清空结果与焦点
      friends.value = [];
      messages.value = [];
      focusedIndex.value = -1;
      return;
    }

    try {
      // 并行执行联系人与消息搜索（store 层实现聚合与性能优化）
      const [friendRes, messageRes] = await Promise.all([
        searchStore.searchFriends(trimmed),
        searchStore.searchMessages(trimmed)
      ]);

      // @ts-ignore
      friends.value = friendRes ?? [];
      messages.value = messageRes ?? [];

      // 把焦点设置到第一个可选项（若存在）
      focusedIndex.value = flatList.value.length > 0 ? 0 : -1;

      // 等待 DOM 更新后滚动焦点可见
      await nextTick();
      scrollFocusedIntoView();
    } catch (err) {
      console.error("performSearch error:", err);
      ElMessage.error(t("search.error.noResults"));
    }
  }

  /* 防抖版本，调用方（handleInput）会触发此防抖函数 */
  const debouncedPerformSearch = useDebounceWithCancel(() => performSearch(searchStr.value), DEBOUNCE_MS);

  // 新增：打开添加好友验证对话框
  function handleAddFriend(friend: Friend) {
    currentAddingFriend.value = friend;
    verifyMsg.value = `我是 ${userStore.name}`; // 默认验证信息
    remark.value = friend.name; // 默认备注为好友名
    addFriendDialogVisible.value = true;
  }

  // 新增：关闭添加好友验证对话框
  function closeAddFriendDialog() {
    addFriendDialogVisible.value = false;
    verifyMsg.value = "";
    remark.value = "";
    currentAddingFriend.value = null;
  }

  // 新增：确认添加好友
  async function confirmAddFriend() {
    if (!currentAddingFriend.value) return;
    try {
      // 调用 store 添加逻辑，传入验证信息和备注
      await friendStore.handleAddContact(currentAddingFriend.value, verifyMsg.value.trim(), remark.value.trim());
      ElMessage.success(t("search.message.sentRequest", { name: currentAddingFriend.value.name }));
      closeAddFriendDialog();
      addFriendDialogVisible.value = false;
      // 可选：刷新搜索结果或关闭搜索弹窗
    } catch (err) {
      console.error("Add friend error:", err);
      //ElMessage.error("添加失败，请重试");
    }
  }

  /* -------------------- 事件处理函数（暴露给模板） -------------------- */
  /**
   * handleInput
   * - 输入事件处理：重置焦点并触发防抖搜索
   */
  function handleInput() {
    focusedIndex.value = -1;
    debouncedPerformSearch();
  }

  /**
   * handleEnter
   * - 回车处理：取消防抖并立即搜索，若当前有焦点项则选中它
   */
  async function handleEnter() {
    // 取消 pending 的防抖调用
    debouncedPerformSearch.cancel?.();
    await performSearch(searchStr.value);

    if (focusedIndex.value >= 0) {
      const sel = flatList.value[focusedIndex.value];
      if (sel) selectResult(sel.type, sel.item);
    }
  }

  /**
   * selectResult
   * - 用户选择搜索结果（点击或回车）
   * - TODO: 在这里替换为打开会话 / 路由 / emit 等业务逻辑
   */
  function selectResult(type: string, item: any) {
    // 先关闭 popover（通过 popper 实例）
    const pop = unref(popoverRef);
    if (pop?.popperRef?.isShow) pop.hide?.();
    // 占位行为：提示选择结果
    ElMessage.info(t("search.selected", { type }));
  }

  /**
   * toggleSearchPopover
   * - 显示/隐藏搜索弹窗（用于 header 的点击触发）
   */
  function toggleSearchPopover() {
    const pop = unref(popoverRef);
    if (pop?.popperRef?.isShow) pop.hide?.();
    else pop?.show?.();
  }

  /**
   * handleClear
   * - 清空输入与搜索结果，同时取消防抖任务
   */
  function handleClear() {
    debouncedPerformSearch.cancel?.();
    searchStr.value = "";
    friends.value = [];
    messages.value = [];
    focusedIndex.value = -1;
  }

  /**
   * openInvite / handleAddGroupMember
   * - 邀请弹窗控制与回调（示例）
   */
  function openInvite() {
    inviteDialogVisible.value = !inviteDialogVisible.value;
  }

  // 打开好友搜索弹窗
  function openFriendSearchDialog() {
    searchFriendStr.value = searchStr.value; // 可选：继承主搜索词
    unref(popoverRef).hide?.();
    friendSearchDialogVisible.value = true;
  }

  // 关闭好友搜索弹窗并清理
  function closeFriendSearchDialog() {
    searchFriendStr.value = "";
    searchedFriends.value = [];
    friendSearchDialogVisible.value = false;
  }

  // 处理好友搜索输入（防抖，调用 store.searchMoreFriends 或类似）
  const debouncedFriendSearch = useDebounceWithCancel(async () => {
    if (!searchFriendStr.value.trim()) {
      searchedFriends.value = [];
      return;
    }
    try {
      const res: any = (await friendStore.handleSearchFriendInfo?.(searchFriendStr.value.trim())) ?? [];
      searchedFriends.value = [...res];
    } catch (err) {
      console.error("Friend search error:", err);
      ElMessage.error(t("search.friendSearch.noResult"));
    }
  }, 300);

  function handleFriendSearch() {
    debouncedFriendSearch();
  }

  // function handleAddFriend(friend: Friend) {
  //   // TODO: 实现添加好友逻辑，如调用 store.handleAddFriend
  //   friendStore.handleAddContact(friend);
  //   ElMessage.success(`已发送添加请求给 ${friend.name}`);
  // }

  function handleAddGroupMember(arr: any[]) {
    if (!arr || !arr.length) return;
    // 实现添加成员的逻辑
    messageStore.handleAddGroupMember(arr, false);
  }

  /* -------------------- 工具函数 -------------------- */
  /**
   * useDebounceWithCancel
   * - 返回一个带 cancel 方法的防抖函数
   * - wrapped(...args) 调用会在 wait 毫秒后执行 fn(...args)
   * - wrapped.cancel() 取消挂起的调用
   */
  function useDebounceWithCancel<T extends (...args: any[]) => any>(fn: T, wait = 300) {
    let tid: number | undefined;
    const wrapped = (...args: Parameters<T>) => {
      if (tid) clearTimeout(tid);
      // @ts-ignore
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

  /**
   * escape + highlight 简单实现（使用 escapeHtml 输入）
   * - 若没有查询词，返回 escape 的原文本
   * - 否则把匹配项用 <mark class="hl"> 包裹（注意：用于 v-html）
   */
  function highlight(text?: string) {
    if (!searchStr.value) return escapeHtml(text ?? "");
    const q = escapeHtml(searchStr.value.trim());
    if (!q) return escapeHtml(text ?? "");
    try {
      const re = new RegExp(`(${q})`, "ig");
      return escapeHtml(text ?? "").replace(re, "<mark class=\"search-popover__hl\">$1</mark>");
    } catch {
      return escapeHtml(text ?? "");
    }
  }

  /**
   * initials - 头像占位首字母
   */
  function initials(name?: string) {
    const n = (name ?? "").trim();
    if (!n) return "#";
    const first = n[0];
    return /[A-Za-z0-9]/.test(first) ? first.toUpperCase() : first;
  }

  /* -------------------- 辅助：焦点滚动与索引映射 -------------------- */
  /**
   * scrollFocusedIntoView
   * - 确保当前 focusedIndex 对应的 DOM 元素在可滚动容器中可见
   */
  function scrollFocusedIntoView() {
    nextTick(() => {
      const container = resultsScrollRef.value as HTMLElement | null;
      if (!container || focusedIndex.value < 0) return;
      const listItems = container.querySelectorAll(".search-popover__list-item");
      const el = listItems[focusedIndex.value] as HTMLElement | undefined;
      if (!el) return;
      const cTop = container.scrollTop;
      const cBottom = cTop + container.clientHeight;
      const eTop = el.offsetTop;
      const eBottom = eTop + el.clientHeight;
      if (eTop < cTop) container.scrollTop = eTop - 6;
      else if (eBottom > cBottom) container.scrollTop = eBottom - container.clientHeight + 6;
    });
  }

  /**
   * flatIndex
   * - 把局部索引（type + localIndex）转换为 flatList 全局索引（用于高亮 / hover）
   */
  function flatIndex(type: string, localIndex: number) {
    let idx = 0;
    if (activeTab.value === "all") {
      if (type === "friend") return idx + localIndex;
      idx += friends.value.length;
      if (type === "message") return idx + localIndex;
    } else if (activeTab.value === "friends") {
      if (type === "friend") return localIndex;
    } else if (activeTab.value === "messages") {
      if (type === "message") return localIndex;
    }
    return -1;
  }

  /**
   * setHover
   * - 鼠标移动到某项时设置 focusedIndex（用于键盘状态同步）
   */
  function setHover(globalIndex: number) {
    focusedIndex.value = globalIndex;
  }

  /**
   * isFocused
   * - 判断某个全局索引是否被当前焦点选中（用于模板 class）
   */
  function isFocused(globalIndex: number) {
    return globalIndex >= 0 && focusedIndex.value === globalIndex;
  }

  /* -------------------- 监听 & 清理 -------------------- */
  /**
   * 当 searchStr 变为空，取消防抖并清理结果（即时）
   */
  watch(searchStr, v => {
    if (!v || !v.trim()) {
      debouncedPerformSearch.cancel?.();
      friends.value = [];
      messages.value = [];
      focusedIndex.value = -1;
    }
  });
</script>

<style lang="scss" scoped>
  $fs-bg: #ffffff;
  $fs-border: #e6e6e6;
  $fs-muted: #888888;
  $fs-primary: #409eff;
  $fs-hover: #ebedf3;
  $fs-radius: 8px;

  /* 头像尺寸（可按需改为 40px） */
  $fs-avatar-size: 40px;
  $fs-avatar-size-small: 40px;

  @mixin scroll-bar($width: 5px) {
    /* 背景色为透明 */
    &::-webkit-scrollbar-track {
      border-radius: 10px;
      background-color: transparent;
    }

    &::-webkit-scrollbar {
      width: $width;
      height: 10px;
      background-color: transparent;
    }

    &::-webkit-scrollbar-thumb {
      border-radius: 10px;
      background-color: rgba(0, 0, 0, 0.2);
    }
  }

  .search-container {
    padding-left: 5px;
    line-height: 60px;

    &__input {
      padding-right: 8px;
    }
  }

  .add-friend-verify {
    &__container {
      padding: 15px;
    }
  }

  ::v-deep(.el-dialog__footer) {
    padding-top: 0px !important;
  }

  /* Block */
  .friend-search {
    color: #222;
    box-sizing: border-box;

    /* 容器：弹窗内主要间距 */
    &__container {
      padding: 12px;
      background: $fs-bg;
      min-height: 120px;
    }

    /* 输入区域包装器（如需自定义 el-input 风格） */
    &__input {
      margin-bottom: 12px;

      /* element-plus 内部输入的样式可覆盖 */
      .el-input__inner {
        height: 38px;
        border-radius: 6px;
        padding-left: 12px;
        font-size: 14px;
      }
    }

    /* 列表容器：限制高度并可滚动 */
    &__list {
      list-style: none;
      margin: 0;
      padding: 0;
      max-height: 320px;
      overflow: auto;
      border-bottom: 1px solid $fs-border;
      border-radius: 6px;
      background: $fs-bg;

      /* 简洁滚动条样式（可选） */
      &::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }

      &::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.08);
        border-radius: 6px;
      }

      &:last-child {
        border-bottom: none;
      }
    }

    /* 单项：三列布局（avatar / content / action） */
    &__item {
      display: flex;
      align-items: center; /* 垂直居中所有子项，避免被撑高 */
      gap: 12px;
      padding: 0px 10px;
      height: 64px;
      cursor: pointer;
      transition: background 0.12s ease;
      user-select: none;
      min-height: $fs-avatar-size; /* 确保最小高度与头像一致 */

      &:hover {
        background: $fs-hover;
      }

      /* 键盘可访问性：focus 可见 */
      &:focus,
      &:focus-visible {
        outline: 2px solid rgba(64, 158, 255, 0.18);
        outline-offset: 0;
        background: $fs-hover;
      }
    }

    /* 头像容器：固定尺寸 */
    &__avatar-wrap {
      width: $fs-avatar-size;
      height: $fs-avatar-size;
      flex: 0 0 $fs-avatar-size;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      overflow: hidden;
      background: #fafafa;
    }

    &__avatar {
      width: $fs-avatar-size;
      height: $fs-avatar-size;
      object-fit: cover;
      display: block;
    }

    /* 头像占位（首字母） */
    &__avatar-fallback {
      width: $fs-avatar-size;
      height: $fs-avatar-size;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      background: #e9eef8;
      color: $fs-muted;
      font-weight: 600;
      font-size: 16px;
    }

    /* 中间文本区域：高度与头像一致，垂直居中显示（避免撑高） */
    &__content {
      flex: 1 1 auto;
      // min-width: 0; /* 允许文本截断 */
      display: flex;
      flex-direction: column;
      justify-content: center; /* 垂直居中，避免撑高 */
      height: $fs-avatar-size; /* 与头像高度一致 */
      gap: 2px;
      overflow: hidden;
    }

    /* 名称与 ID：单行截断（行高控制） */
    &__name {
      font-size: 14px;
      font-weight: 500;
      color: #222;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 20px;
      // max-height: 20px;
    }

    &__id {
      font-size: 12px;
      color: $fs-muted;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 18px;
      // max-height: 18px;
    }

    /* 无结果提示 */
    &__no-result {
      padding: 16px;
      text-align: center;
      color: $fs-muted;
      font-size: 13px;
    }
  }

  /* popover 自定义样式 */
  .search-popover {
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
    border-radius: 8px;
    padding: 0;
    overflow: hidden;

    &__content {
      width: 100%;
      max-height: 60vh; /* 限高，避免高度溢出屏幕 */
      display: flex;
      flex-direction: column;
      background-color: var(--content-bg-color);
    }

    /* tabs（同之前样式） */
    &__tabs {
      display: flex;
      gap: 8px;
      padding: 8px 12px;
      border-bottom: 1px solid #f0f0f0;
    }

    &__tab {
      background: transparent;
      border: none;
      padding: 6px 12px;
      border-radius: 999px;
      cursor: pointer;
      color: #666;

      &--active {
        background: #f5f5f7;
        color: #222;
      }
    }

    /* 结果滚动区域 */
    &__results-scroll {
      padding: 8px 12px;
      overflow: auto;
      flex: 1;
      @include scroll-bar();
    }

    /* section 标题 */
    &__section-title {
      font-size: 13px;
      color: #888;
      margin: 12px 0 8px 6px;
    }

    /* 列表项（同之前） */
    &__list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    &__list-item {
      display: flex;
      gap: 10px;
      padding: 8px;
      align-items: center;
      border-radius: 8px;
      cursor: pointer;

      &:hover {
        background: #f7f7f7;
      }

      &--focused {
        background: #eef6ff;
      }

      /* 键盘选中高亮 */
    }

    .new-friend {
      background-color: #f5f5f7;
      border-radius: 8px;
    }

    &__avatar {
      width: 44px;
      height: 44px;
      border-radius: 8px;
      object-fit: cover;

      &-fallback {
        width: 44px;
        height: 44px;
        border-radius: 8px;
        background: #e6e6e6;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #666;
        font-weight: 600;
      }
    }

    &__meta {
      flex: 1;
      min-width: 0;
    }

    &__row {
      display: flex;
      justify-content: space-between;
      align-items: center;

      &--sub {
        margin-top: 4px;
        display: flex;
        flex-direction: column; /* 修改为列方向，使 preview 和 count 分成两行 */
        align-items: flex-start; /* 左对齐 */
        gap: 4px; /* 调整间距为垂直间距 */
      }
    }

    &__name {
      font-weight: 500;
      font-size: 14px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    &__time {
      font-size: 12px;
      color: #999;
      margin-left: 8px;
      flex-shrink: 0;
    }

    &__preview {
      color: #777;
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    &__count {
      color: #999;
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    &__unread {
      background: var(--main-red-color, #ff4d4f);
      color: #fff;
      padding: 2px 6px;
      border-radius: 999px;
      font-size: 12px;
    }

    &__tag {
      font-size: 12px;
      color: #999;
    }

    /* 高亮 */
    &__hl {
      background: #fff176;
      color: inherit;
      padding: 0 2px;
      border-radius: 2px;
    }

    /* 无结果 */
    &__no-result {
      text-align: center;
      color: #999;
      padding: 18px 0;
    }
  }
</style>
