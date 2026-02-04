<template>
  <div :id="`message-${message.messageId}`" v-memo="[message]" :class="['bubble', message.type]" class="message-bubble">
    <span class="message no-select">
      <div>{{ displayText }}</div>
    </span>
  </div>
</template>

<script lang="ts" setup>
import { MessageContentType } from "@/constants";
import { computed } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps({
  message: {
    type: Object,
    required: true,
    default: () => ({})
  }
});

const { t } = useI18n();

const displayText = computed(() => {
  const code = props.message?.messageContentType;
  if (code === MessageContentType.RECALL_MESSAGE.code) {
    if (props.message?.isOwner) {
      return t("components.bubble.tip.recall.self");
    }
    const name = props.message?.remark ?? props.message?.name ?? "";
    return t("components.bubble.tip.recall.user", { name });
  }
  const text = props.message?.messageBody?.text;
  return typeof text === "string" ? text : "";
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
