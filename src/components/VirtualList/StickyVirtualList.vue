<template>
  <div ref="listWrapper" :style="{ height: containerHeight }" class="sticky-virtual-list-container">
    <!-- 固定标题区域 -->
    <div v-if="stickyTitle" class="sticky-title">
      <slot :title="stickyTitle" name="sticky-title"></slot>
    </div>

    <!-- 虚拟列表容器 -->
    <div
      ref="listContent"
      :style="{ paddingTop: stickyTitle ? stickyHeight + 'px' : '0px' }"
      class="list-content"
      @scroll="handleScroll"
    >
      <!-- 虚拟占位元素 -->
      <div ref="phantom" class="list-phantom"></div>

      <!-- 实际渲染的内容 -->
      <div
        ref="content"
        :style="{ transform: `translateY(${startOffset}px)` }"
        class="list-content-wrapper"
      >
        <div
          v-for="(item, index) in visibleData"
          :key="getItemKey(item, startIndex + index)"
          :ref="el => setItemRef(el, startIndex + index)"
          :style="{ height: getItemHeight(item) + 'px' }"
          class="list-item"
        >
          <slot :index="startIndex + index" :isSticky="isItemSticky(item)" :item="item"></slot>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onMounted, onUpdated, ref, watch } from "vue";

  export interface StickyVirtualListProps {
    listData: Array<Record<string, any>>;
    estimatedItemSize: number;
    containerHeight?: string;
    bufferScale?: number;
    enableSticky?: boolean;
    stickyHeight?: number;
    getItemKey?: (item: any, index: number) => string | number;
    getItemHeight?: (item: any) => number;
    isStickyItem?: (item: any) => boolean;
    getItemTitle?: (item: any) => string;
  }

  interface PositionType {
    index: number;
    height: number;
    top: number;
    bottom: number;
    isSticky: boolean;
    title?: string;
  }

  const props = withDefaults(defineProps<StickyVirtualListProps>(), {
    estimatedItemSize: 60,
    containerHeight: "100%",
    bufferScale: 1,
    enableSticky: true,
    stickyHeight: 50,
    getItemKey: (item: any, index: number) => item.id || item.messageId || index,
    getItemHeight: (item: any) => item.height || 60,
    isStickyItem: (item: any) => item.isSticky || item.isTitle || false,
    getItemTitle: (item: any) => item.title || item.name || ""
  });

  const emit = defineEmits<{
    (e: "scroll", scrollTop: number): void
    (e: "reachBottom"): void
    (e: "stickyChange", title: string | null): void
  }>();

  // 响应式数据
  const listWrapper = ref<HTMLElement | null>(null);
  const listContent = ref<HTMLElement | null>(null);
  const phantom = ref<HTMLElement | null>(null);
  const content = ref<HTMLElement | null>(null);
  const itemRefs = ref<Map<number, HTMLElement>>(new Map());

  // 状态数据
  const positions = ref<PositionType[]>([]);
  const startIndex = ref(0);
  const endIndex = ref(0);
  const startOffset = ref(0);
  const visibleCount = ref(0);
  const containerHeight = ref(0);
  const scrollTop = ref(0);

  // 固定标题相关
  const stickyTitle = ref<string | null>(null);
  const stickyOffset = ref(0);

  // 计算属性
  const visibleData = computed(() => {
    const start = Math.max(0, startIndex.value - props.bufferScale);
    const end = Math.min(props.listData.length, endIndex.value + props.bufferScale);
    return props.listData.slice(start, end);
  });

  // 初始化位置数据
  const initPositions = () => {
    const newPositions: PositionType[] = [];
    let currentTop = 0;

    props.listData.forEach((item, index) => {
      const height = props.getItemHeight(item);
      const isSticky = props.isStickyItem(item);
      const title = props.getItemTitle(item);

      newPositions.push({
        index,
        height,
        top: currentTop,
        bottom: currentTop + height,
        isSticky,
        title
      });

      currentTop += height;
    });

    positions.value = newPositions;
  };

  // 二分查找滚动位置对应的索引
  const binarySearch = (scrollTop: number): number => {
    const positions = positions.value;
    let left = 0;
    let right = positions.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const position = positions[mid];

      if (position.top <= scrollTop && position.bottom > scrollTop) {
        return mid;
      } else if (position.top > scrollTop) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    return Math.min(left, positions.length - 1);
  };

  // 更新可见范围
  const updateVisibleRange = () => {
    const scrollTop = listContent.value?.scrollTop || 0;
    const containerHeight = listContent.value?.clientHeight || 0;

    startIndex.value = binarySearch(scrollTop);
    endIndex.value = Math.min(
      startIndex.value + visibleCount.value,
      props.listData.length
    );

    if (startIndex.value > 0) {
      startOffset.value = positions.value[startIndex.value - 1].bottom;
    } else {
      startOffset.value = 0;
    }

    updateStickyTitle(scrollTop);
  };

  // 更新固定标题
  const updateStickyTitle = (scrollTop: number) => {
    if (!props.enableSticky) {
      stickyTitle.value = null;
      return;
    }

    let currentTitle: string | null = null;

    for (let i = positions.value.length - 1; i >= 0; i--) {
      const position = positions.value[i];
      if (position.isSticky && position.top <= scrollTop) {
        currentTitle = position.title || null;
        break;
      }
    }

    if (stickyTitle.value !== currentTitle) {
      stickyTitle.value = currentTitle;
      emit("stickyChange", currentTitle);
    }
  };

  // 更新项目尺寸
  const updateItemSizes = () => {
    itemRefs.value.forEach((el, index) => {
      if (el && positions.value[index]) {
        const rect = el.getBoundingClientRect();
        const height = rect.height;
        const oldHeight = positions.value[index].height;

        if (Math.abs(height - oldHeight) > 1) {
          positions.value[index].height = height;
          positions.value[index].bottom = positions.value[index].top + height;

          for (let i = index + 1; i < positions.value.length; i++) {
            positions.value[i].top = positions.value[i - 1].bottom;
            positions.value[i].bottom = positions.value[i].top + positions.value[i].height;
          }

          if (phantom.value && positions.value.length > 0) {
            phantom.value.style.height = positions.value[positions.value.length - 1].bottom + "px";
          }
        }
      }
    });
  };

  // 设置项目引用
  const setItemRef = (el: HTMLElement | null, index: number) => {
    if (el) {
      itemRefs.value.set(index, el);
    }
  };

  // 处理滚动事件
  const handleScroll = (e: Event) => {
    const target = e.target as HTMLElement;
    scrollTop.value = target.scrollTop;

    requestAnimationFrame(() => {
      updateVisibleRange();
    });

    emit("scroll", target.scrollTop);

    if (target.scrollTop + target.clientHeight >= target.scrollHeight - 1) {
      emit("reachBottom");
    }
  };

  // 滚动到指定位置
  const scrollTo = (index: number, behavior: ScrollBehavior = "auto") => {
    if (positions.value[index]) {
      const scrollTop = positions.value[index].top;
      listContent.value?.scrollTo({
        top: scrollTop,
        behavior
      });
    }
  };

  // 滚动到底部
  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    if (listContent.value) {
      listContent.value.scrollTop = listContent.value.scrollHeight;
    }
  };

  // 暴露方法
  defineExpose({
    scrollTo,
    scrollToBottom,
    updateVisibleRange
  });

  // 生命周期
  onMounted(() => {
    if (listContent.value) {
      containerHeight.value = listContent.value.clientHeight;
      visibleCount.value = Math.ceil(containerHeight.value / props.estimatedItemSize);
      initPositions();
      updateVisibleRange();

      if (phantom.value && positions.value.length > 0) {
        phantom.value.style.height = positions.value[positions.value.length - 1].bottom + "px";
      }
    }
  });

  onUpdated(() => {
    nextTick(() => {
      updateItemSizes();
    });
  });

  // 监听数据变化
  watch(
    () => props.listData.length,
    () => {
      nextTick(() => {
        initPositions();
        updateVisibleRange();

        if (phantom.value && positions.value.length > 0) {
          phantom.value.style.height = positions.value[positions.value.length - 1].bottom + "px";
        }
      });
    }
  );

  watch(
    () => props.listData,
    () => {
      nextTick(() => {
        initPositions();
        updateVisibleRange();

        if (phantom.value && positions.value.length > 0) {
          phantom.value.style.height = positions.value[positions.value.length - 1].bottom + "px";
        }
      });
    },
    { deep: true }
  );
</script>

<style scoped>
  .sticky-virtual-list-container {
    position: relative;
    height: 100%;
    overflow: hidden;
  }

  .sticky-title {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 10;
    background: var(--el-bg-color, #ffffff);
    border-bottom: 1px solid var(--el-border-color-light, #e4e7ed);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .list-content {
    height: 100%;
    overflow-y: auto;
    position: relative;
  }

  .list-phantom {
    position: absolute;
    left: 0;
    top: 0;
    right: 0;
    z-index: -1;
  }

  .list-content-wrapper {
    position: relative;
  }

  .list-item {
    width: 100%;
    box-sizing: border-box;
  }
</style>
