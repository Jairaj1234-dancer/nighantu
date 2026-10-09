/**
 * Give every markdown-generated table header the scope attribute it needs to be machine-readable.
 *
 * WHY. This site is mostly data tables, and a `<th>` with no `scope` leaves a consumer guessing
 * whether a header labels its column or its row. A human reading the rendered page infers it from
 * position; a parser cannot, and neither can a screen reader. 100 of the 1,077 built pages that
 * carry a table had no `scope` anywhere on them, including both brand comparison pages and the
 * whole dravyaguna property series, because markdown's table syntax emits a bare `<th>`.
 *
 * The hand-written tables on this site already do it: `<th scope="row">` appears throughout the
 * .astro pages. This brings the markdown-derived ones to the same standard rather than leaving the
 * site inconsistent with itself.
 *
 * WHAT PROMPTED IT. OpenAI's documentation is almost silent on page signals, and the one on-page
 * statement it does make is that ChatGPT Atlas reads a page's accessibility tree to interpret
 * structure. `scope` is what puts a data table's shape into that tree. It is also the native HTML
 * semantic rather than a vendor convention, which is the kind of thing worth doing regardless of
 * who currently reads it: it was correct before any engine asked for it.
 *
 * WHAT IT DOES NOT DO. It adds no `<caption>`. A caption has to say what the table is, which is an
 * editorial act, and 112 pages of auto-generated captions would be 112 pages of filler asserting
 * the generator's guess about the author's intent.
 */

const el = (n, tag) => n?.type === 'element' && n.tagName === tag;
const children = (n) => (n?.children ?? []).filter((c) => c.type === 'element');

/**
 * The table is walked structurally rather than by a generic visitor, because the answer for a `th`
 * depends entirely on where it sits: a header cell in `thead` labels a column, a header cell
 * opening a row in `tbody` labels that row. A visitor that sees cells without their section cannot
 * tell those apart, and a first attempt at this that tried to infer the section by searching back
 * up the tree was both unreadable and wrong.
 */
function scopeTable(table) {
  for (const section of children(table)) {
    const isHead = el(section, 'thead');
    const rows = el(section, 'tr') ? [section] : children(section).filter((r) => el(r, 'tr'));
    for (const row of rows) {
      const cells = children(row);
      cells.forEach((cell, i) => {
        if (!el(cell, 'th') || cell.properties?.scope) return;
        // In thead every th is a column header. In the body only a leading th is a row header;
        // a th appearing mid-row is something markdown cannot produce, so it is left alone.
        if (isHead) cell.properties = { ...cell.properties, scope: 'col' };
        else if (i === 0) cell.properties = { ...cell.properties, scope: 'row' };
      });
    }
  }
}

export function rehypeTableScope() {
  return (tree) => {
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (el(node, 'table')) scopeTable(node);
      for (const child of node.children ?? []) walk(child);
    };
    walk(tree);
  };
}
