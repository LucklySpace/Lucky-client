<template>
  <!-- 转发弹窗：左右二列布局（左侧搜索/列表，右侧已选） -->
  <Teleport to="body">
    <div v-if="visible" class="overlay" tabindex="-1" @keydown.esc="closeForward()">
      <div class="forward-dialog">

        <!-- 左侧：会话搜索和列表 -->
        <div class="forward-dialog__section-left">
          <!-- 搜索框 -->
          <div class="forward-dialog__search-wrapper">
            <el-input class="forward-dialog__search" ref='searchInput' :prefix-icon="Search" v-model="searchKeywords"
              type="text" :placeholder="t('components.forward.searchPlaceholder')" />
          </div>

          <!-- 搜索结果区 - 使用虚拟列表优化大数据渲染 -->
          <div v-if="searchKeywords.trim()" style="width: 100%;height: 100%;display: flex; justify-content: center;">
            <div ref="searchResultContainer" class="forward-dialog__search-result-container"
              @scroll="handleSearchResultScroll">
              <div class="forward-dialog__placeholder" :style="{ height: totalHeight + 'px' }" />
              <div class="forward-dialog__content" :style="{ transform: `translateY(${contentTop}px)` }">
                <div v-for="item in visibleData" :key="`${item.id}` || `${item.label}`">
                  <div v-if="item.type === 'bar'" class="forward-dialog__bar">{{ item.label }}</div>
                  <div v-else class="forward-dialog__items" :class="{ selected: selectedSet.has(item.id) }"
                    :style="{ height: itemHeight + 'px' }" @click="toggleSelect(item.id)">
                    <el-checkbox :model-value="selectedSet.has(item.id)" @change="toggleSelect(item.id)" @click.stop />
                    <Avatar class="forward-dialog__avatar" :avatar="item.avatar || ' '" :name="item.name"
                      :borderRadius="3" />
                    <span>{{ item.name }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 会话列表区 - 默认显示最近聊天 -->
          <div class="forward-dialog__contacts-list" v-else>
            <div class="forward-dialog__head-title">{{ t('components.forward.latestChats') }}</div>
            <RecycleScroller class="forward-dialog__contacts-container" :items="contacts" :item-size="50" key-filed="id"
              v-slot="{ item }">
              <div class="forward-dialog__list-item" :class="{ selected: selectedSet.has(item.id) }"
                @click="toggleSelect(item.id)">
                <el-checkbox :model-value="selectedSet.has(item.id)" @change="toggleSelect(item.id)" @click.stop />
                <Avatar class="forward-dialog__avatar" :avatar="item.avatar || ' '" :name="item.name"
                  :borderRadius="3" />
                <span>{{ item.name }}</span>
              </div>
            </RecycleScroller>
          </div>
        </div>

        <!-- 右侧：已选择的转发对象 -->
        <div class="forward-dialog__section-right">
          <div class="forward-dialog__head-title">{{ t('components.forward.sendTo') }}</div>

          <!-- 已选联系人列表 -->
          <ul class="forward-dialog__selected-list">
            <li v-for="id in Array.from(selectedSet)" style="cursor: default;" :key="id"
              class="forward-dialog__selected-item">
              <Avatar class="forward-dialog__avatar" :avatar="getContactInfo(id, 'avatar')"
                :name="getContactInfo(id, 'name')" :width="32" />
              <span>{{ getContactInfo(id, 'name') }}</span>
              <button class="forward-dialog__remove-btn" @click="toggleSelect(id)">×</button>
            </li>
          </ul>

          <!-- 转发操作区 -->
          <div class="forward-dialog__actions">
            <!-- 待转发消息预览 -->
            <el-popover trigger="click" placement="right" :width="200" :content="forwardMessage?.content">
              <template #reference>
                <div class="forward-dialog__message-preview">
                  <span>{{ forwardMessage?.content }}</span>
                  <div>
                    <el-icon style="vertical-align:middle;">
                      <ArrowRight />
                    </el-icon>
                  </div>
                </div>
              </template>
            </el-popover>

            <!-- 留言输入框 -->
            <div class="forward-dialog__leave-message">
              <el-input @keydown.enter="sendMessage()" v-model="leaveMessage.content"
                :placeholder="t('components.forward.leaveMessagePlaceholder')" />
            </div>

            <!-- 操作按钮 -->
            <div class="forward-dialog__action-button">
              <el-button type="primary" style="min-width: 100px; padding: 0 10px;" :disabled="selectedSet.size < 1"
                @click="sendMessage()">{{
                  selectedSet.size > 1 ?
                    t('components.forward.sendSeparately', { count: selectedSet.size }) : t('components.forward.send')
                }}</el-button>
              <el-button style="width: 100px;" @click="closeForward()">{{ t('components.forward.cancel') }}</el-button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script lang="ts" setup>
import { Events } from '@/constants';
import Chats from '@/database/entity/Chats';
import { globalEventBus } from '@/hooks/useEventBus';
import { IMessagePart } from '@/models';
import { useChatStore } from '@/store/modules/chat';
import { useFriendsStore } from '@/store/modules/friends';
import { useMessageStore } from '@/store/modules/message';
import { useUserStore } from '@/store/modules/user';
import { Search } from "@element-plus/icons-vue";
import Fuse from 'fuse.js';
import { computed, nextTick, ref, useTemplateRef, watch } from "vue";
import { useI18n } from "vue-i18n";

// ==================== 基础依赖初始化 ====================
const { t } = useI18n();

// Store 初始化
const userStore = useUserStore()
const chatStore = useChatStore()
const messageStore = useMessageStore()
const friendsStore = useFriendsStore()

// ==================== Props & 模板Ref ====================
const dialogProps = defineProps<{
  visible: boolean;
}>();

const searchInputRef = useTemplateRef('searchInput')
const searchResultContainerRef = useTemplateRef('searchResultContainer')

// ==================== 核心响应式状态 ====================
// 已选择的联系人/群组ID集合
const selectedSet = ref<Set<string>>(new Set())

// 搜索关键词
const searchKeywords = ref("")

// 待转发消息
const forwardMessage = ref<IMessagePart>()

// 留言消息
const leaveMessage = ref<IMessagePart>({
  type: 'text',
  content: '',
  id: userStore.$state.userInfo.userId,
  name: userStore.$state.userInfo.name
})

// 虚拟列表状态
const itemHeight = ref<number>(50)
const scrollTop = ref<number>(0)
const startIndex = ref<number>(0)
const endIndex = ref<number>(0)
const bufferCount = ref<number>(5)

// ==================== 基础数据计算属性 ====================
// 聊天列表数据
const contacts = computed(() =>
  chatStore.state.chatList.map(chat => ({
    id: chat.toId,
    name: chat.name,
    avatar: chat.avatar
  }))
)

// 搜索列表数据（联系人和群组）
const searchContacts = computed(() =>
  friendsStore.$state.contacts.map(contact => ({
    type: 'contact',
    id: contact.friendId,
    name: contact.name,
    location: contact.location,
    avatar: contact.avatar,
    selfSignature: contact.selfSignature,
    userSex: contact.userSex
  }))
)
const searchGroups = computed(() =>
  friendsStore.$state.groups.map(group => ({
    type: 'group',
    id: group.groupId,
    name: group.groupName,
    avatar: group.avatar,
  }))
)

// ==================== Fuse.js 相关配置 ====================
// Fuse.js搜索实例
let contactsFuse: Fuse<any> | null = null
let groupsFuse: Fuse<any> | null = null
// 配置全局Fuse.js搜索参数
Fuse.config.threshold = 0.7
Fuse.config.ignoreLocation = true
Fuse.config.isCaseSensitive = false
Fuse.config.shouldSort = true
Fuse.config.findAllMatches = true

watch(searchContacts, (val) => {
  contactsFuse = new Fuse(val, {
    keys: ['name', 'location'],
  })
}, { immediate: true })

watch(searchGroups, (val) => {
  groupsFuse = new Fuse(val, {
    keys: ['name'],
  })
}, { immediate: true })

// ==================== 搜索结果计算属性 ====================
const contactsSearchResult = computed(() => {
  if (!contactsFuse) return []
  return contactsFuse.search(searchKeywords.value.trim()).map(result => result.item)
})
const groupsSearchResult = computed(() => {
  if (!groupsFuse) return []
  return groupsFuse.search(searchKeywords.value.trim()).map(result => result.item)
})
const allSearchResults = computed(() => {
  return [
    { type: 'bar', label: t('components.forward.contactsBar') },
    ...contactsSearchResult.value,
    { type: 'bar', label: t('components.forward.groupsBar') },
    ...groupsSearchResult.value
  ];
})

// ==================== 虚拟列表计算属性 ====================
const totalHeight = computed(() => {
  return allSearchResults.value.length * itemHeight.value
})
const visibleCount = computed(() => {
  if (!searchResultContainerRef.value) return 0
  return Math.ceil(searchResultContainerRef.value.clientHeight / itemHeight.value)
})
const visibleData = computed(() => {
  // 普通切片
  let result = allSearchResults.value.slice(startIndex.value, endIndex.value + 1);

  // 检查是否全是bar
  let hasDataItem = result.some(item => item.type !== 'bar');
  let nextIdx = endIndex.value + 1;

  // 如果全是bar，向后补充，直到有数据项或到结尾
  while (!hasDataItem && nextIdx < allSearchResults.value.length) {
    result.push(allSearchResults.value[nextIdx]);
    hasDataItem = result.some(item => item.type !== 'bar');
    nextIdx++;
  }

  return result;
});
const contentTop = computed(() => {
  return startIndex.value * itemHeight.value
})

// ==================== 工具方法 ====================
function getContactInfo(id: string, field: 'avatar' | 'name') {
  const allItems = [...contacts.value, ...searchContacts.value, ...searchGroups.value];
  const targetItem = allItems.find(item => item.id === id);
  return targetItem ? targetItem[field] : "";
}

// ==================== 虚拟列表方法 ====================
/**
 * 计算可见范围的起始和结束索引
 */
function calcVisibleRange() {
  if (!searchResultContainerRef.value) return

  // 计算起始索引（包含缓冲区）
  startIndex.value = Math.max(
    0,
    Math.floor(scrollTop.value / itemHeight.value) - bufferCount.value
  )

  // 计算结束索引（包含缓冲区）
  endIndex.value = Math.min(
    allSearchResults.value.length - 1,
    startIndex.value + visibleCount.value + bufferCount.value * 2
  )
}

/**
 * 处理搜索结果容器的滚动事件
 */
function handleSearchResultScroll() {
  requestAnimationFrame(() => {
    if (searchResultContainerRef.value) scrollTop.value = searchResultContainerRef.value.scrollTop
    calcVisibleRange()
  })
}

// ==================== 核心业务方法 ====================
/**
 * 切换联系人/群组的选择状态
 */
function toggleSelect(id: string) {
  if (selectedSet.value.has(id)) selectedSet.value.delete(id);
  else selectedSet.value.add(id);
}

/**
 * 发送转发消息
 */
async function sendMessage(): Promise<void> {
  let parts: IMessagePart[] = [forwardMessage.value as IMessagePart];
  // 留言判断是否为空
  if (leaveMessage.value.content.trim() !== '') {
    parts.push(leaveMessage.value as IMessagePart);
  }
  let chats: Chats[] = [];
  for (const chatId of selectedSet.value) {
    const chat = chatStore.getChatByToId(chatId);
    if (chat) chats.push(chat);
  }
  closeForward();
  await messageStore.handleSendMessageToSomeone(parts, chats);
}

/**
 * 关闭转发窗口
 */
function closeForward() {
  globalEventBus.emit(Events.MESSAGE_FORWARD_CANCEL, 'message:forwardCancel')
}

// ==================== 监听逻辑 ====================
/**
 * 监听对话框显示状态，初始化相关数据
 */
watch(
  () => dialogProps.visible,
  async (newVal) => {
    if (newVal) {
      // 重置转发数据及状态
      selectedSet.value.clear();
      searchKeywords.value = "";
      leaveMessage.value.content = ''
      // 等待DOM渲染完成后再聚焦搜索框
      await nextTick()
      if (searchInputRef.value) {
        // 自动聚焦搜索框
        searchInputRef.value.focus()
      }
    }
  }
)

/**
 * 监听搜索结果数量变化，重置虚拟列表
 */
watch(() => allSearchResults.value.length, () => {
  scrollTop.value = 0
  startIndex.value = 0
  endIndex.value = 0
  calcVisibleRange()
})

/**
 * 监听转发消息内容
 */
globalEventBus.on(Events.MESSAGE_FORWARD_CONTENT, (msg) => {
  forwardMessage.value = msg
})
</script>

<style lang="scss" scoped>
// ==================== Mixins ====================

/**
 * 滚动条美化 mixin
 */
@mixin scroll-bar($width: 8px) {

  &::-webkit-scrollbar-button {
    display: none;
  }

  &::-webkit-scrollbar-track {
    border-radius: 10px;
    background-color: transparent;
  }

  &::-webkit-scrollbar {
    width: $width;
    background-color: transparent;
  }

  &::-webkit-scrollbar-thumb {
    border-radius: 10px;
    background-color: rgba(0, 0, 0, 0.2);
  }
}

.overlay {
  position: fixed;
  inset: 0;
  border: 2px solid #D2D2D2;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  border: 0;
}

.forward-dialog {
  display: flex;
  flex-direction: row;
  width: 600px;
  height: 500px;
  max-height: 80vh;
  padding: 10px;
  border-radius: 8px;
  background: #FFF;
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.1),
    0 1px 2px rgba(0, 0, 0, 0.05);
  box-shadow:
    0 4px 16px rgba(0, 0, 0, 0.1),
    0 1px 2px rgba(0, 0, 0, 0.05),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
  border: none;
  overflow: hidden;

  .forward-dialog__head-title {
    margin: 10px 10px 5px 10px;
    color: #474343;
    cursor: default;
    user-select: none;
  }
}

