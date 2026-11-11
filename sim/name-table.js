// Regenerates name-table.tex from the playtest page's own name list, so the two can't disagree.
//   node sim/name-table.js
const path = require('path');
const fs = require('fs');
const { loadPage } = require('./page');

const { api } = loadPage({});
const BS = '\\';
const orderIdx = Object.fromEntries((api.NAME_LIST || []).map(([, c], i) => [c, i]));
const order = c => orderIdx[c] ?? 0;
const rows = api.COMBOS.map(c => ({ c, name: api.NAME_OF[c], sum: [...c].reduce((a, b) => a + +b, 0) }))
  .map(r => ({ ...r, mod: r.sum % 5, role: api.ROLES[r.sum % 5] }))
  // within a role: the official table's order (Ars Goetia order) when there is one, else by total
  .sort((a, b) => a.mod - b.mod || (order(a.c) - order(b.c)) || a.sum - b.sum || a.c.localeCompare(b.c));

let body = '', last = null;
for (const r of rows) {
  if (last !== null && r.mod !== last) body += `${BS}midrule\n`;
  body += `${r.name.padEnd(12)}& ${r.c} & ${String(r.sum).padEnd(2)} & ${r.mod} & ${r.role} ${BS}${BS}\n`;
  last = r.mod;
}
const dots = api.CFG.MAX_DOTS, perRole = rows.length / 5;
const lines = [
  `${BS}documentclass[11pt]{article}`,
  `${BS}usepackage[margin=0.8in]{geometry}`,
  `${BS}usepackage{booktabs}`,
  `${BS}usepackage{array}`,
  '',
  `${BS}begin{document}`,
  '',
  `${BS}begin{center}`,
  `{${BS}Large ${BS}textbf{Court --- Name Table}}${BS}${BS}[4pt]`,
  `Combination = ${api.CFG.TOKENS} symbols, each with 1 to ${dots} dots (repeats allowed, order doesn't matter).${BS}${BS}`,
  `Role = (sum of dots) mod 5. ${rows.length} names, ${perRole} per role. Within each role, names are in the order they appear in the Ars Goetia.`,
  `${BS}end{center}`,
  '',
  `${BS}vspace{4pt}`,
  '',
  `${BS}begin{center}`,
  `${BS}small`,
  `${BS}renewcommand{${BS}arraystretch}{1.1}`,
  `${BS}begin{tabular}{l >{${BS}ttfamily}c c c l}`,
  `${BS}toprule`,
  `${BS}textbf{Name} & ${BS}textbf{${BS}rmfamily Combination} & ${BS}textbf{Sum} & ${BS}textbf{Mod 5} & ${BS}textbf{Role} ${BS}${BS}`,
  `${BS}midrule`,
  body + `${BS}bottomrule`,
  `${BS}end{tabular}`,
  `${BS}end{center}`,
  '',
  `${BS}end{document}`,
  '',
];
const out = path.resolve(__dirname, '../name-table.tex');
fs.writeFileSync(out, lines.join('\n'));
const per = {}; rows.forEach(r => per[r.role] = (per[r.role] || 0) + 1);
console.log(`${rows.length} names written to ${out}`, JSON.stringify(per));
