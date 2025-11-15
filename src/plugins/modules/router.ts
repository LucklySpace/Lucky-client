import { App } from "vue";
import router from "../../router";

export default {
  install: (app: App) => {
    app.use(router);
  }
};
