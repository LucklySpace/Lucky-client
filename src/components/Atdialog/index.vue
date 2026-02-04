<template>
  <!-- At 列表弹窗（fixed 定位） -->
  <Teleport to="body">
    <Transition name="at-fade">
      <div v-if="visible" ref="wrapperRef" :aria-activedescendant="activeDescId" :style="wrapperStyle"
        class="at-wrapper no-select" role="listbox" tabindex="-1">
        <!-- @所有人 选项 -->
        <div v-if="showMentionAll" :id="`at-item-${MENTION_ALL_ID}`" :ref="el => setItemRef(el, 0)"
          :aria-selected="highlightIndex === 0" :class="{ active: highlightIndex === 0 }" class="item item--all"
          role="option" @click="handleSelectAll" @mouseenter="hoverAt(0)">
          <div class="avatar-wrap">
            <span class="avatar avatar--all">
              <i class="iconfont icon-renqun" />
            </span>
          </div>
          <div class="meta">
            <div class="name">{{ mentionAllText }}</div>
            <div class="sub">{{ $t('pages.chat.mention.allHint') || '通知群内所有人' }}</div>
          </div>
        </div>

        <!-- 分隔线 -->
        <div v-if="showMentionAll && displayUsers.length > 0" class="divider" />

        <!-- 空状态 -->
        <div v-if="displayUsers.length === 0 && !showMentionAll" class="empty">
          {{ $t('common.empty') || '无结果' }}
        </div>

        <!-- 用户列表 -->
        <div v-for="(item, i) in displayUsers" :id="`at-item-${item.userId}`" :key="item.userId"
          :ref="el => setItemRef(el, actualIndex(i))" :aria-selected="highlightIndex === actualIndex(i)"
          :class="{ active: highlightIndex === actualIndex(i) }" class="item" role="option"
          @click="handleSelectUser(item)" @mouseenter="hoverAt(actualIndex(i))">
          <div class="avatar-wrap">
            <Avatar :avatar="item.avatar || ''" :name="item.name" :width="30" :borderRadius="4" />
          </div>
          <div class="meta">
            <div class="name">{{ item.name }}</div>
            <div v-if="item.role" class="sub">{{ getRoleText(item.role) }}</div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script lang="ts" setup>
/**
 * AtDialog - @ 提及用户选择弹窗
 *
 * 功能：
 * - 展示可 @ 的用户列表
 * - 支持 @所有人（群聊场景）
 * - 支持键盘导航（上下箭头、Enter、Escape）
 * - 支持搜索过滤
 * - 自适应位置（避免超出视口）
 *
 * Props:
 * - users: 用户列表
 * - visible: 是否可见
 * - position: 弹窗位置
 * - queryString: 搜索关键词
 * - showAllOption: 是否显示 @所有人选项（默认 true）
 *
 * Emits:
 * - handleHide: 隐藏弹窗
 * - handlePickUser: 选中用户
 */

import Avatar from "@/components/Avatar/index.vue";
import { GroupMemberRole } from "@/constants";
import { MENTION_ALL_ID, MENTION_ALL_NAME, createMentionAllOption, type AtAllOption, type AtUser } from "@/hooks/useAtMention";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

// ==================== 类型定义 ====================

interface UserItem extends AtUser {
  role?: string | number;
}

type SelectableItem = UserItem | AtAllOption;

// ==================== Props & Emits ====================

const props = withDefaults(
  defineProps<{
    users: UserItem[];
    visible: boolean;
    position: { x: number; y: number };
    queryString: string;
    showAllOption?: boolean;
  }>(),
  {
    showAllOption: true,
  }
);

const emit = defineEmits<{
  (e: "handleHide"): void;
  (e: "handlePickUser", user: SelectableItem): void;
}>();

// ==================== i18n ====================

const { t } = useI18n();

const mentionAllText = computed(() => t("pages.chat.mention.all") || MENTION_ALL_NAME);

const getRoleText = (role?: string | number): string => {
  if (!role) return "";
  if (role === "owner" || role === GroupMemberRole.OWNER.code) return t("pages.chat.group.owner") || "群主";
  if (role === "admin" || role === GroupMemberRole.ADMIN.code) return t("pages.chat.group.admin") || "管理员";
  return "";
};

// ==================== 本地状态 ====================

const wrapperRef = ref<HTMLElement | null>(null);
const highlightIndex = ref(0);
const items = ref<(HTMLElement | null)[]>([]);

