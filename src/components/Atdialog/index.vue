<template>
  <!-- At 列表弹窗（fixed 定位） -->
  <div
    v-if="visible"
    :aria-activedescendant="activeDescId"
    :style="wrapperStyle"
    class="at-wrapper no-select"
    role="listbox"
    tabindex="-1"
  >
    <div v-if="filteredUsers.length === 0" class="empty">无结果</div>

    <div
      v-for="(item, i) in filteredUsers"
      :id="`at-item-${item.userId}`"
      :key="item.userId"
      :ref="el => setItemRef(el, i)"
      :aria-selected="i === highlightIndex"
      :class="{ active: i === highlightIndex }"
      class="item"
      role="option"
      @click="clickAt(item)"
      @mouseenter="hoverAt(i)"
    >
      <div class="avatar-wrap">
        <img v-if="item.avatar" :src="item.avatar" alt="" class="avatar lazy-img" />
        <div v-else class="avatar avatar-fallback">{{ getInitials(item.name) }}</div>
      </div>

      <div class="meta">
        <div class="name">{{ item.name }}</div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  /**
   * 优化版 AtDialog（带头像、漂亮 UI）
   *
   * 说明：
   * - props.users 中每项建议包含：{ userId, name, avatar}
   * - 组件发出事件：
   *    - handlePickUser (user) 选中行
   *    - handleHide () 关闭弹窗
   *
   * 使用方式与之前相同，UI 更美观，键盘/鼠标交互更流畅
   */

  import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

  // 简单 User 接口（按需扩展）
  type User = { userId: string; name: string; avatar?: string | null };

  const props = defineProps<{
    users: User[];
    visible: boolean;
    position: { x: number; y: number };
    queryString: string;
  }>();

  const emit = defineEmits<{
    (e: "handleHide"): void;
    (e: "handlePickUser", user: User): void;
  }>();

  /* ---------- 本地状态 ---------- */
  const highlightIndex = ref<number>(0);
  // items 按索引存放 dom 节点（保证顺序一致）
  const items = ref<HTMLElement[]>([]);

  /* ---------- 设置 item ref（按索引写入） ---------- */
  const setItemRef = (el: HTMLElement | null | any, i: number) => {
    if (!items.value) items.value = [];
    if (el) items.value[i] = el;
    else if (typeof i === "number") items.value[i] = undefined as any;
  };

  /* ---------- 过滤逻辑（本地） ---------- */
  const filteredUsers = computed<User[]>(() => {
    const q = String(props.queryString || "")
      .trim()
      .toLowerCase();
    if (!q) return props.users || [];
    return (props.users || []).filter(u =>
      String(u.name || "")
        .toLowerCase()
        .includes(q)
    );
  });

  /* ---------- 辅助 computed / aria ---------- */
  const activeDescId = computed(() => {
    const user = filteredUsers.value[highlightIndex.value];
    return user ? `at-item-${user.userId}` : undefined;
  });

  /* ---------- 位置修正（防止超出视口） ---------- */
  const adjustedPosition = ref({ x: props.position?.x || 0, y: props.position?.y || 0 });
  const MARGIN = 8;

  // ---------- 优先在传入 y 的上方显示，如果放不下则回退到下方 ----------
  const measureAndAdjust = async () => {
    await nextTick();
    const wrapper = document.querySelector(".at-wrapper") as HTMLElement | null;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = props.position?.x ?? 0;
    let y = props.position?.y ?? 0;

    // 横向处理（同原逻辑）
    if (x + rect.width + MARGIN > vw) {
      x = Math.max(MARGIN, vw - rect.width - MARGIN);
    } else {
      x = Math.max(MARGIN, x);
    }

    // 纵向：优先放在传入 y 的上方（即 y - height - margin）
    const yAbove = (props.position?.y ?? 0) - rect.height - MARGIN;
    const yBelow = (props.position?.y ?? 0) + MARGIN;

    if (yAbove >= MARGIN) {
      // 上方有足够空间 -> 放在上方
      y = yAbove;
    } else if (yBelow + rect.height + MARGIN <= vh) {
      // 上方不够，但下方够 -> 放在下方（紧贴传入 y 的下侧）
      y = yBelow;
    } else {
      // 两边都不够，尽量靠近视口边缘
      // 优先尝试放上方的最大位置，否则放到视口底部留 margin
      y = Math.max(MARGIN, Math.min(Math.max(MARGIN, vh - rect.height - MARGIN), yAbove));
    }

    adjustedPosition.value = { x, y };
  };

  watch(
    [() => props.visible, () => props.position?.x, () => props.position?.y, filteredUsers],
    async () => {
      if (props.visible) {
        // 重新清理 refs 数组（确保索引一致）
        items.value = new Array(filteredUsers.value.length).fill(null) as any;
        await nextTick();
        await measureAndAdjust();
        // 重置高亮索引并滚动（若有结果）
        highlightIndex.value =
          filteredUsers.value.length > 0 ? Math.min(highlightIndex.value, filteredUsers.value.length - 1) : 0;
        scrollActiveIntoView();
      } else {
        items.value = [];
      }
    },
    { immediate: true }
  );

  /* ---------- 滚动到高亮项 ---------- */
  const scrollActiveIntoView = () => {
    nextTick(() => {
      const idx = highlightIndex.value;
      if (!items.value || idx < 0 || idx >= items.value.length) return;
      const el = items.value[idx];
      if (!el) return;
      el.scrollIntoView({ block: "nearest", behavior: "auto" });
    });
  };

  /* ---------- 键盘事件处理（在 visible 时全局监听） ---------- */
  const keyDownHandler = (e: KeyboardEvent) => {
    if (!props.visible) return;
    const len = filteredUsers.value.length;
    if (len === 0) {
      if (e.key === "Escape") emit("handleHide");
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        highlightIndex.value = (highlightIndex.value + 1) % len;
        scrollActiveIntoView();
        break;
      case "ArrowUp":
        e.preventDefault();
        highlightIndex.value = (highlightIndex.value - 1 + len) % len;
        scrollActiveIntoView();
        break;
      case "Enter":
        e.preventDefault();
      {
        const user = filteredUsers.value[highlightIndex.value];
        if (user) emit("handlePickUser", user);
      }
        break;
      case "Escape":
        e.preventDefault();
        emit("handleHide");
        break;
    }
  };

  watch(
    () => props.visible,
    visible => {
      if (visible) window.addEventListener("keydown", keyDownHandler);
      else {
        window.removeEventListener("keydown", keyDownHandler);
        items.value = [];
      }
    },
    { immediate: true }
  );

  onBeforeUnmount(() => {
    window.removeEventListener("keydown", keyDownHandler);
  });

  /* ---------- 鼠标交互 ---------- */
  const hoverAt = (i: number) => {
    highlightIndex.value = i;
  };
  const clickAt = (item: User) => {
    emit("handlePickUser", item);
  };

  /* ---------- 公共方法：生成 wrapper style、头像首字母 ---------- */
  const wrapperStyle = computed(() => {
    return {
      position: "fixed",
      left: `${adjustedPosition.value.x}px`,
      top: `${adjustedPosition.value.y - 10}px`,
      zIndex: "999"
    } as Record<string, string>;
  });

  const getInitials = (name?: string) => {
    if (!name) return "";
    const s = name.trim();
    // 返回第一个汉字或字母的大写首字母
    const first = s.charAt(0);
    // 若是英文，取大写；否则直接返回首个字符
    return /[a-zA-Z]/.test(first) ? first.toUpperCase() : first;
  };
