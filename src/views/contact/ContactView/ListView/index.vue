<template>
  <div ref="boxRef" v-memo="offsetData" class="vl-box" @scroll="handleScroll">
    <div :style="{ height: boxHeight + 'px' }">
      <div v-for="(item, index) in offsetData"
           :key="index"
           :style="{ height: rowHeight + 'px', top: (index + offsetIndex) * rowHeight + 'px' }" class="vl-box-item">
        <slot :index="index" :item="item"></slot>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>

  const boxRef = ref(); // 容器dom

  const props = defineProps({
    rowHeight: {
      type: Number,
      default: 60
    },
    data: {
      type: Array,
      default: () => []
    }
  });

  const offset = ref(0); // 偏移
  const offsetIndex = ref(0); // 偏移下标
  //const windowHeight = ref(document.documentElement.clientHeight); // 窗口高度
  const { height: windowHeight } = useWindowSize(); // 使用 VueUse 的窗口高度
  const boxHeight = computed(() => props.data.length * props.rowHeight); // 总高度

  const offsetData = computed(() => {
    const data = props.data;
    if (!data || data.length <= 0) return [];
    const count = Math.ceil(windowHeight.value / props.rowHeight);
    const index = Math.floor(offset.value / props.rowHeight);
    offsetIndex.value = index;
    return data.slice(index, count + index);
  });

  const handleScroll = () => {
    requestAnimationFrame(() => {
      offset.value = boxRef.value.scrollTop;
    });
  };

</script>


<style lang="scss" scoped>
  /* 定义滚动条宽度 */
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
      background-color: rgba(0, 0, 0, 0.1);
    }
  }

  .active {
    background-color: #ddd;
  }


  .vl-box {
    border-right: 1px solid var(--side-border-right-color);
    overflow-y: scroll;
    bottom: 0px;
    @include scroll-bar();
  }

  .vl-box::-webkit-scrollbar-button:decrement {
    display: none;
  }

  .vl-box > div {
    overflow: hidden;
    position: relative;
  }

  .vl-box > div > div {
    position: absolute;
    width: 100%;
  }

  .vl-box-item {
    box-sizing: border-box;
  }
</style>