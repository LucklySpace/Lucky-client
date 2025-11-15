<template>
  <div ref="itemRef">
    <slot :item="item"></slot>
  </div>
</template>
<script lang="ts" setup>
  const props = defineProps({
    item: {
      type: Object,
      required: true,
      default: function() {
        return {};
      }
    }
  });
  const itemRef = ref();
  onMounted(() => {
    props.item.__height = itemRef.value.clientHeight;
  });
</script>
