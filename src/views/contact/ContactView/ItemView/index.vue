<template>
  <div class="contact-item no-select">
    <el-row height="60">
      <el-col :span="6">
        <div>
          <img :src="data.avatar" class="contact-item-avatar" />
        </div>
      </el-col>
      <el-col :span="18">
        <div class="contact-item-username">
          {{ data.name }}
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script lang="ts" setup>
  defineProps({
    data: {
      type: Object,
      required: false,
      default: function() {
        return {};
      }
    }
  });
</script>

<style lang="scss" scoped>
  .contact-item {
    height: 60px;
    cursor: pointer;
  }

  .contact-item:hover {
    background-color: #ddd;
  }

  .contact-item-avatar {
    position: relative;
    width: 45px;
    height: 45px;
    background-color: #ccc;
    border-radius: 3px;
    margin: 5px;
  }

  .contact-item-username {
    line-height: 60px;
    font-size: 14px;
    font-weight: 530;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