// ==================== 过滤逻辑 ====================

const filteredUsers = computed<UserItem[]>(() => {
  const query = String(props.queryString || "").trim().toLowerCase();
  if (!query) return props.users || [];

  return (props.users || []).filter((u) =>
    String(u.name || "").toLowerCase().includes(query)
  );
});

/** 是否显示 @所有人 选项 */
const showMentionAll = computed(() => {
  if (!props.showAllOption) return false;

  const query = String(props.queryString || "").trim().toLowerCase();
  if (!query) return true;

  // 匹配 "所有人"、"all" 等关键词
  const allKeywords = [
    MENTION_ALL_NAME.toLowerCase(),
    "all",
    "everyone",
    mentionAllText.value.toLowerCase(),
  ];

  return allKeywords.some((kw) => kw.includes(query) || query.includes(kw));
});

/** 实际显示的用户列表 */
const displayUsers = computed(() => filteredUsers.value);

/** 总条目数（包含 @所有人） */
const totalItems = computed(() => {
  const userCount = displayUsers.value.length;
  return showMentionAll.value ? userCount + 1 : userCount;
});

/** 计算用户在列表中的实际索引（考虑 @所有人 偏移） */
const actualIndex = (userIndex: number): number => {
  return showMentionAll.value ? userIndex + 1 : userIndex;
};

// ==================== Aria 辅助 ====================

const activeDescId = computed(() => {
  if (highlightIndex.value === 0 && showMentionAll.value) {
    return `at-item-${MENTION_ALL_ID}`;
  }
  const userIndex = showMentionAll.value
    ? highlightIndex.value - 1
    : highlightIndex.value;
  const user = displayUsers.value[userIndex];
  return user ? `at-item-${user.userId}` : undefined;
});

// ==================== Ref 管理 ====================

const setItemRef = (el: HTMLElement | null | unknown, index: number) => {
  if (!items.value) items.value = [];
  items.value[index] = el as HTMLElement | null;
};

const clearRefs = () => {
  items.value = [];
};

// ==================== 位置计算 ====================

const adjustedPosition = ref({ x: 0, y: 0 });
const MARGIN = 8;

const measureAndAdjust = async () => {
  await nextTick();
  const wrapper = wrapperRef.value;
  if (!wrapper) return;

  const rect = wrapper.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = props.position?.x ?? 0;
  let y = props.position?.y ?? 0;

  // 横向：防止超出右边界
  if (x + rect.width + MARGIN > vw) {
    x = Math.max(MARGIN, vw - rect.width - MARGIN);
  } else {
    x = Math.max(MARGIN, x);
  }

  // 纵向：优先在上方显示
  const yAbove = (props.position?.y ?? 0) - rect.height - MARGIN;
  const yBelow = (props.position?.y ?? 0) + MARGIN;

  if (yAbove >= MARGIN) {
    y = yAbove;
  } else if (yBelow + rect.height + MARGIN <= vh) {
    y = yBelow;
  } else {
    y = Math.max(MARGIN, Math.min(vh - rect.height - MARGIN, yAbove));
  }

  adjustedPosition.value = { x, y };
};

const wrapperStyle = computed(() => ({
  position: "fixed" as const,
  left: `${adjustedPosition.value.x}px`,
  top: `${adjustedPosition.value.y}px`,
  zIndex: "9999",
}));

// ==================== 滚动到高亮项 ====================

const scrollActiveIntoView = () => {
  nextTick(() => {
    const idx = highlightIndex.value;
    if (idx < 0 || idx >= items.value.length) return;
    const el = items.value[idx];
    el?.scrollIntoView({ block: "nearest", behavior: "auto" });
  });
};

// ==================== 键盘事件 ====================

const handleKeyDown = (e: KeyboardEvent) => {
  if (!props.visible) return;

  const len = totalItems.value;
  if (len === 0) {
    if (e.key === "Escape") emit("handleHide");
    return;
  }

  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      e.stopPropagation();
      highlightIndex.value = (highlightIndex.value + 1) % len;
      scrollActiveIntoView();
      break;

    case "ArrowUp":
      e.preventDefault();
      e.stopPropagation();
      highlightIndex.value = (highlightIndex.value - 1 + len) % len;
      scrollActiveIntoView();
      break;

    case "Enter":
      e.preventDefault();
      e.stopPropagation();
      selectCurrentItem();
      break;

    case "Escape":
      e.preventDefault();
      e.stopPropagation();
      emit("handleHide");
      break;
  }
};

