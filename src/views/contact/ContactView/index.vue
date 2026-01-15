<!--联系人列表 - 虚拟滚动 + 粘性标题-->
<template>
  <div class="contact-list">
    <div v-for="(key, idx) in SECTION_KEYS" :key="key" class="contact-list__section">
      <!-- 粘性标题哨兵 -->
      <div :ref="el => setSentinelRef(el, idx)" :data-idx="idx" class="contact-list__sentinel" />

      <!-- 分组标题 -->
      <div :ref="el => setTitleRef(el, idx)" class="contact-list__title" @click="toggleSection(key)">
        <span class="contact-list__arrow">
          <i
            :style="{ transform: sectionState[key] ? 'rotate(90deg)' : 'rotate(0deg)' }"
            class="iconfont icon-right"
          />
        </span>
        <span>{{ sectionTitles[key] }}</span>
        <span
          v-if="sectionCounts[key]"
          :class="{ 'contact-list__count--new': key === 'newFriends' && !store.ignore }"
          class="contact-list__count"
        >
          {{ sectionCounts[key] }}
        </span>
      </div>

      <!-- 虚拟列表 -->
      <VirtualList
        v-if="sectionState[key]"
        :buffer="5"
        :item-height="64"
        :items="store[key] ?? []"
        root-selector=".contact-list"
      >
        <template #default="{ item }">
          <li class="contact-list__item" @click="handleItemClick(item, key)">
            <div class="contact-list__item-content no-select">
              <Avatar
                :avatar="item.avatar || ''"
                :name="getDisplayName(item, key)"
                :width="36"
                :borderRadius="6"
                :backgroundColor="key === 'groups' ? '#ffb36b' : undefined"
              />
              <span class="contact-list__name">{{ truncateName(getDisplayName(item, key)) }}</span>
              <span v-if="item.message" class="contact-list__message">{{ item.message }}</span>
              <span v-if="item.memberCount" class="contact-list__sub">
                {{ $t("contacts.count", { count: item.memberCount }) }}
              </span>
            </div>
          </li>
        </template>
      </VirtualList>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useFriendsStore } from "@/store/modules/friends";
import { useChatStore } from "@/store/modules/chat";
import Avatar from "@/components/Avatar/index.vue";

// ========================= 类型定义 =========================
type SectionKey = "newFriends" | "groups" | "contacts";

interface ContactItem {
  id?: string;
  groupId?: string;
  name?: string;
  groupName?: string;
  remark?: string;
  avatar?: string;
  message?: string;
  memberCount?: number;
}

// ========================= 常量 =========================
const SECTION_KEYS: SectionKey[] = ["newFriends", "groups", "contacts"];
const MAX_NAME_LENGTH = 6;

// ========================= Store =========================
const { t } = useI18n();
const store = useFriendsStore();
const chatStore = useChatStore();

// ========================= 状态 =========================
const sectionState = ref<Record<SectionKey, boolean>>({
  newFriends: false,
  groups: false,
  contacts: false,
});

const titleRefs = ref<HTMLElement[]>([]);
const sentinelRefs = ref<HTMLElement[]>([]);
let observer: IntersectionObserver | null = null;

// ========================= Computed =========================
const sectionTitles = computed(() => ({
  newFriends: t("contacts.newFriends"),
  groups: t("contacts.groupChat"),
  contacts: t("contacts.contacts"),
}));

const sectionCounts = computed(() => ({
  newFriends: store.getTotalNewFriends ?? 0,
  groups: store.groups?.length ?? 0,
  contacts: store.contacts?.length ?? 0,
}));

// ========================= 方法 =========================
const setTitleRef = (el: HTMLElement | null, idx: number) => {
  if (el) titleRefs.value[idx] = el;
};

const setSentinelRef = (el: HTMLElement | null, idx: number) => {
  if (el) sentinelRefs.value[idx] = el;
};

const toggleSection = (key: SectionKey) => {
  sectionState.value[key] = !sectionState.value[key];
};

const handleItemClick = (item: ContactItem, key: SectionKey) => {
  store.type = key;
  store.shipInfo = item;
};

const truncateName = (name: string): string => {
  const trimmed = name?.trim() ?? "未知用户";
  return trimmed.length > MAX_NAME_LENGTH
    ? `${trimmed.substring(0, MAX_NAME_LENGTH)}...`
    : trimmed;
};

const getGroupName = (item: ContactItem): string => {
  const gid = item?.groupId || item?.id;
  if (gid) {
    const chat = chatStore.chatList.find((c) => String(c.chatId) === String(gid));
    if (chat?.name) return chat.name;
  }
  return item?.name ?? item?.groupName ?? "";
};

const getDisplayName = (item: ContactItem, key: SectionKey): string => {
  return key === "groups" ? getGroupName(item) : (item?.remark ?? item?.name ?? "");
};

// ========================= 生命周期 =========================
onMounted(() => {
  // 懒加载数据
  if (!store.newFriends?.length) store.loadNewFriends?.();
  if (!store.groups?.length) store.loadGroups?.();
  if (!store.contacts?.length) store.loadContacts?.();

  // 设置 IntersectionObserver 监听粘性标题
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const idx = Number((entry.target as HTMLElement).dataset.idx);
        const titleEl = titleRefs.value[idx];
        if (!titleEl) return;

        titleEl.classList.toggle("stuck", entry.boundingClientRect.top < 0);
      });
    },
    { root: null, threshold: [0] }
  );

  sentinelRefs.value.forEach((el) => el && observer!.observe(el));
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});

