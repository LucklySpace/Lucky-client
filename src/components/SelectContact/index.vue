<template>
  <div class="contact-selection">
    <el-row :gutter="20">
      <el-col :span="12">
        <div class="contact-list">
          <!-- 搜索框（防抖） -->
          <el-input
            v-model="rawSearchText"
            :placeholder="$t('actions.search')"
            clearable
            style="width: 200px; margin-bottom: 8px"
          >
          </el-input>

          <!-- 虚拟列表容器 -->
          <div ref="boxRef" :aria-label="$t('selectContact.list')" class="vl-box" tabindex="0">
            <!-- 总高度占位 -->
            <div :style="{ height: totalHeight + 'px', position: 'relative' }">
              <div
                v-for="(row, idx) in visibleRows"
                :key="row.friendId"
                :style="{
                  height: rowHeight + 'px',
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: (startIndex + idx) * rowHeight + 'px',
                  padding: '0 8px'
                }"
                class="vl-box-item"
              >
                <div class="selection-item">
                  <el-row style="height: 40px; align-items: center">
                    <el-col :span="3" style="display: flex; align-items: center; justify-content: center">
                      <!-- 使用 Element Plus 的复选框（受控） -->
                      <el-checkbox
                        :aria-label="$t('selectContact.selecte')"
                        :model-value="!!selectedContacts[row.friendId]"
                        @change="val => onCheckboxToggle(row, val)"
                      />
                    </el-col>

                    <el-col :span="6" style="display: flex; align-items: center">
                      <el-image :src="row.avatar || defaultImg" class="selection-item-avatar" fit="cover" />
                    </el-col>

                    <el-col :span="15">
                      <div class="selection-item-name">{{ row.name }}</div>
                    </el-col>
                  </el-row>
                </div>
              </div>
            </div>
          </div>
        </div>
      </el-col>

      <el-col :span="12">
        <div class="selected-list">
          {{ $t("selectContact.selected", { count: selectItem.length }) }}

          <div ref="selectionRef" class="selection-item-container">
            <el-row :gutter="20">
              <el-col v-for="(item, index) in selectItem" :key="item.friendId" :span="8">
                <div style="position: relative">
                  <el-image
                    :alt="item.name"
                    :src="item.avatar || defaultImg"
                    class="member-avatar"
                    fit="cover"
                  ></el-image>
                  <el-button
                    :aria-label="`移除 ${item.name}`"
                    circle
                    class="cancel-el-btn"
                    icon=""
                    @click.stop="cancelSelection(item)"
                    @keydown.space.prevent="cancelSelection(item)"
                    @keydown.enter.prevent="cancelSelection(item)"
                  >
                    <!-- 你可以用图标组件替代文本 ×，这里用文本兼容性更好 -->
                    <span aria-hidden="true">X</span>
                  </el-button>
                </div>
                <div class="member-name">{{ item.name }}</div>
              </el-col>
            </el-row>
          </div>
          <div style="margin-top: 5px">
            <el-button type="primary" @click="handleComplete">{{ $t("actions.complete") }}</el-button>
            <el-button @click="handleCancel">{{ $t("actions.cancel") }}</el-button>
          </div>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
  import { useDebounceFn } from "@vueuse/core";
  import defaultImg from "@/assets/avatar/default.jpg";
  import { useFriendsStore } from "@/store/modules/friends";

  const emit = defineEmits<{
    (e: "handleAddGroupMember", payload: string[]): void;
    (e: "handleClose"): void;
  }>();

  // store
  const friendsStore = useFriendsStore();

  // 搜索（原始输入与防抖后的值）
  const rawSearchText = ref<string>("");
  const searchKey = ref<string>("");

  // 使用防抖函数，避免频繁过滤
  const setSearchKey = useDebounceFn((v: string) => {
    searchKey.value = v.trim().toLowerCase();
  }, 200);

  // watch 输入
  watch(rawSearchText, v => setSearchKey(v));

  // 选中状态映射：friendId -> boolean
  const selectedContacts = ref<Record<string, boolean>>({});

  // 已选项数组（用于展示）
  const selectItem = ref<any[]>([]);

  // 虚拟列表相关 refs
  const boxRef = ref<HTMLElement | null>(null);
  const selectionRef = ref<HTMLElement | null>(null);

  const rowHeight = ref<number>(60); // 每行高度（与样式中一致）
  const overscan = 3; // overscan 行数，提升滚动平滑度

  // 计算得到的 friend 列表（从 store 中读取并按搜索过滤）
  // 假设 friendsStore.friendList 是一个 map: { id: memberObj }
  const friendList = computed<any[]>(() => {
    const map = friendsStore.contacts || {};
    const arr = Object.values(map) as any[];
    if (!searchKey.value) return arr;
    const q = searchKey.value;
    return arr.filter(m => (m.name || "").toLowerCase().includes(q) || (m.friendId || "").toString().includes(q));
  });

  // 虚拟列表：总高度
  const totalHeight = computed(() => friendList.value.length * rowHeight.value);

  // 当前滚动偏移（像素）
  const scrollTop = ref(0);

  // 容器高度（像素），默认 300（与样式中 .vl-box 一致），会在 mounted 读取实际高度
  const containerHeight = ref<number>(300);

  // 计算当前 startIndex 与可见数量
  const startIndex = computed(() => {
    const idx = Math.floor(scrollTop.value / rowHeight.value);
    return Math.max(0, idx);
  });
  const visibleCount = computed(() => {
    return Math.min(friendList.value.length, Math.ceil(containerHeight.value / rowHeight.value) + overscan);
  });

  // 可见的数据切片（带 index，方便渲染）
  const visibleRows = computed(() => {
    const s = startIndex.value;
    const end = Math.min(friendList.value.length, s + visibleCount.value);
    return friendList.value.slice(s, end);
  });

  // 滚动监听（使用 requestAnimationFrame 节流渲染）
  let rafId: number | null = null;

  function onScrollOnce() {
    if (!boxRef.value) return;
    const st = boxRef.value.scrollTop;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      scrollTop.value = st;
      rafId = null;
    });
  }

  // 当用户点击复选框或 el-checkbox 变化时切换选中状态（统一入口）
  function onCheckboxToggle(item: any, checked?: any) {
    const id = item.friendId;
    // 如果 change 事件传入明确的布尔值则以该值为准；否则切换
    const newVal = typeof checked === "boolean" ? checked : !selectedContacts.value[id];
    selectedContacts.value = { ...selectedContacts.value, [id]: newVal };
  }

  // 取消选择（从已选列表中移除）
  function cancelSelection(item: any) {
    const id = item.friendId;
    if (selectedContacts.value[id]) {
      // 明确设为 false（使用 immutable 更新以触发 watch）
      selectedContacts.value = { ...selectedContacts.value, [id]: false };
    }
  }

  // watch selectedContacts，同步 selectItem 列表（去重）
  watch(
    () => selectedContacts.value,
    map => {
      const ids = Object.keys(map).filter(k => map[k]);
      // 根据 ids 构建 selectItem
      const picked = ids
        .map(id => {
          // 从 friendList 中找到对应对象（如果不存在则跳过）
          return friendList.value.find(m => String(m.friendId) === String(id));
        })
        .filter(Boolean);
      selectItem.value = picked as any[];
    },
    { deep: true }
  );

  // 点击完成：emit friendId 数组并关闭
  function handleComplete() {
    if (!selectItem.value.length) return;
    const arr = selectItem.value.map((i: any) => i.friendId);
    emit("handleAddGroupMember", arr);
    emit("handleClose");
  }

  // 取消
  function handleCancel() {
    emit("handleClose");
  }

  // 初始化：挂载滚动监听、设置容器高度、恢复选中（如果有）
  onMounted(async () => {
    // 读取实际容器高度（兼容样式）
    await nextTick();
    if (boxRef.value) {
      containerHeight.value = boxRef.value.clientHeight || containerHeight.value;
      boxRef.value.addEventListener("scroll", onScrollOnce, { passive: true });
    }
  });

  // 卸载：清理监听与 RAF
  onBeforeUnmount(() => {
    if (boxRef.value) boxRef.value.removeEventListener("scroll", onScrollOnce);
    if (rafId) cancelAnimationFrame(rafId);
  });
