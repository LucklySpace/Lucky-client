<template>
  <div :style="{ display: isShow ? 'block' : 'none' }" class="pagination-container">
    <el-config-provider :locale="zhCn">
      <el-pagination
        v-if="isShow"
        v-model:current-page="computedPage"
        v-model:page-size="computedLimit"
        :background="background"
        :layout="layout"
        :page-sizes="pageSizes"
        :pager-count="pagerCount"
        :total="total"
        small
        @size-change="onSizeChange"
        @current-change="onCurrentChange"
      />
    </el-config-provider>
  </div>
</template>

<script lang="ts" setup>
  import type { PropType } from "vue";
  import { computed, watch } from "vue";
  import zhCn from "element-plus/es/locale/lang/zh-cn";

  const props = defineProps({
    isShow: { type: Boolean, default: true },
    background: { type: Boolean, default: true },
    total: { type: Number, required: true },
    limit: { type: Number, default: 10 },
    page: { type: Number, default: 1 },
    pagerCount: { type: Number, default: 5 },
    pageSizes: {
      type: Array as PropType<number[]>,
      default: () => [10, 30, 50, 100]
    },
    layout: {
      type: String,
      default: "total, sizes, prev, pager, next, jumper"
    }
  });

  // 明确 emits 类型
  const emit = defineEmits<{
    (e: "update:page", val: number): void;
    (e: "update:limit", val: number): void;
    (e: "pagination", payload: { page: number; limit: number }): void;
  }>();

  // 计算总页数的 helper
  function calcTotalPages(total: number, limit: number) {
    return Math.max(1, Math.ceil(total / Math.max(1, limit)));
  }

  /**
   * computed 双向绑定：page
   * - getter 从 props.page 读
   * - setter 校验范围并 emit update:page & pagination
   */
  const computedPage = computed<number>({
    get: () => {
      // 保持与父组件同步
      return props.page;
    },
    set: (val: number) => {
      const totalPages = calcTotalPages(props.total, props.limit);
      let next = Math.floor(val);
      if (isNaN(next) || next < 1) next = 1;
      if (next > totalPages) next = totalPages;
      emit("update:page", next);
      emit("pagination", { page: next, limit: props.limit });
    }
  });

  /**
   * computed 双向绑定：limit（每页大小）
   * - setter 在改变 limit 时自动把 page 重置为 1（常见行为）
   * - emit update:limit, update:page, pagination
   */
  const computedLimit = computed<number>({
    get: () => props.limit,
    set: (val: number) => {
      const nextLimit = Math.max(1, Math.floor(val) || 1);
      emit("update:limit", nextLimit);
      // 改变每页大小通常需要回到第一页
      emit("update:page", 1);
      emit("pagination", { page: 1, limit: nextLimit });
    }
  });

  /**
   * 当 external props（total 或 limit）改变导致当前 page 超出范围时，自动纠正并通知父组件
   */
  watch(
    () => [props.total, props.limit],
    () => {
      const totalPages = calcTotalPages(props.total, props.limit);
      if (props.page > totalPages) {
        // 将 page 修正到最大页，并通知父组件
        emit("update:page", totalPages);
        emit("pagination", { page: totalPages, limit: props.limit });
      }
    }
  );

  /**
   * 额外的事件处理（Element UI 触发）
   * 这些 handler 保证在 UI 交互时，computed 的 setter 与 emit 行为一致
   */
  function onSizeChange(newSize: number) {
    // 直接设置 computedLimit 会触发 setter（并 emit pagination）
    computedLimit.value = newSize;
  }

  function onCurrentChange(newPage: number) {
    computedPage.value = newPage;
  }
</script>

<style lang="scss" scoped>
  .pagination-container {
    margin: 0 auto;

    :deep(.el-select) {
      height: 30px;
    }
  }
</style>
