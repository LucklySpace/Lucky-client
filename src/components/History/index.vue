<template>
  <el-dialog
    :close-on-click-modal="false"
    :model-value="visible"
    :title="title"
    style="height: 76%"
    width="65%"
    @close="handleClose"
  >
    <div class="search-container">
      <el-input v-model="searchStr" clearable @input="handleSearch" @keyup.enter.native="handleSearch">
        <template #prefix>
          <i slot="prefix" class="iconfont icon-sousuo"></i>
        </template>
      </el-input>
    </div>

    <div class="history-container">
      <div v-for="item in data" :key="item.id">
        <HistoryItem :data="item"></HistoryItem>
      </div>
    </div>

    <div class="pagination-container">
      <Pagination
        :limit="pageInfo.pageSize"
        :page="pageInfo.currentPage"
        :total="pageInfo.total"
        @pagination="handlePage"
      />
    </div>
  </el-dialog>
</template>

<script lang="ts" setup>
  import { reactive } from "vue";
  import HistoryItem from "./item.vue";
  import { useMessageStore } from "@/store/modules/message";

  const messageStore = useMessageStore();

  const emit = defineEmits(["handleClose"]);

  const props = defineProps({
    visible: {
      type: Boolean,
      required: true,
      default: false
    },
    title: {
      type: String,
      required: true,
      default: ""
    }
  });

  // 历史数据
  const data = shallowRef();

  // 搜索关键词
  const searchStr = ref("");

  // 分页
  const pageInfo = reactive({
    currentPage: 1,
    pageSize: 10,
    total: 0
  });

  watch(
    () => props.visible,
    val => {
      if (val) {
        // 打开时重置分页（可按需去掉）
        pageInfo.currentPage = 1;
        getList();
      } else {
        searchStr.value = "";
        data.value = [];
      }
    }
  );

  const handlePage = (val: any) => {
    pageInfo.currentPage = val.page;
    pageInfo.pageSize = val.limit;
    getList();
  };

  const handleSearch = (val: any) => {
    pageInfo.currentPage = 1;
    pageInfo.pageSize = 10;
    getList();
  };

  const getList = async () => {
    let res: any = await messageStore.handleHistoryMessage(
      {
        page: pageInfo.currentPage,
        size: pageInfo.pageSize
      },
      searchStr.value
    );
    data.value = res.list;
    pageInfo.total = res.total;
  };

  const handleClose = () => {
    emit("handleClose");
  };
</script>
<style lang="scss" scoped>
  @use "@/assets/style/scss/index.scss" as *;

  .el-dialog {
    position: relative;
    /* 让弹窗内的元素可以使用绝对定位 */
  }

  .history-container {
    // max-height: calc(70vh - 120px);
    height: calc(70vh - 110px);
    overflow-y: auto;
    padding: 5px;
    margin-top: 5px;
    @include scroll-bar();
  }

  .pagination-container {
    display: flex;
    justify-content: center;
    padding: 5px 0;
  }
</style>
