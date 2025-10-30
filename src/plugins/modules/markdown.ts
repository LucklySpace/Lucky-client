import { App } from "vue";
// @ts-ignore
import VMdEditor from "@kangc/v-md-editor";
import "@kangc/v-md-editor/lib/style/base-editor.css";
// @ts-ignore
import githubTheme from "@kangc/v-md-editor/lib/theme/github.js";
import "@kangc/v-md-editor/lib/theme/style/github.css";
//  @ts-ignore
import highlightjs from "highlight.js";
// @ts-ignore
import VMdPreview from "@kangc/v-md-editor/lib/preview";
import "@kangc/v-md-editor/lib/style/preview.css";

export default {
  install: (app: App) => {
    VMdEditor.use(githubTheme, {
      highlightjs
    });
    VMdPreview.use(githubTheme, {
      highlightjs
    });
    app.use(VMdEditor);
    app.use(VMdPreview);
  }
};
