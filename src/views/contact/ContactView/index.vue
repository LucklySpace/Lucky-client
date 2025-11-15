<!--虚拟列表title固定-->
<template>
  <div class="addr">
    <div v-for="(key, idx) in keys" :key="key" class="group">
      <!-- sentinel 用来让 IntersectionObserver 判断是否已粘贴 -->
      <div :ref="el => setSentinel(el, idx)" :data-idx="idx" class="sticky-sentinel"></div>

      <div :ref="el => setTitleRef(el, idx)" class="title" @click="toggle(key)">
        <span class="arrow">
          <i
            :style="{ transform: isOpen[key] ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }"
            class="iconfont icon-right"
          ></i>
        </span>
        <span>{{ meta.titles[key] }}</span>
        <span v-if="meta.counts[key]" :class="{ new: key == 'newFriends' && !store.ignore }" class="count">{{
            meta.counts[key]
          }}</span>
      </div>

      <!--
        使用自定义虚拟列表 (VirtualList) 优化渲染：
        - 不会为每个 item 渲染真实 DOM，只有可视区上下 buffer 范围内的项目会被渲染。
        - VirtualList 不会在自身创建滚动条，而是监听外层滚动容器（.addr）的滚动位置，
          这样 position: sticky 可以正常工作（标题依然粘性定位于 .addr 的顶部）。
      -->
      <VirtualList v-if="isOpen[key]" :buffer="5" :item-height="64" :items="store[key] ?? []" root-selector=".addr">
        <!-- 默认插槽：接收 item,index -->
        <template #default="{ item }">
          <li class="item" @click="onItemClick(item, key)">
            <div class="txt no-select">
              <div class="avatar">
                <Avatar
                  :avatar="item.avatar || ''"
                  :name="displayName(item, key)"
                  :width="36"
                  :borderRadius="6"
                  :backgroundColor="key === 'groups' ? '#ffb36b' : undefined"
                />
              </div>
              <div class="name">{{ safeName(displayName(item, key)) }}</div>
              <div v-if="item.message" class="message">{{ item.message }}</div>
              <div v-if="item.memberCount" class="sub">{{ $t("contacts.count", { count: item.memberCount }) }}</div>
            </div>
          </li>
        </template>
      </VirtualList>

      <!-- 当分组为空时显示空状态（可选） -->
      <!-- <ul v-if="isOpen[key] && (store[key]?.length ?? 0) === 0" class="list">
        <li class="empty">暂无内容</li>
      </ul> -->
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, h, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
  import { useFriendsStore } from "@/store/modules/friends";
  import { useChatStore } from "@/store/modules/chat";
  import { useI18n } from "vue-i18n";
  import Avatar from "@/components/Avatar/index.vue";
  import { IMessageType } from "@/constants";

  const chatStore = useChatStore();

  const groupInfo = computed(() => {
    const { currentChat } = chatStore;
    if (currentChat?.chatType == IMessageType.GROUP_MESSAGE.code) {
      return { name: currentChat?.name, notification: currentChat?.notification };
    }
    return {};
  });
  /**
   * keys + 联合类型 Key
   */
  const keys = ["newFriends", "groups", "contacts"] as const;
  type Key = (typeof keys)[number];

  const { t } = useI18n();
  const store = useFriendsStore();

  // const query = ref("");
  const isOpen = ref<Record<Key, boolean>>({
    newFriends: false,
    groups: false,
    contacts: false
  });

  const meta = computed(() => ({
    titles: {
      newFriends: t("contacts.newFriends"),
      groups: t("contacts.groupChat"),
      contacts: t("contacts.contacts")
    },
    counts: {
      newFriends: store.getTotalNewFriends ?? 0,
      groups: store.groups?.length ?? 0,
      contacts: store.contacts?.length ?? 0
    }
  }));

  const safeName = (name: string) => {
    const newName = name?.trim() ?? "未知用户";

    // 限制名称长度，超出显示省略号
    const maxLength = 6;
    return newName.length > maxLength ? name.substring(0, maxLength) + "..." : newName;
  };

  // 群项显示名：优先取 chats.name，其次回退 item.name/groupName
  function getGroupName(item: any): string {
    const gid = item?.groupId || item?.id;
    if (gid) {
      const c = chatStore.chatList.find(c => String(c.chatId) === String(gid));
      if (c?.name) return c.name;
    }
    return item?.name ?? item?.groupName ?? "";
  }

  // 统一的显示名：分组判断
  function displayName(item: any, key: Key): string {
    return key === 'groups' ? getGroupName(item) : (item?.remark ?? item?.name ?? '');
  }

  function toggle(key: Key) {
    isOpen.value[key] = !isOpen.value[key];
  }

  function onItemClick(item: any, key: Key) {
    store.type = key;
    store.shipInfo = item;
  }

  const titleRefs = ref<HTMLElement[]>([]);
  const sentinelRefs = ref<HTMLElement[]>([]);

  function setTitleRef(el: HTMLElement | null | any, idx: number) {
    if (el) titleRefs.value[idx] = el;
  }

  function setSentinel(el: HTMLElement | null | any, idx: number) {
    if (el) sentinelRefs.value[idx] = el;
  }

  let observer: IntersectionObserver | null = null;

  onMounted(() => {
    // 数据懒加载
    if ((store.newFriends?.length ?? 0) === 0 && store.loadNewFriends) store.loadNewFriends();
    if ((store.groups?.length ?? 0) === 0 && store.loadGroups) store.loadGroups();
    if ((store.contacts?.length ?? 0) === 0 && store.loadContacts) store.loadContacts();

    // IntersectionObserver: 当 sentinel 离开视口（即 title 到达顶部）时给 title 加 .stuck
    observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          const idxAttr = (entry.target as HTMLElement).dataset.idx;
          if (!idxAttr) continue;
          const idx = Number(idxAttr);
          const titleEl = titleRefs.value[idx];
          if (!titleEl) continue;

          if (entry.boundingClientRect.top < 0 && titleEl.classList) {
            titleEl.classList.add("stuck");
          } else {
            titleEl.classList.remove("stuck");
          }
        }
      },
      {
        root: null, // 监听视窗（也可以设置为 .addr）
        threshold: [0]
      }
    );

    // 注册所有 sentinel
    sentinelRefs.value.forEach((s:any )=> {
      if (s) observer!.observe(s);
    });
  });


  onBeforeUnmount(() => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  });

  /* ==================================================================================
   自定义虚拟列表组件：VirtualList
   设计要点：
   - 不在自身创建滚动条（outer .addr 才滚动），这样 .title 的 position: sticky 才能正常工作。
   - 通过 root-selector 传入外层滚动容器选择器（默认 .addr）。
   - 根据外层滚动位置计算 startIndex，渲染可视区 + buffer 的 items，其他项不渲染。
   - 使用一个高度为 items.length * itemHeight 的占位容器占位，内部绝对定位渲染可见 items。
   - 提供默认插槽：slotProps = { item, index }
   - 使用 render 函数实现，从而方便在同一个文件内声明组件。
   ==================================================================================*/

  const VirtualList = defineComponent({
    name: "VirtualList",
    props: {
      items: { type: Array, required: true },
      itemHeight: { type: Number, default: 56 },
      buffer: { type: Number, default: 5 },
      rootSelector: { type: String, default: ".addr" },
      groupKey: { type: String, default: "" } // 可选：用于生成跨组唯一 key
    },
    setup(props, { slots }) {
      // root 滚动容器（.addr）
      const rootEl = ref<HTMLElement | null>(null);
      // 当前滚动容器的 scrollTop（全局）
      const rootScrollTop = ref(0);

      // hostRef：绑定到每个 VirtualList 最外层 wrapper，用来测量该组在 root 中的 offset
      const hostRef = ref<HTMLElement | null>(null);

      // 扁平 items（本组件不处理树，这里假设 items 已是本组的可见项数组）
      const totalHeight = computed(() => (props.items?.length ?? 0) * props.itemHeight);

      // 本组相对于 root 的 top（document 浮动位置 -> 每次滚动/resize 需重新测量）
      function measureHostOffset(): number {
        if (!hostRef.value || !rootEl.value) return 0;
        const hostRect = hostRef.value.getBoundingClientRect();
        const rootRect = rootEl.value.getBoundingClientRect();
        // 计算 host 的 content 起点在 root scroll 内容中的偏移：
        // root.scrollTop 是滚动量，rootRect.top 是 root 在视口的 top
        // hostRect.top - rootRect.top + root.scrollTop === host 的内容到 root 内容顶部的距离
        return hostRect.top - rootRect.top + rootEl.value.scrollTop;
      }

      // 计算组内局部 scroll（用于求 startIndex）
      function computeLocalScroll(): number {
        const hostOffset = measureHostOffset();
        const local = rootScrollTop.value - hostOffset;
        return local > 0 ? local : 0;
      }

      // visibleCount 基于 root 高度（保守估计）
      const visibleCount = computed(() => {
        const root = rootEl.value;
        const viewH = (root ? root.clientHeight : 400) || 400;
        return Math.ceil(viewH / props.itemHeight) + props.buffer * 2;
      });

      // startIndex / endIndex 基于 localScroll 计算
      const startIndex = ref(0);
      const endIndex = ref(0);

      function recomputeRange() {
        const localScroll = computeLocalScroll();
        const s = Math.max(0, Math.floor(localScroll / props.itemHeight) - props.buffer);
        const e = Math.min(props.items?.length ?? 0, s + visibleCount.value);
        startIndex.value = s;
        endIndex.value = Math.max(s, e);
      }

      // RAF 防抖滚动处理
      let rafId: number | null = null;

      function onRootScroll() {
        if (!rootEl.value) return;
        rootScrollTop.value = rootEl.value.scrollTop;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          recomputeRange();
          rafId = null;
        });
      }

      // 初始化 rootEl、绑定 scroll、ResizeObserver（测量 host offset）
      onMounted(() => {
        nextTick(() => {
          rootEl.value = (hostRef.value ? hostRef.value.closest(props.rootSelector) : null) as HTMLElement | null;
          if (!rootEl.value) rootEl.value = document.querySelector(props.rootSelector) as HTMLElement | null;
          if (!rootEl.value) rootEl.value = document.scrollingElement as HTMLElement | null;

          if (!rootEl.value) return;

          // 初始化 scrollTop 并监听
          rootScrollTop.value = rootEl.value.scrollTop;
          rootEl.value.addEventListener("scroll", onRootScroll, { passive: true });

          // ResizeObserver：根容器或 host 发生尺寸/位置变化时重新计算
          if ((window as any).ResizeObserver) {
            const roRoot = new (window as any).ResizeObserver(() => {
              // 当 root 大小变更时，重新计算可视区与范围
              recomputeRange();
            });
            roRoot.observe(rootEl.value);

            const roHost = new (window as any).ResizeObserver(() => {
              // host 大小/位置变化（例如 title sticky），重新计算范围
              recomputeRange();
            });
            if (hostRef.value) roHost.observe(hostRef.value);

            onBeforeUnmount(() => {
              roRoot.disconnect();
              roHost.disconnect();
            });
          }

          // 首次计算
          recomputeRange();
        });
      });

      onBeforeUnmount(() => {
        if (rootEl.value) rootEl.value.removeEventListener("scroll", onRootScroll);
        if (rafId) cancelAnimationFrame(rafId);
      });

      // 监听 items 变化时刷新（例如展开/折叠插入或删除元素）
      watch(
        () => props.items,
        () => {
          // items 变更后可能导致 host offset 或 totalHeight 改变，强制 recompute
          nextTick(() => {
            recomputeRange();
          });
        },
        { deep: true }
      );

      // render：占位容器高度 = totalHeight，内部绝对定位显示 slice
      return () => {
        const wrapperStyle = { height: `${totalHeight.value}px`, position: "relative" } as any;

        // 切片
        const slice = (props.items ?? []).slice(startIndex.value, endIndex.value);

        const nodes = slice.map((item: any, i: number) => {
          const realIndex = startIndex.value + i;
          const top = realIndex * props.itemHeight;
          const itemStyle = {
            position: "absolute",
            left: "0",
            right: "0",
            top: `${top}px`,
            height: `${props.itemHeight}px`,
            display: "flex",
            width: "100%",
            alignItems: "center",
            boxSizing: "border-box"
          } as any;

          const uniqueKey = `${props.groupKey || "g"}-${item?.id ?? realIndex}`;
          if (slots.default) {
            return h("div", { key: uniqueKey, style: itemStyle }, [slots.default({ item, index: realIndex })]);
          }
          return h("div", { key: uniqueKey, style: itemStyle }, String(item));
        });

        // 外层绑定 hostRef：用于测量本组在 root 中的位置
        return h("div", { ref: hostRef, class: "virtual-list-wrapper" }, [h("div", { style: wrapperStyle }, nodes)]);
      };
    }
  });

  // 注册局部组件
  // 在 <script setup> 中直接使用组件名即可
