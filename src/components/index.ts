//svg图标组件
import SvgIcon from "@/components/SvgIcon/index.vue";
import "virtual:svg-icons-register";

import Pagination from "@/components/Pagination/index.vue";
import ContextMenu from "@/components/ContextMenu/index.vue";


import { App } from "vue";


/**
 *  自定义组件，进行全局注册
 * @param {*} Vue
 */
const install = function(app: App) {
  app.component("SvgIcon", SvgIcon);
  app.component("Pagination", Pagination);
  app.component("ContextMenu", ContextMenu);
};


export default install;
