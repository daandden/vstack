export const DIAGRAM_CONFIG = { flowchart: { curve: "step" as const } };

export function readabilityRules(selector: string, background = "#1e1e2e"): string {
	return `${selector} tspan[baseline-shift] { font-size: 75%; }
${selector}:is(.pele-wardley, .pele-venn) text, ${selector} .pele-cluster-label {
	paint-order: stroke fill; stroke: ${background}; stroke-width: 0.3em; stroke-linejoin: round;
}`;
}
