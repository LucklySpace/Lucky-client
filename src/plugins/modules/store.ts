import { App } from "vue";
import store from "@/store";

export default {
  install: (app: App) => {
    app.use(store);
  }
};
