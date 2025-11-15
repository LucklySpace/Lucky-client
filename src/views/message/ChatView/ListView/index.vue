<template>
  <div ref="boxRef" v-memo="offsetData" class="vl-box" @scroll="handleScroll">
    <div :style="{ height: boxHeight + 'px' }">
      <div
        v-for="(item, index) in offsetData"
        :key="index"
        :style="{ height: rowHeight + 'px', top: (index + offsetIndex) * rowHeight + 'px' }"
        class="vl-box-item"
      >
        <slot :index="index + offsetIndex" :item="item"></slot>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  const boxRef = ref(null); // 容器dom

  const props = defineProps({
    rowHeight: {
      type: Number,
      default: 60
    },
    data: {
      type: Array,
      required: true,
      default: () => []
    }
  });

  const emit = defineEmits(["drag"]);

  const offset = ref(0); // 偏移
  const offsetIndex = ref(0); // 偏移下标

  const { height: windowHeight } = useWindowSize(); // 使用 VueUse 的窗口高度

  const boxHeight = computed(() => props.data.length * props.rowHeight); // 总高度

  const offsetData = computed(() => {
    const data = props.data;
    if (!data || data.length <= 0) return [];
    const count = Math.ceil(windowHeight.value / props.rowHeight);
    const index = Math.floor(offset.value / props.rowHeight);
    // 计算实际的偏移下标，这个下标代表 data 中实际的起始项
    offsetIndex.value = index;
    return data.slice(index, count + index);
  });

  const handleScroll = () => {
    requestAnimationFrame(() => {
      offset.value = (boxRef.value as any).scrollTop;
    });
  };
</script>

<style lang="scss" scoped>
  @use "@/assets/style/scss/index.scss" as *;

  //   .active {
  //     background-color: #ddd;
  //   }

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