</script>

<style lang="scss" scoped>
  /* 定义滚动条宽度 */
  @mixin scroll-bar($width: 8px) {
    /* 隐藏滚动条按钮 */
    &::-webkit-scrollbar-button {
      display: none;
    }

    /* 背景色为透明 */
    &::-webkit-scrollbar-track {
      border-radius: 10px;
      background-color: transparent;
    }

    &::-webkit-scrollbar {
      width: $width;
      background-color: transparent;
    }

    &::-webkit-scrollbar-thumb {
      border-radius: 10px;
      background-color: rgba(0, 0, 0, 0.2);
    }
  }

  .vl-box {
    height: 300px;
    border-right: 1px solid var(--side-border-right-color);
    overflow: auto;
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
    //width: 100%;
  }

  .vl-box-item {
    box-sizing: border-box;
    width: 100%;
    padding: 0px 0px 5px 0px;
  }

  .contact-selection {
    padding: 10px;
    height: 320px;
  }

  .contact-list h3,
  .selected-list h3 {
    margin-bottom: 20px;
  }

  .selected-list {
    text-align: center;
    padding-top: 5px;
  }

  .selection-item {
    height: 40px;
    width: 100%;
    cursor: pointer;
  }

  .selection-item-avatar {
    width: 35px;
    height: 35px;
    //position: relative;
    margin: 5px;
  }

  .selection-item-name {
    line-height: 40px;
    font-size: 14px;
    font-weight: 530;
  }

  .selection-item-checkbox {
    background-color: #2c6fd4;
    margin-top: 18px;
  }

  h4 {
    margin-top: 0px;
  }

  .selection-item-container {
    overflow-y: scroll;
    overflow-x: hidden;
    height: 250px;
    width: 100%;
    @include scroll-bar();
  }

  .member-name {
    height: 20px;
    line-height: 20px;
    margin-top: 5px;
    font-size: 12px;
    overflow: hidden;
    text-align: center;
  }

  .member-avatar {
    width: 45px;
    height: 45px;
    margin-top: 5px;
    border: 1px solid #eee;
    border-radius: 2px;
    object-fit: cover;
  }

  .cancel-el-btn {
    position: absolute;
    top: 0px;
    right: 3px;
    // min-width: 22px;
    // height: 22px;
    padding: 0;
    line-height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #ccc;
    color: #fff;
    border: none;
    transition: background-color 0.18s, transform 0.12s;

    /* 避免 el-button 默认样式覆盖 */
    // &.is-circle {
    //   border-radius: 50%;
    // }

    &:hover {
      background-color: #aaa;
      // transform: scale(1.05);
    }

    &:focus-visible {
      box-shadow: 0 0 0 3px rgba(63, 148, 234, 0.25);
    }
  }

  .el-button.is-circle {
    border-radius: 50%;
    padding: 8px;
    width: 16px;
    height: 16px;
  }

  // .cancel-icon {
  //   position: absolute;
  //   // top: 2px;
  //   // right: 0px;
  //   top: 0px;
  //   right: 2px;
  //   font-size: 20px;
  //   border: 1px solid #ccc;
  //   border-radius: 50%;
  //   font-weight: 100;
  //   width: 15px;
  //   height: 15px;
  //   background-color: #ccc;
  //   color: #fff;
  //   display: flex;
  //   align-items: center;
  //   justify-content: center;
  //   text-align: center;
  //   cursor: pointer;
  // }

  // .cancel-icon:hover {
  //   background-color: #aaa;
  // }

  /* 保留你原生 checkbox 样式规则，但现在我们使用 el-checkbox，所以下面规则不会影响 el-checkbox */
  input[type="checkbox"] {
    cursor: pointer;
    position: relative;
    width: 15px;
    height: 15px;
    font-size: 14px;
  }

  input[type="checkbox"]::after {
    position: absolute;
    top: 0;
    color: #000;
    width: 15px;
    height: 15px;
    display: inline-block;
    visibility: visible;
    padding-left: 0px;
    text-align: center;
    content: " ";
    border-radius: 3px;
  }

  input[type="checkbox"]:checked::after {
    content: "\2714";
    font-size: 12px;
    line-height: 15px;
    color: #fff;
    background-color: #3f94ea;
  }
</style>
