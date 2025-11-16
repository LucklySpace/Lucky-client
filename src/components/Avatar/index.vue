<template>
  <el-image
    :src="safeAvatar"
    :alt="(name || 'avatar') + ''"
    :class="['chat-item__avatar-img', 'lazy-img']"
    :style="{
       width: width + 'px',
       height: width + 'px',
       borderRadius: borderRadius + 'px'
       }"
    fit="cover"
    loading="lazy"
  >
    <template #placeholder>
      <span
        class="default"
        :style="{
           width: width + 'px',
           height: width + 'px',
           color: color,
           backgroundColor: backgroundColor,
           borderRadius: borderRadius + 'px',
           fontSize: (width * 0.4) + 'px'
            }"
      >
        {{ defaultName(name || '未') }}
      </span>
    </template>
    <template #error>
      <span
        class="default"
        :style="{
           width: width + 'px',
           height: width + 'px',
           color: color,
           backgroundColor: backgroundColor,
           borderRadius: borderRadius + 'px',
           fontSize: (width * 0.4) + 'px'
            }"
      >
        {{ defaultName(name || '未') }}
      </span>
    </template>
  </el-image>
</template>

<script lang="ts" setup>

  const props = withDefaults(defineProps<{
    avatar?: string,
    name?: string,
    width?: number,
    borderRadius?: number,
    color?: string,
    backgroundColor?: string,
  }>(), {
    width: 36,
    borderRadius: 3,
    color: 'white',
    backgroundColor: '#409eff'
  });
  const safeAvatar = computed(() => (props.avatar || '').trim());

  const defaultName = (name: string) => {
    if(!name) return '无'
    const n = name?.trim() ?? "";
    if (!n) return "?";
    const first = n[0];
    return /[A-Za-z]/.test(first) ? first.toUpperCase() : first;
  }


</script>

<style lang="scss" scoped>
  $gap: 8px;
  $item-margin: 8px;
  $time-color: var(--content-message-font-color);
  $message-color: var(--content-message-font-color);
  $name-color: var(--side-font-color);

  .chat-item__avatar-img {
    object-fit: cover;
    background-color: #e6e6e6;
    display: block;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
    border: 1px solid rgba(0, 0, 0, 0.02);
  }
  .default {
    display: flex;
    align-items: center;
    justify-content: center;
  }

</style>
