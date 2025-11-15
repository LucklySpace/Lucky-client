import { Directive, DirectiveBinding } from "vue";

/***
 * 防抖 单位时间只触发最后一次
 *  @param {?Number|300} time - 间隔时间
 *  @param {Function} fn - 执行事件
 *  @param {?String|"click"} event - 事件类型 例："click"
 *  @param {Array} binding.value - [fn,event,time]
 *  @author aChuan
 *  例：<el-button v-debounce="[reset,`click`,300]">刷新</el-button>
 *  也可简写成：<el-button v-debounce="[reset]">刷新</el-button>
 */
export const debounce: Directive = {
  mounted(el: HTMLElement, binding: DirectiveBinding) {
    let [fn, event = "click", time = 300] = binding.value;
    let timer: NodeJS.Timeout;
    el.addEventListener(event, () => {
      // setTimeou 返回值timeoutID是一个正整数，表示定时器的编号。这个值可以传递给clearTimeout()来取消该定时器。
      // 在同一个对象上（一个window或者worker），setTimeout()或者setInterval()在后续的调用不会重用同一个定时器编号。但是不同的对象使用独立的编号池。
      timer && clearTimeout(timer);
      // 在调用 clearTimeout() 方法销毁延时器后，timer 的值并未被清空
      timer = setTimeout(() => fn(), time);
    });
  }
};