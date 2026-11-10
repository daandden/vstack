import { register, type DiagramModel } from "pele";
import { register as registerLazy } from "pele/core";
import sankey from "pele/diagrams/sankey";

const settingsByModel = new WeakMap<object, unknown>();
// The full and lazy Pele entry points have separate registries and keep merged config outside the model.
const trackedSankey: typeof sankey = {
  ...sankey,
  render(model, config, options) {
    settingsByModel.set(model, config.sankey);
    return sankey.render(model, config, options);
  },
};
register(trackedSankey);
registerLazy(trackedSankey);

export function sankeyMode(model: DiagramModel) {
  const settings = settingsByModel.get(model);
  const colors = settings && typeof settings === "object" && !Array.isArray(settings) && "nodeColors" in settings ? settings.nodeColors : undefined;
  if (colors && typeof colors === "object" && !Array.isArray(colors)) {
    for (const value of Object.values(colors)) if (typeof value === "string" && value.trim()) {
      throw new Error(`The Mermaid sets its own color (sankey.nodeColors:${value.trim()}). Remove nodeColors and use source-identity role or category bindings.`);
    }
  }
  const mode = settings && typeof settings === "object" && !Array.isArray(settings) && "linkColor" in settings ? settings.linkColor : undefined;
  return typeof mode === "string" ? mode : "gradient";
}
