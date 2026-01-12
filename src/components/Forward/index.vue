<template>
  <!-- 转发弹窗：左右布局，左侧列表，右侧已选 -->
  <Teleport to="body">
    <div v-if="visible" class="overlay" @click.self="close">
      <div class="dialog">
        <!-- 标题栏 -->
        <h3 class="dialog-title">转发消息</h3>
        <!-- 搜索框 -->
        <input v-model="searchTerm" class="search" placeholder="搜索联系人..." type="text" />
        <!-- 主体容器：左右两栏 -->
        <div class="body">
          <!-- 左：联系人列表 -->
          <ul class="contact-list">
            <li v-for="contact in filteredContacts" :key="contact.id" :class="{ selected: selected.has(contact.id) }"
              @click="toggleSelect(contact.id)">
              <span class="avatar">
                <Avatar :avatar="contact.avatar || ' '" :name="contact.name" :width="32" :borderRadius="3" />
              </span>
              <span>{{ contact.name }}</span>
            </li>
          </ul>
          <!-- 右：已选联系人 -->
          <ul class="selected-list">
            <li v-for="id in Array.from(selected)" :key="id">
              <Avatar :avatar="getAvatar(id)" :name="getName(id)" :width="32" :borderRadius="16" />
              <span>{{ getName(id) }}</span>
              <button class="remove-btn" @click="toggleSelect(id)">×</button>
            </li>
          </ul>
        </div>
        <!-- 底部操作 -->
        <div class="actions">
          <button class="btn btn-cancel" @click="close">取消</button>
          <button class="btn btn-confirm" @click="confirm">确认发送 ({{ selected.size }})</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script lang="ts" setup>
import Avatar from "@/components/Avatar/index.vue";
interface Contact {
  id: string;
  name: string;
  avatar: string;
}

const props = defineProps<{
  visible: boolean;
  contacts: Contact[];
}>();
const emit = defineEmits<{
  (e: "update:visible", val: boolean): void;
  (e: "confirm", selectedIds: string[]): void;
}>();

const searchTerm = ref("");
const selected = ref<Set<string>>(new Set());

const filteredContacts = computed(() => {
  const term = searchTerm.value.trim().toLowerCase();
  return props.contacts.filter(c => c.name.toLowerCase().includes(term));
});

function toggleSelect(id: string) {
  if (selected.value.has(id)) selected.value.delete(id);
  else selected.value.add(id);
}

function close() {
  emit("update:visible", false);
  selected.value.clear();
}

function confirm() {
  emit("confirm", Array.from(selected.value));
  close();
}

// 选择重置
watch(
  () => props.visible,
  val => {
    if (val) {
      searchTerm.value = "";
      selected.value.clear();
    }
  }
);

/** 通过 id 获取头像 */
function getAvatar(id: string) {
  const c = props.contacts.find(c => c.id === id);
  return c ? c.avatar : "";
}

/** 通过 id 获取名字 */
function getName(id: string) {
  const c = props.contacts.find(c => c.id === id);
  return c ? c.name : "";
}
</script>

<style lang="scss" scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.dialog {
  background: #fff;
  width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  overflow: hidden;
}

.dialog-title {
  margin: 0;
  padding: 12px;
  font-size: 16px;
  border-bottom: 1px solid #eee;
}

.search {
  margin: 12px 16px;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

.body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.contact-list,
.selected-list {
  flex: 1;
  margin: 0;
  padding: 8px;
  list-style: none;
  overflow-y: auto;
}

.contact-list li {
  display: flex;
  align-items: center;
  padding: 6px;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
}

.selected-list li {
  display: flex;
  align-items: center;
  padding: 6px;
  border-bottom: 1px solid #f0f0f0;
}

.contact-list li.selected {
  background: #e6f7ff;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  margin-right: 12px;
}

.remove-btn {
  margin-left: auto;
  background: transparent;
  border: none;
  font-size: 18px;
  cursor: pointer;
}

.actions {
  display: flex;
  justify-content: flex-end;
  padding: 12px 16px;
  border-top: 1px solid #eee;
}

.btn {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
}

.btn-cancel {
  background: #f5f5f5;
  margin-right: 8px;
}

.btn-confirm {
  background: #1890ff;
  color: #fff;
}
</style>
