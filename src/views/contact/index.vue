<template>
  <el-container>
    <!-- 联系人列表 -->
    <el-aside width="240px">
      <ContactView class="control_contact" />
    </el-aside>

    <!-- 右侧主区：动态组件 -->
    <el-main>
      <component :is="currentComponent" />
    </el-main>
  </el-container>
</template>

<script lang="ts" setup>
  import ContactView from "./ContactView/index.vue";
  import Contacts from "./ContactView/compontents/Contacts.vue";
  import Groups from "./ContactView/compontents/Groups.vue";
  import NewFriends from "./ContactView/compontents/NewFriends.vue";
  import { useFriendsStore } from "@/store/modules/friends";

  const store = useFriendsStore();

  /** 明确 key 集合与类型，避免字符串索引报错 */
  const keys = ["contacts", "groups", "newFriends"] as const;
  type Key = (typeof keys)[number];

  /** 用一个严格的 map，并提供默认 fallback（Contacts） */
  const componentMap: Record<Key, any> = {
    contacts: Contacts,
    groups: Groups,
    newFriends: NewFriends
  };

  /** currentComponent：如果 store.type 不存在或不匹配，返回 fallback */
  const currentComponent = computed(() => {
    // 有的 pinia store 里的 type 可能是 ref 或普通属性；直接读即可
    const t = (store as any).type ?? "contacts";
    // 强制为 Key（如果不在 keys 中会取 fallback）
    return (componentMap as Record<string, any>)[t] ?? Contacts;
  });
</script>

<style lang="scss" scoped>
  .control_contact {
    height: calc(100vh - 65px);
  }
</style>
