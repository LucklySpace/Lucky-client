# 虚拟列表组件使用说明

## 基础用法

```vue
<template>
  <VirtualList
    :listData="chatList"
    :estimatedItemSize="60"
    containerHeight="100%"
    :enableSticky="true"
    :stickyHeight="50"
    @scroll="handleScroll"
    @stickyChange="handleStickyChange"
    @reachBottom="handleReachBottom"
  >
    <!-- 固定标题插槽 -->
    <template #sticky-title="{ title }">
      <div class="sticky-header">
        <h3>{{ title }}</h3>
      </div>
    </template>
    
    <!-- 列表项插槽 -->
    <template #default="{ item, index, isSticky }">
      <div class="chat-item" :class="{ 'sticky-item': isSticky }">
        <div class="avatar">
          <img :src="item.avatar" :alt="item.name" />
        </div>
        <div class="content">
          <div class="name">{{ item.name }}</div>
          <div class="message">{{ item.lastMessage }}</div>
        </div>
        <div class="time">{{ formatTime(item.lastTime) }}</div>
      </div>
    </template>
  </VirtualList>
</template>

<script setup>
import VirtualList from '@/components/VirtualList/index.vue'

const chatList = ref([
  {
    id: 1,
    name: '张三',
    avatar: '/avatar1.jpg',
    lastMessage: '你好！',
    lastTime: Date.now(),
    isSticky: true,
    title: '置顶聊天'
  },
  {
    id: 2,
    name: '李四',
    avatar: '/avatar2.jpg',
    lastMessage: '在吗？',
    lastTime: Date.now() - 60000,
    isSticky: false
  }
  // ... 更多聊天项
])

const handleScroll = (scrollTop) => {
  console.log('滚动位置:', scrollTop)
}

const handleStickyChange = (title) => {
  console.log('固定标题变化:', title)
}

const handleReachBottom = () => {
  console.log('到达底部')
}
</script>
```

## 属性说明

| 属性                | 类型       | 默认值    | 说明          |
|-------------------|----------|--------|-------------|
| listData          | Array    | []     | 列表数据        |
| estimatedItemSize | Number   | 100    | 预估项目高度      |
| containerHeight   | String   | '100%' | 容器高度        |
| bufferScale       | Number   | 3      | 缓冲区比例       |
| useLoading        | Boolean  | false  | 是否使用加载动画    |
| enableSticky      | Boolean  | true   | 是否启用固定标题    |
| stickyHeight      | Number   | 50     | 固定标题高度      |
| getItemKey        | Function | -      | 获取项目键值      |
| getItemHeight     | Function | -      | 获取项目高度      |
| isStickyItem      | Function | -      | 判断项目是否为固定标题 |
| getItemTitle      | Function | -      | 获取项目标题      |

## 事件说明

| 事件名          | 参数        | 说明     |
|--------------|-----------|--------|
| scroll       | scrollTop | 滚动事件   |
| stickyChange | title     | 固定标题变化 |
| reachBottom  | -         | 到达底部   |

## 插槽说明

| 插槽名          | 参数                    | 说明     |
|--------------|-----------------------|--------|
| default      | item, index, isSticky | 列表项内容  |
| sticky-title | title                 | 固定标题内容 |

## 固定标题功能

当启用固定标题功能时，组件会自动检测滚动位置并显示相应的标题。标题会在滚动时固定在顶部，提供更好的用户体验。

### 数据结构要求

要使用固定标题功能，你的数据需要包含以下字段：

```javascript
{
  id: 1,
  name: '用户名',
  isSticky: true,        // 是否为固定标题项
  title: '标题文本',      // 标题文本
  height: 60             // 项目高度（可选）
}
```

### 自定义判断逻辑

你可以通过 `isStickyItem` 属性来自定义判断逻辑：

```javascript
:isStickyItem="(item) => item.type === 'header' || item.isPinned"
```

## 性能优化建议

1. **合理设置预估高度**：`estimatedItemSize` 应该接近实际项目的平均高度
2. **使用稳定的键值**：确保 `getItemKey` 返回的值在数据更新时保持稳定
3. **避免频繁更新**：减少不必要的重新渲染
4. **合理设置缓冲区**：`bufferScale` 影响预渲染的项目数量

## 注意事项

1. 固定标题功能会增加一定的计算开销，建议在数据量较大时使用
2. 确保容器有明确的高度设置
3. 滚动事件会频繁触发，注意性能优化
4. 自定义高度函数应该返回准确的高度值

