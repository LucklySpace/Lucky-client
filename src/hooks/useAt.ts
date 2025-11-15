import { onMounted, onUnmounted, Ref, shallowReactive } from "vue";
import { useLogger } from "./useLogger";
import { useChatStore } from "@/store/modules/chat";
import { IMessageType } from "@/constants";

// 工具函数
const AT_PATTERN = /@([^@\s]*)$/;
const getAtMatch = (text: string) => AT_PATTERN.exec(text);

interface AtDialog {
  showDialog: boolean;
  node: Text | null;
  endIndex: number | undefined;
  position: { x: number; y: number };
  queryString: string;
  user: Record<string, any>;
}

export default function useAt(inputContentRef: Ref<HTMLElement | null>) {
  // 日志
  const log = useLogger();

  const chatMessageStore = useChatStore();

  const atDialogParam = shallowReactive<AtDialog>({
    showDialog: false,
    node: null,
    endIndex: 0,
    position: { x: 0, y: 0 },
    queryString: "",
    user: {}
  });

  /**
   * 隐藏 @ 弹窗
   */
  const onHideAt = () => {
    atDialogParam.showDialog = false;
  };

  // 插入标签后隐藏选择框
  const onPickUser = (user: any) => {
    replaceAtUser(user);
    atDialogParam.user = user;
    atDialogParam.showDialog = false;
  };

  //  裁剪字符串
  const replaceString = (raw: string, replace: string) => {
    return raw.replace(AT_PATTERN, replace);
  };

  // 获取节点
  const getRangeNode = (): Text | null => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const node = selection.focusNode;
    return node && node.nodeType === Node.TEXT_NODE ? (node as Text) : null;
  };

  // 获取光标位置
  const getCursorIndex = (): number => {
    const selection = window.getSelection();
    return selection?.focusOffset ?? 0;
  };

  // 弹窗出现的位置（修复空 rect 报错问题）
  const getRangeRect = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return { x: 0, y: 0 };
    const range = selection.getRangeAt(0);
    const rect = range.getClientRects()[0];
    const LINE_HEIGHT = -160;
    return rect ? { x: rect.x, y: rect.y + LINE_HEIGHT } : { x: 0, y: 0 };
  };

  // 创建标签
  const createAtButton = (user: any) => {
    const dom = document.createElement("span");
    dom.classList.add("active-text", "at-user");
    // 这里的contenteditable属性设置为false，删除时可以整块删除
    dom.setAttribute("contenteditable", "false");
    // 将id存储在dom元素的标签上，便于后续数据处理
    dom.setAttribute("data-id", user.userId);
    dom.innerHTML = `@${user.name}&nbsp`;
    dom.style.color = "blue";
    return dom;
  };

  // 获取 @ 用户
  const getAtUser = () => {
    const node = getRangeNode();
    if (!node) return undefined;
    const content = node.textContent || "";
    const match = getAtMatch(content.slice(0, getCursorIndex()));
    return match && match[1] ? match[1] : undefined;
  };

  /**
   * 判断当前光标前是否有未结束的 "@xxx" 输入
   */
  const showAt = (): boolean => {
    const node = getRangeNode();
    if (!node) return false;
    const offset = getCursorIndex();
    const text = node.textContent?.substring(0, offset) ?? "";
    return AT_PATTERN.test(text);
  };

  // 光标移到最后
  const cursorToEnd = () => {
    if (window.getSelection && inputContentRef.value) {
      inputContentRef.value.focus();
      const selection = window.getSelection();
      selection?.selectAllChildren(inputContentRef.value);
      selection?.collapseToEnd();
    }
  };

  // 插入@标签
  const replaceAtUser = (user: any) => {
    const node = atDialogParam.node;
    if (!node || !user || !inputContentRef.value) return;
    const content = node.textContent || "";
    const endIndex = atDialogParam.endIndex ?? 0;
    const preSlice = replaceString(content.slice(0, endIndex), "");
    const restSlice = content.slice(endIndex);
    const nextNode = node.nextSibling;
    const previousTextNode = new Text(preSlice + "\u200b");
    const nextTextNode = new Text("\u200b" + restSlice);
    const atButton = createAtButton(user);

    // 防止 node 不是 inputContentRef 的直接子节点
    if (node.parentNode === inputContentRef.value) {
      inputContentRef.value.removeChild(node);
    }

    if (nextNode) {
      inputContentRef.value.insertBefore(previousTextNode, nextNode);
      inputContentRef.value.insertBefore(atButton, nextNode);
      inputContentRef.value.insertBefore(nextTextNode, nextNode);
    } else {
      inputContentRef.value.appendChild(previousTextNode);
      inputContentRef.value.appendChild(atButton);
      inputContentRef.value.appendChild(nextTextNode);
    }
    cursorToEnd();
  };

  // 节流处理
  let lastKeyup = 0;

  const onKeyUp = (event: KeyboardEvent) => {
    const now = Date.now();
    if (now - lastKeyup < 50) return; // 50ms 节流
    lastKeyup = now;
    try {
      if (showAt() && !getAtUser() && chatMessageStore.getCurrentType == IMessageType.GROUP_MESSAGE.code) {
        const node = getRangeNode();
        const endIndex = getCursorIndex();
        atDialogParam.node = node;
        atDialogParam.endIndex = endIndex;
        atDialogParam.position = getRangeRect();
        atDialogParam.queryString = getAtUser() || "";
        atDialogParam.showDialog = true;
      } else {
        atDialogParam.showDialog = false;
      }
    } catch (err) {
      log.prettyError("useAt", "onKeyUp 处理失败：", err);
    }
  };

  // 添加全局点击事件监听器，点击弹窗外区域关闭弹窗
  const handleDocumentClick = (e: MouseEvent) => {
    if (
      atDialogParam.showDialog &&
      !e.composedPath().some((el: any) => el.classList && el.classList.contains("at-dialog"))
    ) {
      atDialogParam.showDialog = false;
    }
  };

  onMounted(() => {
    document.addEventListener("click", handleDocumentClick);
  });

  onUnmounted(() => {
    document.removeEventListener("click", handleDocumentClick);
  });

  return {
    atDialogParam,
    onHideAt,
    onPickUser,
    onKeyUp
  };
}