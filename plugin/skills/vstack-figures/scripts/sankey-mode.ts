import { register, type DiagramModel } from "pele";
import sankey from "pele/diagrams/sankey";

const modes = new WeakMap<object, string>();
// Pele keeps merged source configuration outside its public model. Capture the native mode at render time.
register({
  ...sankey,
  render(model, config, options) {
    const settings = config.sankey;
    const mode = settings && typeof settings === "object" && !Array.isArray(settings) ? settings.linkColor : undefined;
    modes.set(model, typeof mode === "string" ? mode : "gradient");
    return sankey.render(model, config, options);
  },
});

export function sankeyMode(model: DiagramModel) { return modes.get(model) ?? "gradient"; }
