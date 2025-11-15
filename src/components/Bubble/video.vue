<template>
  <div
    :id="`message-${message.messageId}`"
    v-memo="[message, message.isOwner]"
    :class="['bubble', message.type, { owner: message.isOwner }]"
    class="message-bubble"
  >
    <div v-dompurify="message.messageBody?.text" class="text" translate="yes"></div>
  </div>
  <!-- <Forward :visible="forwardVisible" :contacts="contacts"></Forward> -->
</template>

<script lang="ts" setup>
  defineProps({
    message: {
      type: Object,
      required: true,
      default: function () {
        return {};
      }
    }
  });
</script>

<style lang="scss" scoped>
  .message-bubble {
    display: inline-block;
    border-radius: 8px;
    //padding: 8px;
    font-size: 14px;
    color: #333;
    position: relative;
    //width: 80%;
    // max-width: 60%;
    word-wrap: break-word;
    // overflow: hidden;
    background-color: #e1f5fe;
    //color: #333;

    .text {
      padding: 10px;
      border-radius: 8px;
      background-color: #e1f5fe;
      white-space: break-spaces;
    }

    &.owner .text {
      background-color: #dcf8c6; // 自己的消息背景色
    }
  }

  .custom-link {
    text-decoration: none;
    color: #3eaf7c;
    cursor: pointer;
  }
</style>
