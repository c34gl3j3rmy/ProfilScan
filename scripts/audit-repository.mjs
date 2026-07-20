#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const REPORT_PATH = path.join(ROOT, 'audit-report.md');

const CHECKS = [
  ['Syntaxe JavaScript', 'scripts/check-js-syntax.mjs'],
  ['Imports relatifs', 'scripts/check-relative-imports.mjs'],
  ['JSON', 'scripts/check-json.mjs'],
  ['HTML', 'scripts/check-html.mjs'],
  ['CSS', 'scripts/check-css.mjs']
];

const results = [];

for (const [name, script] of CHECKS) {
  const result = spawnSync(
    process.execPath,
    [script],
    {
      cwd: ROOT,
      encoding: 'utf8'
    }
  );

  results.push({
    name,
    script,
    success: result.status === 0,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim()
  });
}

const failed = results.filter(result => !result.success);
const lines = [
  '# Rapport d’audit ProfilScan',
  '',
  `Généré le ${new Date().toISOString()}`,
  '',
  '## Résumé',
  '',
  `- Contrôles exécutés : **${results.length}**`,
  `- Réussis : **${results.length - failed.length}**`,
  `- Échoués : **${failed.length}**`,
  ''
];

for (const result of results) {
  lines.push(
    `## ${result.success ? '✅' : '❌'} ${result.name}`,
    '',
    `Script : \`${result.script}\``,
    '',
    '```text',
    result.output || 'Aucune sortie.',
    '```',
    ''
  );
}

const report = lines.join('\n');
await writeFile(REPORT_PATH, report, 'utf8');

console.log(report);
console.log(`\nRapport écrit dans ${path.relative(ROOT, REPORT_PATH)}`);

process.exitCode = failed.length ? 1 : 0;