// ========================= 内嵌虚拟列表组件 =========================
const VirtualList = defineComponent({
  name: "VirtualList",
  props: {
    items: { type: Array, required: true },
    itemHeight: { type: Number, default: 56 },
    buffer: { type: Number, default: 5 },
    rootSelector: { type: String, default: ".contact-list" },
  },
  setup(props, { slots }) {
    const hostRef = ref<HTMLElement | null>(null);
    const rootEl = ref<HTMLElement | null>(null);
    const rootScrollTop = ref(0);
    const startIndex = ref(0);
    const endIndex = ref(0);
    let rafId: number | null = null;

    const totalHeight = computed(() => (props.items?.length ?? 0) * props.itemHeight);

    const visibleCount = computed(() => {
      const viewH = rootEl.value?.clientHeight || 400;
      return Math.ceil(viewH / props.itemHeight) + props.buffer * 2;
    });

    const measureHostOffset = (): number => {
      if (!hostRef.value || !rootEl.value) return 0;
      const hostRect = hostRef.value.getBoundingClientRect();
      const rootRect = rootEl.value.getBoundingClientRect();
      return hostRect.top - rootRect.top + rootEl.value.scrollTop;
    };

    const computeLocalScroll = (): number => {
      const local = rootScrollTop.value - measureHostOffset();
      return Math.max(0, local);
    };

    const recomputeRange = () => {
      const localScroll = computeLocalScroll();
      const s = Math.max(0, Math.floor(localScroll / props.itemHeight) - props.buffer);
      const e = Math.min(props.items?.length ?? 0, s + visibleCount.value);
      startIndex.value = s;
      endIndex.value = Math.max(s, e);
    };

    const onRootScroll = () => {
      if (!rootEl.value) return;
      rootScrollTop.value = rootEl.value.scrollTop;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        recomputeRange();
        rafId = null;
      });
    };

    onMounted(() => {
      nextTick(() => {
        rootEl.value =
          (hostRef.value?.closest(props.rootSelector) as HTMLElement) ??
          (document.querySelector(props.rootSelector) as HTMLElement) ??
          (document.scrollingElement as HTMLElement);

        if (!rootEl.value) return;

        rootScrollTop.value = rootEl.value.scrollTop;
        rootEl.value.addEventListener("scroll", onRootScroll, { passive: true });

        if (window.ResizeObserver) {
          const ro = new ResizeObserver(recomputeRange);
          ro.observe(rootEl.value);
          if (hostRef.value) ro.observe(hostRef.value);
          onBeforeUnmount(() => ro.disconnect());
        }

        recomputeRange();
      });
    });

    onBeforeUnmount(() => {
      rootEl.value?.removeEventListener("scroll", onRootScroll);
      if (rafId) cancelAnimationFrame(rafId);
    });

    watch(() => props.items, () => nextTick(recomputeRange), { deep: true });

    return () => {
      const slice = (props.items ?? []).slice(startIndex.value, endIndex.value);

      const nodes = slice.map((item: unknown, i: number) => {
        const realIndex = startIndex.value + i;
        const style = {
          position: "absolute",
          left: 0,
          right: 0,
          top: `${realIndex * props.itemHeight}px`,
          height: `${props.itemHeight}px`,
          display: "flex",
          width: "100%",
          alignItems: "center",
          boxSizing: "border-box",
        };

        const key = `vl-${(item as ContactItem)?.id ?? realIndex}`;
        return h("div", { key, style }, slots.default?.({ item, index: realIndex }));
      });

      return h("div", { ref: hostRef, class: "virtual-list" }, [
        h("div", { style: { height: `${totalHeight.value}px`, position: "relative" } }, nodes),
      ]);
    };
  },
});
</script>

<style lang="scss" scoped>
@mixin scroll-bar($width: 5px) {
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
    background-color: rgba(0, 0, 0, 0.3);
  }
}

.contact-list {
  max-width: 420px;
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
  color: #222;
  border-right: 1px solid var(--side-border-right-color);
  overflow-y: auto;
  background: var(--content-bg-color, #fff);
  position: relative;
  z-index: 0;
  @include scroll-bar();

  &__section {
    position: relative;

    & + & {
      margin-top: 6px;
    }
  }

  &__sentinel {
    height: 1px;
  }

  &__title {
    display: flex;
    align-items: center;
    font-size: 14px;
    padding: 0 6px;
    cursor: pointer;
    user-select: none;
    height: 36px;
    position: sticky;
    top: 0;
    z-index: 5;
    background: #ffffff;

    &.stuck {
      box-shadow: 0 1px 0 rgba(0, 0, 0, 0.06);
    }
  }

  &__arrow {
    width: 22px;
    display: inline-block;
    color: #aaa;

    i {
      display: inline-block;
      transition: transform 0.2s ease;
    }
  }

  &__count {
    margin-left: auto;
    font-size: 12px;
    background: #efefef;
    padding: 2px 6px;
    border-radius: 999px;

    &--new {
      background: var(--main-red-color);
      color: #fff;
    }
  }

  &__item {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 8px 6px;
    margin-left: 10px;
    border-radius: 6px;
    width: 100%;
    cursor: pointer;
    list-style: none;

    &:hover {
      background: #f7f7f7;
    }
  }

  &__item-content {
    display: flex;
    align-items: center;
    gap: 5px;
    width: 100%;
  }

  &__name {
    font-size: 14px;
    flex: 1 1 auto;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__message,
  &__sub {
    font-size: 12px;
    color: #888;
  }
}
</style>