</script>

<style lang="scss" scoped>
  /* 美观的 AtDialog 样式（带头像） */

  /* 滚动条混入 */
  @mixin scroll-bar($width: 8px) {
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
      background-color: rgba(0, 0, 0, 0.08);
    }
  }

  .at-wrapper {
    width: 180px;
    max-height: 300px;
    overflow-y: auto;
    border: 1px solid #cbd3db;
    border-radius: 5px;
    background-color: #ffffff;
    box-shadow: 0 8px 24px rgba(23, 135, 200, 0.1);
    box-sizing: border-box;
    padding: 8px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial;
    @include scroll-bar();
  }

  /* 空状态 */
  .empty {
    font-size: 13px;
    padding: 12px 16px;
    color: #9aa6b2;
    text-align: center;
  }

  /* 每一行 item */
  .item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 6px;
    border-radius: 5px;
    cursor: pointer;
    transition: background 120ms ease, transform 80ms ease;
    color: #2b2f33;

    &:hover {
      background: #f6fbff;
      transform: translateY(-1px);
    }

    &.active {
      background: var(--content-active-color);
      color: #ffffff;

      .avatar {
        box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.12) inset;
      }

      .sub {
        color: rgba(255, 255, 255, 0.9);
      }
    }

    .avatar-wrap {
      flex: 0 0 40px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .avatar {
      width: 30px;
      height: 30px;
      border-radius: 4px;
      object-fit: cover;
      background: #e6eef5;
      display: inline-block;
      font-weight: 600;
      color: #0b66a3;
      text-align: center;
      line-height: 40px;
    }

    .avatar-fallback {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(180deg, #d9ecf8, #eaf6fc);
      color: #0b66a3;
    }

    .meta {
      flex: 1;
      min-width: 0; /* 允许溢出隐藏 */
      display: flex;
      flex-direction: column;
      gap: 2px;

      .name {
        font-size: 12px;
        font-weight: 400;
        line-height: 1;
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
      }

      .sub {
        font-size: 12px;
        color: #7f8a93;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }

    .hint {
      flex: 0 0 44px;
      font-size: 12px;
      text-align: right;
      color: rgba(43, 47, 51, 0.6);
      opacity: 0;
      transition: opacity 120ms ease;
    }

    &:hover .hint {
      opacity: 1;
    }

    &.active .hint {
      opacity: 1;
      color: rgba(255, 255, 255, 0.95);
    }
  }

  /* 小屏适配 */
  @media (max-width: 480px) {
    .at-wrapper {
      width: 260px;
      max-height: 240px;
    }
    .avatar {
      width: 36px;
      height: 36px;
    }
  }
</style>
