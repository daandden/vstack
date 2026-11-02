import { register, type DiagramModel } from "pele";
import sankey from "pele/diagrams/sankey";

const modes = new WeakMap<object, string>();
// Pele keeps merged source configuration outside its public model. Capture the native mode at render time.
register({
  ...sankey,
  render(model, config, options) {
    const settings = config.sankey;
    const colors = settings && typeof settings === "object" && !Array.isArray(settings) ? settings.nodeColors : undefined;
    if (colors && typeof colors === "object" && !Array.isArray(colors)) {
      for (const value of Object.values(colors)) if (typeof value === "string" && value.trim()) {
        throw new Error(`The Mermaid sets its own color (sankey.nodeColors:${value.trim()}). Remove nodeColors and use source-identity role or category bindings.`);
      }
    }
    const mode = settings && typeof settings === "object" && !Array.isArray(settings) ? settings.linkColor : undefined;
    modes.set(model, typeof mode === "string" ? mode : "gradient");
    return sankey.render(model, config, options);
  },
});

export function sankeyMode(model: DiagramModel) { return modes.get(model) ?? "gradient"; }
