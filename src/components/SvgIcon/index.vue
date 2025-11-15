<template>
  <svg :height="props.size" :width="props.size" aria-hidden="true" class="svg-icon">
    <use :fill="props.color" :xlink:href="symbolId" />
  </svg>
</template>

<script setup>
  import { computed } from "vue";

  const props = defineProps({
    prefix: {
      type: String,
      default: "icon"
    },
    name: {
      type: String,
      required: true
    },
    color: {
      type: String,
      default: "#333"
    },
    size: {
      type: String,
      default: "1em"
    }
  });

  const symbolId = computed(() => `#${props.prefix}-${props.name}`);
</script>

<style scoped>
  svg {
    outline: none;
  }
</style>
