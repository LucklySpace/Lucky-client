import { DirectiveBinding } from "vue";

/**
 * 图片懒加载
 */
export const lazys: any = {
  // 当前dom元素，图片地址

  mounted(el: HTMLImageElement, binding: DirectiveBinding) {
    el.src = "@/assets/img/default.png";
    const { stop } = useIntersectionObserver(el, ([{ isIntersecting }]) => {
      if (isIntersecting) {
        el.src = binding.value;
        stop();
      }
    });
  }
};
