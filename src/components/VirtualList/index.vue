<template>
  <div ref="listWrapper" :style="{ height: containerHeight }" class="infinite-list-container">
    <!-- 固定标题区域 -->
    <div v-if="stickyTitle" class="sticky-title">
      <slot :title="stickyTitle" name="sticky-title"></slot>
    </div>

    <div ref="listContent" class="list-content" @scroll="(e) => scrollEvent(e)">
      <div ref="phantom" class="infinite-list-phantom"></div>
      <div ref="content" class="infinite-list">
        <div v-for="(item, index) in visibleData" :id="String(index)" :key="index" ref="items"
             class="infinite-list-item">
          <slot :index="index" :isSticky="isItemSticky(item)" :item="item"></slot>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onMounted, onUpdated, ref, watch } from "vue";

  export interface PropsType {
    listData?: Array<Record<string, any>>;
    estimatedItemSize: number;
    bufferScale?: number;
    containerHeight?: string;
    useLoading?: boolean;
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

  const props = withDefaults(defineProps<PropsType>(), {
    listData: () => [], //所有列表数据
    estimatedItemSize: 100, //预估高度
    bufferScale: 3, //缓冲区比例
    containerHeight: "100%", // 容器高度 100px
    useLoading: false, // 是否使用 loading 动画
    enableSticky: true, // 是否启用固定标题
    stickyHeight: 50, // 固定标题高度
    getItemKey: (item: any, index: number) => item.id || item.messageId || index,
    getItemHeight: (item: any) => item.height || 100,
    isStickyItem: (item: any) => item.isSticky || item.isTitle || false,
    getItemTitle: (item: any) => item.title || item.name || ""
  });

  const emit = defineEmits<{
    (e: "reachBottom"): void
    (e: "scroll", scrollTop: number): void
    (e: "stickyChange", title: string | null): void
  }>();

  let positions: PositionType[];
  let screenHeight = 0;
  let visibleCount = 0;
  const start = ref(0);
  const end = ref(0);
  const items = ref<HTMLElement[] | null>(null);
  const phantom = ref<HTMLElement | null>(null);
  const listWrapper = ref<HTMLElement | null>(null);
  const listContent = ref<HTMLElement | null>(null);
  const content = ref<HTMLElement | null>(null);
  const aboveCount = ref(0);
  const belowCount = ref(0);

  // 固定标题相关
  const stickyTitle = ref<string | null>(null);
  const stickyOffset = ref(0);


  const visibleData = computed(() => {
    let newStart = start.value - aboveCount.value;
    let newEnd = end.value + belowCount.value;
    return props.listData.slice(newStart, newEnd);
  });

  function createPositions(start: number, end: number) {
    let list: PositionType[] = [];
    let currentTop = start * props.estimatedItemSize;

    for (let index = start; index < end; index++) {
      const item = props.listData[index];
      const height = props.getItemHeight(item);
      const isSticky = props.isStickyItem(item);
      const title = props.getItemTitle(item);

      list.push({
        index,
        height,
        top: currentTop,
        bottom: currentTop + height,
        isSticky,
        title
      });

      currentTop += height;
    }
    return list;
  }

  function binarySearch(list: PositionType[], val: number) {
    let startVal = 0;
    let endVal = list.length - 1;
    let tempIndex = null;

    while (startVal <= endVal) {
      let midIndex = ~~((startVal + endVal) / 2);
      let midValue = list[midIndex].bottom;
      if (midValue === val) {
        return midIndex + 1;
      } else if (midValue < val) {
        startVal = midIndex + 1;
      } else if (midValue > val) {
        if (tempIndex === null || tempIndex > midIndex) {
          tempIndex = midIndex;
        }
        endVal = endVal - 1;
      }
    }
    return Number(tempIndex);
  }

  function updateItemsSize() {
    let nodes = items.value;
    nodes!.forEach((node) => {
      let rect = node.getBoundingClientRect();
      let height = rect.height;
      let index = +node.id.slice(1);
      let oldHeight = positions[index].height;
      let dValue = oldHeight - height;
      //存在差值
      if (dValue) {
        positions[index].bottom = positions[index].bottom - dValue;
        positions[index].height = height;
        for (let k = index + 1; k < positions.length; k++) {
          positions[k].top = positions[k - 1].bottom;
          positions[k].bottom = positions[k].bottom - dValue;
        }
      }
    });
  }

  function setStartOffset() {
    let startOffset;
    if (start.value >= 1) {
      let size =
        positions[start.value].top -
        (positions[start.value - aboveCount.value]
          ? positions[start.value - aboveCount.value].top
          : 0);
      startOffset = positions[start.value - 1].bottom - size;
    } else {
      startOffset = 0;
    }
    content.value!.style.transform = `translateY(${startOffset}px)`;
  }

  function scrollEvent(e: Event) {
    //当前滚动位置
    let innerScrollTop = (e.target as HTMLElement).scrollTop;
    let innerScrollHeight = (e.target as HTMLElement).scrollHeight;
    //此时的开始索引
    start.value = binarySearch(positions, innerScrollTop);
    //此时的结束索引
    end.value = start.value + visibleCount;
    //此时的偏移量
    setStartOffset();

    // 更新固定标题
    updateStickyTitle(innerScrollTop);

    // 发出滚动事件
    emit("scroll", innerScrollTop);

    if (screenHeight + innerScrollTop >= innerScrollHeight - 1) {
      console.log("reach bottom");
      emit("reachBottom");
    }
  }

  // 更新固定标题
  function updateStickyTitle(scrollTop: number) {
    if (!props.enableSticky) {
      stickyTitle.value = null;
      return;
    }

    // 找到当前滚动位置对应的标题
    let currentTitle: string | null = null;

    for (let i = positions.length - 1; i >= 0; i--) {
      const position = positions[i];
      if (position.isSticky && position.top <= scrollTop) {
        currentTitle = position.title || null;
        break;
      }
    }

    if (stickyTitle.value !== currentTitle) {
      stickyTitle.value = currentTitle;
      emit("stickyChange", currentTitle);
    }
  }

  // 判断项目是否为固定标题
  function isItemSticky(item: any): boolean {
    return props.isStickyItem(item);
  }

  positions = createPositions(0, props.listData.length);

  onMounted(() => {

    start.value = 0;
    end.value = start.value + visibleCount;
    screenHeight = listWrapper.value!.clientHeight;
    visibleCount = screenHeight / props.estimatedItemSize;
    aboveCount.value = Math.min(start.value, props.bufferScale * visibleCount);
    belowCount.value = Math.min(props.listData.length - end.value, props.bufferScale * visibleCount);
  });

  onUpdated(() => {
    nextTick(function() {
      if (!items.value || !items.value?.length) {
        return;
      }
      //获取真实元素大小，修改对应的尺寸缓存
      updateItemsSize();
      //更新列表总高度
      let height = positions[positions.length - 1].bottom;
      phantom.value!.style.height = height + "px";
      //更新真实偏移量
      setStartOffset();
    });
  });

  watch(
    () => props.listData.length,
    (newLen, oldLen) => {
      positions = positions.concat(createPositions(oldLen, newLen));
    }
  );
</script>

<style scoped>
  .infinite-list-container {
    position: relative;
    height: 100%;
    overflow: hidden;
  }

  .list-content {
    height: 100%;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
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

  .infinite-list-phantom {
    position: absolute;
    left: 0;
    top: 0;
    right: 0;
    z-index: -1;
  }

  .infinite-list {
    left: 0;
    right: 0;
    top: 0;
    position: absolute;
  }
</style>