// Fixed model→Mermaid template (spec §2.3–2.5, frozen; I1). Pure function of
// (model, level, config): no timestamps, no absolute paths, no config echo, no
// mermaid version string. Node builtins only — the `mermaid` package runs only
// inside Chromium (render-diagrams.mjs), never here.

// Bumped whenever any rule in spec §2.3–2.5 (or the §2.6 initialize options)
// changes; B3 consumers key on it via the render CLI's stdout line.
export const TEMPLATE_VERSION = 1;

// Standard C4-PlantUML palette (§2.4). Fixed order, fixed bytes; all five are
// emitted at every level regardless of which kinds occur.
const CLASS_DEF_LINES = [
  'classDef person fill:#08427b,color:#ffffff,stroke:#052e56',
  'classDef system fill:#1168bd,color:#ffffff,stroke:#0b4884',
  'classDef external fill:#999999,color:#ffffff,stroke:#6b6b6b,stroke-dasharray:5 5',
  'classDef container fill:#438dd5,color:#ffffff,stroke:#2e6295',
  'classDef component fill:#85bbf0,color:#000000,stroke:#5d82a8',
];

/** Entity-escape label text (§2.3), in this fixed order. */
function escapeLabel(text) {
  return String(text)
    .replaceAll('&', '#amp;')
    .replaceAll('<', '#lt;')
    .replaceAll('>', '#gt;')
    .replaceAll('"', '#quot;');
}

/** `name`, then `<br/>[tech]` when tech is present; each part escaped. */
function nodeLabel(node) {
  const name = escapeLabel(node.name);
  return node.tech ? `${name}<br/>[${escapeLabel(node.tech)}]` : name;
}

/** Shape per kind (§2.4) with the class attached via `:::`. */
function nodeLine(node, mermaidId) {
  const label = nodeLabel(node);
  switch (node.kind) {
    case 'person':
      return `${mermaidId}(["${label}"]):::person`;
    case 'component':
      return `${mermaidId}("${label}"):::component`;
    // system, external, container: rectangle.
    default:
      return `${mermaidId}["${label}"]:::${node.kind}`;
  }
}

/**
 * modelToMermaidSource(model, levelName, config) -> string  (frozen seam, B3)
 *
 * One `flowchart` per level built only from the model (already canonically
 * sorted per B1 §2.7.3) and the fixed rules. Mermaid node identifiers are
 * positional (`n<i>` = index in the level's nodes array) — model ids contain
 * `.`, which mermaid flowchart ids parse unreliably. Returns UTF-8 text with
 * exactly one trailing LF.
 */
export function modelToMermaidSource(model, levelName, _config) {
  const level = model.levels[levelName];
  const direction = levelName === 'component' ? 'LR' : 'TB';
  const lines = [
    `%% arch-timelapse template v${TEMPLATE_VERSION} level=${levelName}`,
    `flowchart ${direction}`,
    ...CLASS_DEF_LINES,
  ];

  const nodes = level.nodes;
  if (nodes.length === 0) {
    // Empty level (§2.3): synthetic node for legibility; still status ok.
    lines.push('n0["(empty level)"]:::component');
    return `${lines.join('\n')}\n`;
  }

  const idOf = new Map(nodes.map((n, i) => [n.id, `n${i}`]));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Subgraph plan per level (§2.5): owner node id → member node ids.
  const members = new Map();
  if (levelName === 'container') {
    const containerKind = nodes.filter((n) => n.kind === 'container');
    // Degenerate rule: zero containers ⇒ system.app stays a plain rectangle.
    if (containerKind.length > 0 && idOf.has('system.app')) {
      members.set(
        'system.app',
        containerKind.map((n) => n.id)
      );
    }
  } else if (levelName === 'component') {
    for (const n of nodes) {
      if (n.kind !== 'component') continue;
      const parent = n.container;
      // Defensive rule: dangling `container` id ⇒ the component stays
      // top-level (B1 guarantees this does not happen).
      if (parent !== undefined && idOf.has(parent)) {
        if (!members.has(parent)) members.set(parent, []);
        members.get(parent).push(n.id);
      }
    }
  }
  const memberIds = new Set([...members.values()].flat());

  // Top-level node lines, in model node order. A container-kind node that
  // owns zero members is a plain node here (mermaid empty subgraphs are not
  // exercised — same rationale as the container-level degenerate rule).
  for (const n of nodes) {
    if (members.has(n.id) || memberIds.has(n.id)) continue;
    lines.push(nodeLine(n, idOf.get(n.id)));
  }

  // Subgraph blocks, in model node order of the owning node; member lines
  // inside, in model node order, indented exactly two spaces (§2.3).
  for (const n of nodes) {
    if (!members.has(n.id)) continue;
    lines.push(`subgraph ${idOf.get(n.id)}["${nodeLabel(n)}"]`);
    for (const memberId of members.get(n.id)) {
      lines.push(`  ${nodeLine(nodeById.get(memberId), idOf.get(memberId))}`);
    }
    lines.push('end');
  }

  // Edge lines, in model edge order. B1 drops missing-endpoint edges; the
  // guard keeps a future model bug a bad diagram rather than a crash.
  for (const e of level.edges) {
    const from = idOf.get(e.from);
    const to = idOf.get(e.to);
    if (!from || !to) continue;
    lines.push(`${from} -- "${escapeLabel(e.label)}" --> ${to}`);
  }

  return `${lines.join('\n')}\n`;
}
