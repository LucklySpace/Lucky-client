<template>
  <div
    :id="`message-${message.messageId}`"
    v-memo="[message, message.isOwner]"
    :class="['bubble', message.type, { owner: message.isOwner }]"
    class="message-bubble"
  >
    <!-- <template v-if="message.messageContentType == MessageContentType.TEXT.code">
      <div translate="yes" class="text-bubble" v-html="handleMessageProcess(message.messageBody?.text)"></div>
    </template>

<template v-if="message.messageContentType == MessageContentType.IMAGE.code">
      <img :src="message.messageBody?.path" alt="Image message" @click="handlePreview(message.messageBody?.path)"
        class="img-bubble lazy-img" />
    </template> -->
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

<style lang="scss" scoped></style>
