import { isDeepStrictEqual } from "node:util";
import { CST, Document, isMap, isScalar, isSeq, parseDocument, type Node, type YAMLMap, type YAMLSeq } from "yaml";

const options = { keepSourceTokens: true } as const;
const stringifyOptions = { lineWidth: 0 };

export function yamlBookkeeping(source: string) {
  const document = parseDocument(source, options);
  if (document.errors.length) throw document.errors[0];
  const root = document.contents!;
  const [start, , end] = root.range!;
  const value = document.toJS();

  function fragment(node: Node, indent: number) {
    const copy = node.clone(); copy.commentBefore = null; copy.spaceBefore = false;
    const text = new Document(copy).toString(stringifyOptions);
    return parseDocument(text.split("\n").map(line => line ? " ".repeat(indent) + line : line).join("\n"), options).contents!;
  }

  function normalizeEntryIndentation(items: CST.CollectionItem[], indent: number) {
    return items.map((item, index) => {
      const first = item.start[0];
      if (index === 0 && first?.type === "space") item.start.shift();
      else if (index > 0 && first?.type !== "space") item.start.unshift({ type: "space", source: " ".repeat(indent), indent: 0, offset: 0 });
      return item;
    });
  }

  function flowEntries(items: CST.CollectionItem[], previous: CST.CollectionItem[]) {
    let tail = previous.filter(item => !item.key && !item.value);
    const last = previous.findLast(item => item.key || item.value);
    const result = items.map((item, index) => {
      if (!previous.includes(item) && index > 0 && items[index - 1] === last && tail.length) {
        item.start = [...tail.flatMap(entry => entry.start), ...item.start];
        tail = [];
      }
      if (index === 0) item.start = item.start.filter(token => token.type !== "comma");
      else if (!item.start.some(token => token.type === "comma")) item.start.unshift(
        { type: "comma", source: ",", indent: 0, offset: 0 },
        { type: "space", source: " ", indent: 0, offset: 0 },
      );
      return item;
    });
    if (!items.length) for (const item of tail) item.start = item.start.filter(token => token.type !== "comma");
    return [...result, ...tail];
  }

  function sync(node: Node, next: any): Node {
    if (isDeepStrictEqual(node.toJSON(), next)) return node;
    const token = node.srcToken as CST.Token & { indent: number };
    if (isMap(node) && next && !Array.isArray(next) && typeof next === "object") {
      const previous = node.items;
      node.items = Object.entries(next).map(([key, val]) => {
        const pair = previous.find(p => isScalar(p.key) && p.key.value === key);
        if (pair) {
          pair.value = sync(pair.value as Node, val);
          pair.srcToken!.value = (pair.value as Node).srcToken;
          return pair;
        }
        const addition = document.createNode({ [key]: val }); addition.flow = node.flow;
        const map = fragment(addition, token.indent) as YAMLMap;
        return map.items[0]!;
      });
      if (token.type === "flow-collection") {
        token.items = flowEntries(node.items.map(pair => pair.srcToken!), token.items);
        return node;
      }
      if (token.type === "block-map" && node.items.length) {
        token.items = normalizeEntryIndentation(node.items.map(pair => pair.srcToken!), token.indent) as CST.BlockMap["items"];
        return node;
      }
    } else if (isSeq(node) && Array.isArray(next)) {
      const original = node.items as Node[];
      const previous = [...original];
      const oldEntries = (token as CST.BlockSequence | CST.FlowCollection).items;
      const entriesByNode = new Map(previous.map((item, index) => [item, oldEntries[index]!]));
      node.items = next.map((val, position) => {
        let index = previous.findIndex(item => isMap(item) && val?.id ? item.get("id") === val.id : isDeepStrictEqual(item.toJSON(), val));
        if (index < 0 && original.length === next.length && isScalar(original[position]) && (val === null || typeof val !== "object")) index = previous.indexOf(original[position]!);
        if (index >= 0) return sync(previous.splice(index, 1)[0]!, val);
        const addition = document.createNode([val]); addition.flow = node.flow;
        const seq = fragment(addition, token.indent) as YAMLSeq;
        const item = seq.items[0] as Node;
        entriesByNode.set(item, (seq.srcToken as CST.BlockSequence | CST.FlowCollection).items[0]!);
        return item;
      });
      const currentEntries = (node.items as Node[]).map(item => entriesByNode.get(item)!);
      if (token.type === "flow-collection") {
        token.items = flowEntries(currentEntries, token.items);
        return node;
      }
      if (token.type === "block-seq" && node.items.length) {
        token.items = normalizeEntryIndentation(currentEntries, token.indent) as CST.BlockSequence["items"];
        return node;
      }
    } else if (isScalar(node) && (next === null || typeof next !== "object")) {
      node.value = next;
    } else {
      node = document.createNode(next);
    }
    const replacement = fragment(node, token.indent);
    const updated = replacement.srcToken!;
    if (CST.isScalar(token) && CST.isScalar(updated) && token.type !== "block-scalar" && updated.type !== "block-scalar") updated.end = token.end;
    Object.assign(token, updated);
    node.srcToken = token;
    return node;
  }

  return {
    value,
    text() {
      document.contents = sync(root, value) as typeof document.contents;
      return source.slice(0, start) + CST.stringify(document.contents!.srcToken!) + source.slice(end);
    },
  };
}

export function manifestVersion(source: string, version: string) {
  JSON.parse(source);
  const document = parseDocument(source);
  const node = document.get("version", true) as Node;
  const [start, end] = node.range!;
  return source.slice(0, start) + JSON.stringify(version) + source.slice(end);
}
