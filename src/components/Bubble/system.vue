<template>
  <div :id="`message-${message.messageId}`" v-memo="[message]" :class="['bubble', message.type]" class="message-bubble">
    <span class="message no-select">
      <div>{{ message.messageBody?.text }}</div>
    </span>
  </div>
</template>

<script lang="ts" setup>
  defineProps({
    message: {
      type: Object,
      required: true,
      default: function() {
        return {};
      }
    }
  });
</script>

<style lang="scss" scoped>
  .message-bubble {
    display: inline-block;
    //padding: 8px;
    color: #333;
    position: relative;
    word-wrap: break-word;

    .message {
      text-align: center;
      font-size: 12px;
      color: var(--content-message-font-color);
    }
  }
</style>