.forward-dialog__section-left {
  width: 50%;
  display: flex;
  flex-direction: column;

  .forward-dialog__search-wrapper {
    display: flex;
    justify-content: center;

    .forward-dialog__search {
      width: 90%;
      margin-top: 5px;
    }
  }

  .forward-dialog__search-result-container {
    width: 95%;
    height: 400px;
    margin-top: 5px;
    overflow: auto;
    position: relative;
    box-sizing: border-box;

    .forward-dialog__placeholder {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      z-index: -1;
    }

    .forward-dialog__content {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
    }

    .forward-dialog__bar {
      margin: 5px 5px 5px 10px;
      user-select: none;
    }

    .forward-dialog__items {
      display: flex;
      align-items: center;
      gap: 5px;
      padding-left: 10px;
      border: 0;
      // border-bottom: 1px solid #f5f5f5;
      border-radius: 5px;
      box-sizing: border-box;
      cursor: pointer;
      user-select: none;

      &:hover {
        background-color: #F7F7F7;
      }

      .forward-dialog__avatar {
        margin-left: 8px;
      }

      span {
        color: #474343;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  }

  .forward-dialog__contacts-list {
    height: 90%;
    max-height: 450px;
    margin-top: 10px;
    user-select: none;
    cursor: default;

    .forward-dialog__contacts-container {
      display: flex;
      height: 95%;
      width: 100%;
      @include scroll-bar();

      .forward-dialog__list-item {
        display: flex;
        align-items: center;
        gap: 5px;
        height: 50px;
        line-height: 50px;
        padding: 0 10px;
        border: 0;
        border-radius: 5px;
        // border-bottom: 1px solid #f5f5f5;

        &:hover {
          background-color: #F7F7F7;
        }

        .forward-dialog__avatar {
          margin-left: 8px;
        }

        span {
          color: #474343;
        }
      }
    }
  }
}

.forward-dialog__section-right {
  width: 50%;
  display: flex;
  flex-direction: column;
  gap: 5px;

  .forward-dialog__selected-list {
    flex: 1;
    margin: 0;
    padding: 0 8px 8px 8px;
    list-style: none;
    overflow-y: auto;
    user-select: none;
    cursor: default;
    @include scroll-bar();

    li {
      display: flex;
      align-items: center;
      padding: 6px;

      span {
        margin-left: 10px;
      }
    }

    .forward-dialog__remove-btn {
      margin-left: auto;
      background-color: transparent;
      border: none;
      border-radius: 20%;
      color: #959595;
      font-size: 18px;
      cursor: pointer;

      &:hover {
        color: #333333;
      }
    }
  }
}

.forward-dialog__actions {
  display: flex;
  flex-direction: column;
  margin: 15px;
  border-top: 1px solid #eee;

  .forward-dialog__message-preview {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 5px;
    margin: 8px 2px;
    color: #9F9F9F;
    line-height: 2.5rem;
    font-size: 0.75rem;
    user-select: none;
    cursor: default;

    span {
      line-height: 1rem;
      overflow: hidden;
      line-clamp: 2;
      display: -webkit-box;
      -webkit-box-align: center;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }
  }

  .forward-dialog__leave-message {
    display: flex;
    height: 2.5rem;
    margin-bottom: 5px;
  }

  .forward-dialog__action-button {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    margin-top: 2px;
  }
}

// 深色模式适配
html.dark {

  // 遮罩层样式
  .overlay {
    background: rgba(30, 30, 30, 0.95);
    border: 0;
  }

  // 对话框样式
  .forward-dialog {
    background: var(--content-bg-color);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.1);
    border: none;

    .forward-dialog__head-title {
      margin: 10px 10px 5px 10px;
      color: #e5eaf3;
      cursor: default;
      user-select: none;
    }
  }

  // 左侧区域深色样式
  .forward-dialog__section-left {
    width: 50%;

    .forward-dialog__search-result-container {
      .forward-dialog__items {
        border: 0;

        &:hover {
          background-color: #2c2c2c;
        }

        span {
          color: #e5eaf3;
        }
      }
    }

    .forward-dialog__contacts-list {
      .forward-dialog__contacts-container {
        .forward-dialog__list-item {
          border: 0;

          &:hover {
            background-color: #2c2c2c;
          }

          span {
            color: #e5eaf3;
          }
        }
      }
    }
  }

  // 右侧区域深色样式
  .forward-dialog__section-right {
    width: 50%;

    .forward-dialog__selected-list {
      li {
        span {
          color: #e5eaf3;
        }
      }

      .forward-dialog__remove-btn {
        color: #bdbdbd;

        &:hover {
          color: #ffffff;
        }

        background-color: transparent;
        border: none;
        border-radius: 20%;
        font-size: 18px;
        cursor: pointer;
      }
    }
  }

  // 操作区深色样式
  .forward-dialog__actions {
    border-top: 1px solid #333;
    margin: 15px;

    .forward-dialog__message-preview {
      color: #bdbdbd;
      line-height: 2.5rem;
      font-size: 0.75rem;
      user-select: none;
      cursor: default;

      span {
        color: #bdbdbd;
        line-height: 1rem;
      }
    }

    .forward-dialog__leave-message {
      height: 2.5rem;
      margin-bottom: 5px;
    }

    .forward-dialog__action-button {
      .el-button {
        --el-button-text-color: #e5eaf3;
        --el-button-bg-color: #333;
        --el-button-border-color: #444;
        --el-button-hover-text-color: #fff;
        --el-button-hover-bg-color: #444;
        --el-button-hover-border-color: #555;
        --el-button-active-text-color: #fff;
        --el-button-active-bg-color: #222;
        --el-button-active-border-color: #333;

        color: var(--el-button-text-color);
        background-color: var(--el-button-bg-color);
        border-color: var(--el-button-border-color);

        &:hover,
        &:focus {
          color: var(--el-button-hover-text-color);
          background-color: var(--el-button-hover-bg-color);
          border-color: var(--el-button-hover-border-color);
        }

        &:active {
          color: var(--el-button-active-text-color);
          background-color: var(--el-button-active-bg-color);
          border-color: var(--el-button-active-border-color);
        }

        &.is-disabled {
          --el-button-disabled-text-color: rgba(229, 234, 243, 0.5);
          --el-button-disabled-bg-color: #3a3a3a;
          --el-button-disabled-border-color: #4a4a4a;

          color: var(--el-button-disabled-text-color);
          background-color: var(--el-button-disabled-bg-color);
          border-color: var(--el-button-disabled-border-color);
        }

        &.el-button--primary {
          --el-button-text-color: #fff;
          --el-button-bg-color: #1458cf;
          --el-button-border-color: #1458cf;
          --el-button-hover-text-color: #fff;
          --el-button-hover-bg-color: #1049b1;
          --el-button-hover-border-color: #1049b1;
          --el-button-active-text-color: #fff;
          --el-button-active-bg-color: #0d3a92;
          --el-button-active-border-color: #0d3a92;
        }
      }
    }
  }
}
</style>
