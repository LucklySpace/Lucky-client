<template>
  <div class="contact-item no-select" @click="$emit('click')">
    <div class="contact-item__avatar">
      <Avatar :avatar="data.avatar || ''" :name="data.name" :width="45" :borderRadius="3" />
    </div>
    <span class="contact-item__name">{{ data.name }}</span>
  </div>
</template>

<script lang="ts" setup>
import Avatar from "@/components/Avatar/index.vue";

interface ContactData {
  avatar?: string;
  name?: string;
}

defineProps<{
  data: ContactData;
}>();

defineEmits<{
  click: [];
}>();
</script>

<style lang="scss" scoped>
.contact-item {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 60px;
  padding: 0 8px;
  cursor: pointer;
  transition: background-color 0.15s ease;

  &:hover {
    background-color: #f5f5f5;
  }

  &__avatar {
    flex-shrink: 0;
    width: 45px;
    height: 45px;
  }

  &__name {
    flex: 1;
    font-size: 14px;
    font-weight: 530;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
