<template>
  <el-header>
    <el-row style="height: 60px">
      <el-col :span="20" data-tauri-drag-region style="height: 60px">
        <div class="chat-header">
          <Search />
        </div>
        <div class="chat-header-name">
          <Name data-tauri-drag-region></Name>
        </div>
      </el-col>
      <el-col :span="4" data-tauri-drag-region style="height: 60px">
        <el-row v-if="currPlatform !== 'macos'" style="height: 30px">
          <System about-visible />
        </el-row>
        <el-row v-else data-tauri-drag-region style="height: 30px"></el-row>

        <el-row style="height: 30px">
          <el-col :span="18"></el-col>
          <el-col :span="6">
            <el-button v-if="chatStore.getShowDetailBtn" class="control-el-button" link
              @click="chatStore.handleChatDetail">
              <i class="iconfont icon-sandian" style="font-size: 25px"></i>
            </el-button>
          </el-col>
        </el-row>
      </el-col>
    </el-row>
  </el-header>
</template>

<script lang="ts" setup>
import Search from "@/components/Search/index.vue";
import System from "@/components/System/index.vue";
import { useChatStore } from "@/store/modules/chat";
import Name from "./name/index.vue";
import { useSystemClose } from "@/hooks/useSystem";

const { currPlatform } = useSystemClose();
const chatStore = useChatStore();
</script>

<style lang="scss" scoped>
.title {
  color: #909399;
  font-size: 16px;
  line-height: 40px;
}

.chat-header {
  height: 60px;
  width: 240px;
  float: left;
}

.chat-header-name {
  width: 100%;
}

.el-header {
  line-height: unset;
  height: 60px;
  padding: 0;
  border-bottom: 1px solid var(--header-border-bottom-color);
  background-color: var(--header-bg-color);
}
</style>
