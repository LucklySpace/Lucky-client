# 1.piniaStoreSync

该插件通过在各窗口间发送/接收事件（Tauri 的 `emit`/`listen`），把 Pinia 中指定的状态字段按需广播给其它窗口，从而实现*
*多窗口状态同步**（例如主窗口改了某个 UI 状态，通知到通知窗口/浮窗等）。

## 主要作用（Why）

- **保持多窗口的数据一致性**：当应用有多个窗口（主窗口、通知窗口、小工具窗等）时，让它们共享或复刻同一份关键状态（例如登录信息、通知开关、当前聊天
  ID）。
- **按需同步，减小流量和频率**：只同步 `paths` 指定的字段，并用防抖合并多次小变更，避免频繁发送大量数据。
- **解决并发/乱序**：通过序号（seq）和冲突策略，尽量避免“旧值覆盖新值”或多窗口并发写入导致的状态冲突。
- **支持中心化/分布式模式**：可设 `sourceWindow`（中心源窗口），其他窗口启动时从它拉取初始数据；也可以每个窗口主动广播，按需选择。

## 核心原理（How — 逐步展开）

1. **事件总线（Tauri 事件）作为通信媒介**
   插件使用 `emit("pinia-sync", payload)` 发送补丁，使用 `listen("pinia-sync", handler)` 接收。每个 payload 包含：
   `storeId`、`state`（补丁）、`from`（发起窗口 label）、可选 `to`（目标窗口数组）、`seq`（序号）、`ts`（时间戳）。
2. **只同步指定字段（paths）**
   插件不会广播整个 store，而是从 `store.$state` 中提取 `paths`（如 `"ui.open"`）对应的值，构造一个小的补丁对象发送。这样数据量小、开销低。
3. **防抖（debounce）合并**
   本窗口短时间内多次修改时，会把这些修改合并到 `pendingPatch`，并在防抖时间后一次性发送，减少事件频率。
4. **避免回环（isApplyingRemote）**
   当接收到远端补丁并把它 `store.$patch` 到本地时，会将 `isApplyingRemote` 置为 `true`，以避免该次 `patch` 再被本窗口的
   `$subscribe` 捕获并转发回去（从而产生无限循环）。
5. **顺序号（seq）与乱序保护**
   每个窗口发送补丁时给它分配自增 `seq`。接收方记录来自每个远端窗口的 `lastRemoteSeq`，如果收到的补丁 `seq`
   小于或等于已处理的值则忽略，从而防止网络延迟导致的旧补丁覆盖新状态。
6. **冲突策略（conflictStrategy）**
   三种策略：
    - `merge`（默认）：对象字段做浅合并（保留本地键并用远端覆盖同名键），非对象直接覆盖。
    - `lastWriteWins`：远端补丁直接覆盖本地（以远端为准）。
    - `localWins`：本地优先，只有本地值为空时才写入远端值。
      不同策略适用于不同业务语义。
7. **sourceWindow 模式（中心化拉取）**
   若配置 `sourceWindow`（比如 `main`），其它窗口启动时会发送 `pinia-sync-request` 给 `main`，`main`
   收到后按请求路径把当前值回发给请求者。适用于“主窗口是权威数据来源”的场景。
8. **清理机制**
   插件会保留所有监听的 `unlisten` / 取消订阅函数，并在 `beforeunload` 或显式 cleanup 时统一解绑，避免内存泄漏。

## 举例：一次典型的数据流

- 窗口 A（main）中 `foo.counter` 从 1 变成 2。
- 插件把 `counter` 写入 `pendingPatch`，防抖后
  `emit("pinia-sync", {storeId: 'foo', state: {counter:2}, from: 'main', seq: 3})`。
- 窗口 B（notify）监听到事件，检查 `seq`（比之前记录的新），根据冲突策略把 `counter` 更新到 2（调用 `store.$patch`）。同时设置
  `isApplyingRemote = true` 以防止回环。
- 窗口 B 更新完后 `isApplyingRemote` 清除。若窗口 B 本身在同一时间也改了 `counter`，seq 与冲突策略决定最终结果。

## 适用场景（什么时候用它）

- 桌面应用有多个窗口需要共享 UI 状态（全局 mute、当前活跃会话 id、主题切换、登录状态、通知计数等）。
- 需要在窗口与窗口之间低延迟同步小量状态。
- 想用中心源（sourceWindow）来集中管理某些状态（比如主窗口从后端拉数据，其他窗口只读）。

## 限制与注意事项（边界条件）

- **序列化限制**：插件通过 `structuredClone` 或 `JSON.stringify` 传数据，不能传函数、类实例方法或 DOM 节点。请只同步原始值和普通
  POJO。
- **数组/深合并**：默认 `merge` 是浅合并对象，不做复杂的数组合并策略（如 append / dedupe），对数组的合并可能不是你期望的语义，需要自定义逻辑时可扩展插件。
- **复杂并发场景**：若多窗口频繁并发写同一字段且对一致性要求高，简单的 seq/merge 可能不够，需考虑更强的一致性模型（CRDT、vector
  clock 等）。
- **安全/权限**：事件是窗口间广播，确保只在可信环境（桌面应用）使用；如果有敏感数据不要在不必要的窗口间广播。
- **性能**：尽量把 `paths` 设窄，避免频繁发送大对象。

## 常见故障排查

- 没生效：确认 Tauri 窗口创建时有正确 `label`，且前端 `getCurrentWindow().label` 与 Rust 侧一致。
- 无事件：打开 DevTools，看是否有 `emit("pinia-sync", ...)` 日志（可开启 `logLevel: 'debug'`）。
- 旧数据覆盖新数据：启用 debug，检查 payload 中 `seq`，确认接收方是否丢弃了旧 seq。
- 循环更新：确认 `isApplyingRemote` 逻辑生效（即 remote 应用时不会触发再发送），并检查是否有自定义代码在 `store.$subscribe`
  做了显式广播导致循环。