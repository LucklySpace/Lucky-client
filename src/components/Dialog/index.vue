<!-- <template>
  <el-dialog
    :model-value="visibleLocal"
    :title="title"
    v-bind="$attrs"
    :before-close="handleBeforeClose"
    :show-close="isMacComputed"
  >
    <!-- 自定义 header：左侧是关闭图标（mac 上强制左侧），中间是标题插槽，右侧保留可能的操作插槽 -->
<template #header>
  <div :class="{ 'icon-left': isMacComputed }" class="el-dialog__header-custom">
    <!-- 关闭图标（支持字符串 HTML、组件或默认） -->
    <button v-if="showCloseIcon" aria-label="close dialog" class="custom-close-btn" @click="onCloseClick">
      <svg aria-hidden="true" class="btn-icon">
        <use :xlink:href="macIconHtml" />
      </svg>
    </button>

    <!-- 标题内容（优先使用 header 插槽，其次是 title prop） -->
    <div class="header-content">
      <slot name="header">
        <span class="title-text">{{ title }}</span>
      </slot>
    </div>

    <!-- 右侧保留 slot（如果需要） -->
    <div class="header-right">
      <slot name="header-right" />
    </div>
  </div>
</template>

<!-- 默认内容 -->
<slot />

<!-- footer 保持透传 -->
<template #footer>
  <slot name="footer" />
</template>
</el-dialog>
</template>

<script lang="ts" setup>
  import type { Component, PropType } from "vue";
  import { computed, ref, watch } from "vue";

  /**
   * ElDialogWrapper.vue
   * 封装 Element Plus 的 <el-dialog>，支持：
   * - v-model:visible（或 model-value）透传
   * - 自定义关闭图标（支持字符串 HTML / Vue 组件）
   * - 在 macOS 平台上强制使用 <i class="iconfont icon-guanbi"></i> 并把关闭图标放在左侧
   *   - 支持外部传入 `isMac` 参数来控制（优先使用外部参数），若未传入则内部自动检测
   * - 将点击关闭图标的行为与 el-dialog 的关闭逻辑一致（支持 before-close）
   */

  const props = defineProps({
    modelValue: { type: Boolean as PropType<boolean>, default: true },
    // 标题
    title: { type: String, default: "" },
    // 用户传入的关闭图标：可以是组件（构造函数 / SFC）
    closeIcon: { type: [Object, Function] as PropType<Component | null>, default: null },
    // 或者传入字符串 HTML（例如 svg）——优先级低于 closeIcon 组件
    closeIconHtml: { type: String, default: "" },
    // 是否显示关闭按钮（透传给我们自己的实现）
    showClose: { type: Boolean, default: true },
    // beforeClose 直接透传给 el-dialog（如果你想拦截关闭流程）
    beforeClose: { type: Function as PropType<((done: () => void) => void) | undefined>, default: undefined },
    // 外部传入是否为 mac 系统：如果传入则优先使用该值；否则组件内部会尝试自动检测
    isMac: { type: Boolean as PropType<boolean | undefined>, default: false }
  });

  const emit = defineEmits(["update:visible", "update:modelValue", "close", "open", "opened", "closed"]);

  // 本地可控的 v-model：与外部 modelValue 同步（支持 v-model:visible 或 v-model）
  const visibleLocal = ref(!!props.modelValue);

  watch(
    () => props.modelValue,
    v => {
      visibleLocal.value = !!v;
    }
  );

  watch(visibleLocal, v => {
    // 同步到父级 v-model（同时支持 modelValue 和 visible）
    emit("update:modelValue", v);
    emit("update:visible", v);
    if (!v) emit("close");
  });

  /** mac 检测：优先使用 props.isMac（外部传入），如果未传则使用 navigator 检测 */
  const isMacComputed = computed(() => {
    if (typeof props.isMac === "boolean") return props.isMac;
  });

  /** 在 mac 上要求使用此 HTML 作为关闭图标 */
  const macIconHtml = "#icon-mac_top_rhover";

  /** 是否展示关闭图标（基于 showClose prop） */
  const showCloseIcon = computed(() => props.showClose);

  /** 判断用户传入的 closeIcon 是否是组件 */
  const isComponentIcon = computed(() => {
    return !!props.closeIcon;
  });

  /** 如果用户传入字符串 HTML，则使用它（优先级低于组件） */
  const closeIconHtml = computed(() => props.closeIconHtml);

  /** 点击关闭图标时的处理：尊重 beforeClose，如果没有则直接关闭 */
  function onCloseClick() {
    // 如果 el-dialog 本身传入了 beforeClose，会由 el-dialog 调用；但我们也要处理
    if (props.beforeClose) {
      let called = false;
      const done = () => {
        if (called) return;
        called = true;
        visibleLocal.value = false;
      };
      try {
        const res = (props.beforeClose as any)(done);
        if (res && typeof res.then === "function") {
          res.then(() => done()).catch(() => {
          });
        }
      } catch (e) {
        done();
      }
    } else {
      visibleLocal.value = false;
    }
  }

  /** 把 beforeClose 透传给 el-dialog（如果用户传入） */
  function handleBeforeClose(done: () => void) {
    if (props.beforeClose) {
      (props.beforeClose as any)(done);
    } else {
      done();
    }
  }
</script>

<style lang="scss" scoped>
  .el-dialog__header-custom {
    display: flex;
    align-items: center;
    justify-content: space-between; /* 左 icon、标题、右 slot */
    width: 100%;
  }

  .btn-icon {
    width: 12px;
    height: 12px;
    display: block;
    object-fit: contain;
  }

  .el-dialog__header-custom.icon-left {
    /* 当 mac 时，强制左侧图标 */
    justify-content: flex-start;
  }

  .custom-close-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 5px;
    margin-right: 5px; /* 当图标在左侧，和标题保持间距 */
  }

  .header-content {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
  }

  .title-text {
    font-size: 16px;
    font-weight: 500;
  }

  .header-right {
    margin-left: auto;
  }
</style> -->
