import { Directive } from "vue";

/***
 *  节流 每单位时间可触发一次
 *  第一次瞬间触发，最后一次不管是否达到间隔时间依然触发
 * 【考虑到input的change事件】
 *  @param {?Number|300} delay - 间隔时间
 *  例：<el-button  v-throttle="2000" @click="reflush">>刷新</el-button>
 */
export const throttle: Directive = {
  mounted(el: HTMLFieldSetElement, delay: any) {
    el.addEventListener("click", () => {
      // 禁用这个指令的DOM结构点击事件
      el.style.pointerEvents = "none";
      // 禁用按钮点击事件
      el.disabled = true;
      // 将按钮样式置灰
      el.style.backgroundColor = "#ccc";
      el.style.border = "none";
      el.style.color = "#666";
      el.style.cursor = "default";
      setTimeout(() => {
          // 启动这个指令的DOM结构点击事件
          el.style.pointerEvents = "auto";
          el.disabled = false;
          el.style.backgroundColor = "";
          el.style.color = "";
          el.style.cursor = "";
        },
        delay.value || 1000);
      // 默认1秒
    });
  }
};