</script>

<style lang="scss" scoped>
  /* 定义滚动条宽度 */
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

  .addr {
    max-width: 420px;
    margin: 0;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
    color: #222;
    border-right: 1px solid var(--side-border-right-color);
    overflow-y: auto;
    bottom: 0px;
    background: var(--content-bg-color, #fff); /* 确保 sticky 背景正确 */
    position: relative;
    z-index: 0;
    @include scroll-bar();
  }

  .group + .group {
    margin-top: 6px;
  }

  .group {
    position: relative; /* 方便内部 sticky 行为 */
  }

  /* sentinel 是一个 1px 高的占位元素，放在 title 之前用于 intersection 判断 */
  .sticky-sentinel {
    height: 1px;
  }

  /* 核心：让 title 粘性在容器顶部 */
  .title {
    display: flex;
    align-items: center;
    font-size: 14px;
    padding: 0px 6px;
    cursor: pointer;
    user-select: none;
    height: 36px;
    position: sticky;
    top: 0;
    z-index: 5;
    background: #ffffff;
    -webkit-backdrop-filter: blur(0px);
    backdrop-filter: blur(0px);

    .stuck {
      box-shadow: 0 1px 0 rgba(0, 0, 0, 0.06);
    }

    .arrow {
      width: 22px;
      display: inline-block;
      color: #aaa;
    }

    .count {
      margin-left: auto;
      font-size: 12px;
      background: #efefef;
      padding: 2px 6px;
      border-radius: 999px;

      &.new {
        background: var(--main-red-color);
        color: #fff;
        //box-shadow: 0 0 6px rgba(57, 186, 114, 0.18);
      }
    }
  }

  /* 列表样式：注意虚拟列表的 item 使用 .item 类，并且外层是占位容器（virtual-list-wrapper > div） */
  .list {
    list-style: none;
    padding: 0 6px 6px 28px;
    margin: 0;
  }

  .item {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 8px 6px;
    margin-left: 10px;
    border-radius: 6px;
    width: 100%;
    cursor: pointer;
  }

  .item:hover {
    background: #f7f7f7;
  }

  .av {
    width: 36px;
    height: 36px;
    border-radius: 6px;
    object-fit: cover;
  }

  .txt {
    display: flex;
    align-items: center;
    gap: 5px;
    width: 100%;
  }

  .avatar {
    width: 36px;
    flex: 0 0 36px;
  }
  .name {
    font-size: 14px;
    flex: 1 1 auto;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .message {
    font-size: 12px;
    color: #888;
  }

  .sub {
    font-size: 12px;
    color: #888;
  }

  .empty {
    padding: 8px 6px;
    color: #999;
    font-size: 13px;
  }

  /* 虚拟列表内部 wrapper（占位容器） */
  // .virtual-list-wrapper {
  //   /* 外层跟随文档流，不创建滚动条 */
  // }
</style>