// ==================== 选择逻辑 ====================

const selectCurrentItem = () => {
  const idx = highlightIndex.value;

  // 选择 @所有人
  if (idx === 0 && showMentionAll.value) {
    emit("handlePickUser", createMentionAllOption());
    return;
  }

  // 选择具体用户
  const userIndex = showMentionAll.value ? idx - 1 : idx;
  const user = displayUsers.value[userIndex];
  if (user) {
    emit("handlePickUser", user);
  }
};

const handleSelectAll = () => {
  emit("handlePickUser", createMentionAllOption());
};

const handleSelectUser = (user: UserItem) => {
  emit("handlePickUser", user);
};

const hoverAt = (index: number) => {
  highlightIndex.value = index;
};

// ==================== 生命周期 ====================

watch(
  [() => props.visible, () => props.position?.x, () => props.position?.y, displayUsers],
  async () => {
    if (props.visible) {
      // 重置状态
      const len = totalItems.value;
      items.value = new Array(len).fill(null);
      highlightIndex.value = len > 0 ? 0 : -1;

      await nextTick();
      await measureAndAdjust();
      scrollActiveIntoView();
    } else {
      clearRefs();
    }
  },
  { immediate: true }
);

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      window.addEventListener("keydown", handleKeyDown, true);
    } else {
      window.removeEventListener("keydown", handleKeyDown, true);
      clearRefs();
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeyDown, true);
});
</script>

<style lang="scss" scoped>
/* @ 弹窗样式 */

@mixin scroll-bar($width: 6px) {
  &::-webkit-scrollbar-track {
    border-radius: 10px;
    background-color: transparent;
  }

  &::-webkit-scrollbar {
    width: $width;
    height: 8px;
    background-color: transparent;
  }

  &::-webkit-scrollbar-thumb {
    border-radius: 10px;
    background-color: rgba(0, 0, 0, 0.1);

    &:hover {
      background-color: rgba(0, 0, 0, 0.15);
    }
  }
}

.at-wrapper {
  width: 220px;
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  background-color: #ffffff;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
  box-sizing: border-box;
  padding: 6px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  @include scroll-bar();
}

/* 过渡动画 */
.at-fade-enter-active,
.at-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.at-fade-enter-from,
.at-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

/* 空状态 */
.empty {
  font-size: 13px;
  padding: 16px;
  color: #999;
  text-align: center;
}

/* 分隔线 */
.divider {
  height: 1px;
  background: rgba(0, 0, 0, 0.06);
  margin: 4px 8px;
}

/* 列表项 */
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.1s ease;
  color: #2c3e50;

  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }

  &.active {
    background: var(--content-active-color, #1890ff);
    color: #ffffff;

    .sub {
      color: rgba(255, 255, 255, 0.8);
    }

    .avatar {
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.2);
    }
  }

  /* @所有人 特殊样式 */
  &--all {
    .avatar--all {
      background: linear-gradient(135deg, #ff9a56 0%, #ff6b3d 100%);
      display: flex;
      align-items: center;
      justify-content: center;

      .iconfont {
        font-size: 16px;
        color: #fff;
      }
    }

    &.active .avatar--all {
      background: rgba(255, 255, 255, 0.2);
    }
  }

  .avatar-wrap {
    flex: 0 0 30px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .avatar {
    width: 30px;
    height: 30px;
    border-radius: 4px;
    object-fit: cover;
    overflow: hidden;
  }

  .meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;

    .name {
      font-size: 13px;
      font-weight: 500;
      line-height: 1.3;
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow: hidden;
    }

    .sub {
      font-size: 11px;
      color: #909399;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
}

/* 暗色主题适配 */
:root[data-theme="dark"] {
  .at-wrapper {
    background-color: #2c2c2c;
    border-color: rgba(255, 255, 255, 0.1);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .item {
    color: #e0e0e0;

    &:hover {
      background: rgba(255, 255, 255, 0.06);
    }

    &.active {
      background: var(--content-active-color, #1890ff);
    }

    .sub {
      color: #888;
    }
  }

  .divider {
    background: rgba(255, 255, 255, 0.08);
  }

  .empty {
    color: #888;
  }
}

/* 响应式 */
@media (max-width: 480px) {
  .at-wrapper {
    width: 200px;
    max-height: 260px;
  }
}
</style>
