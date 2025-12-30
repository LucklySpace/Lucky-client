<template>
  <div class="chat-item no-select">
    <el-row height="60">
      <el-col :span="3">
        <Avatar :avatar="data.avatar" :name="data.name" :width="45" :borderRadius="8" />
      </el-col>

      <el-col :span="21">
        <div class="content">
          <div class="info">
            <!--用户昵称-->
            <div class="username">
              {{ data.name }}
            </div>
            <!--最后一条消息时间-->
            <div v-if="data.messageTime != ''" class="time">
              {{ useFriendlyTime(data.messageTime, "yy-MM-dd hh:mm", true) }}
            </div>
          </div>
          <!--最后一条消息-->
          <div class="message">
            <span v-html="data.messageBody.text"></span>
          </div>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script lang="ts" setup>
  // import { useFriendlyTime } from "@/utils/Date";
  import { useTimeFormat } from "@/hooks/useTimeFormat";
  import Avatar from "@/components/Avatar/index.vue";

  const { useFriendlyTime } = useTimeFormat();
  defineProps({
    data: {
      type: Object,
      default: function () {
        return {};
      }
    }
  });
</script>

<style lang="scss" scoped>
  .chat-item {
    // display: flex;
    // align-items: center;
    // justify-items: center;
    height: 60px;
    cursor: pointer;
    /* padding: 10px; */

    &:active {
      background-color: #ddd;
    }

    &:hover {
      background-color: #ddd;
    }
    .el-col-3 {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .avatar {
      margin: 8px;
      display: inline-block;
    }

    .content {
      width: 100%;
      margin-left: 5px;

      .message {
        height: 30px;
        line-height: 30px;
        font-size: 12px;
        color: #999;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        padding-right: 5px;
      }

      // .message-mention {
      //     margin-right: 1px;
      //     /* 可以添加一些间距 */
      // }

      .info {
        display: flex;
        align-items: center;
        text-align: center;
        height: 30px;
        width: 100%;

        .username {
          width: 70%;
          font-size: 14px;
          font-weight: 530;
          text-align: left;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .time {
          width: 30%;
          margin-right: auto;
          padding-right: 0px;
          font-size: 12px;
          color: #999;
        }
      }
    }
  }

  // .avatar-unread{
  // }
</style>
