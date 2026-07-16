#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = path.join(ROOT, 'audit-report.md');

const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.cache'
]);

const TEXT_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.json', '.html', '.css', '.md', '.yml', '.yaml'
]);

const issues = [];
const checked = {
  javascript: 0,
  json: 0,
  html: 0,
  css: 0,
  imports: 0,
  files: 0
};

function addIssue(file, severity, category, message, line = null) {
  issues.push({
    file: normalizePath(file),
    severity,
    category,
    message,
    line
  });
}

function normalizePath(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function walk(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === 'audit-report.md') continue;

    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        files.push(...walk(fullPath));
      }
      continue;
    }

    if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }

  return files;
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function checkJavaScriptSyntax(file) {
  checked.javascript += 1;

  const result = spawnSync(
    process.execPath,
    ['--check', file],
    { encoding: 'utf8' }
  );

  if (result.status !== 0) {
    const output = `${result.stderr || ''}\n${result.stdout || ''}`.trim();
    addIssue(
      file,
      'error',
      'Syntaxe JavaScript',
      output || 'Échec de node --check.'
    );
  }
}

function stripCommentsAndStrings(source) {
  let result = '';
  let state = 'code';
  let quote = '';
  let escaped = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];

    if (state === 'line-comment') {
      if (char === '\n') {
        state = 'code';
        result += '\n';
      } else {
        result += ' ';
      }
      continue;
    }

    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        state = 'code';
        result += '  ';
        i += 1;
      } else {
        result += char === '\n' ? '\n' : ' ';
      }
      continue;
    }

    if (state === 'string') {
      if (escaped) {
        escaped = false;
        result += ' ';
        continue;
      }

      if (char === '\\') {
        escaped = true;
        result += ' ';
        continue;
      }

      if (char === quote) {
        state = 'code';
        result += ' ';
      } else {
        result += char === '\n' ? '\n' : ' ';
      }
      continue;
    }

    if (char === '/' && next === '/') {
      state = 'line-comment';
      result += '  ';
      i += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      state = 'block-comment';
      result += '  ';
      i += 1;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      state = 'string';
      quote = char;
      result += ' ';
      continue;
    }

    result += char;
  }

  return result;
}

function checkDelimiterBalance(file, source) {
  const clean = stripCommentsAndStrings(source);
  const opening = new Map([
    ['(', ')'],
    ['[', ']'],
    ['{', '}']
  ]);
  const closing = new Map([
    [')', '('],
    [']', '['],
    ['}', '{']
  ]);
  const stack = [];

  let line = 1;

  for (const char of clean) {
    if (char === '\n') line += 1;

    if (opening.has(char)) {
      stack.push({ char, line });
      continue;
    }

    if (closing.has(char)) {
      const expected = closing.get(char);
      const previous = stack.pop();

      if (!previous || previous.char !== expected) {
        addIssue(
          file,
          'error',
          'Délimiteurs',
          `Délimiteur "${char}" inattendu.`,
          line
        );
        return;
      }
    }
  }

  for (const entry of stack) {
    addIssue(
      file,
      'error',
      'Délimiteurs',
      `Délimiteur "${entry.char}" non refermé.`,
      entry.line
    );
  }
}

function checkSuspiciousEnding(file, source) {
  const trimmed = source.trimEnd();
  if (!trimmed) {
    addIssue(file, 'warning', 'Contenu', 'Fichier vide.');
    return;
  }

  const lines = trimmed.split(/\r?\n/);
  const lastLine = lines.at(-1).trim();
  const lastMeaningful = lastLine.replace(/\/\/.*$/, '').trim();

  const suspiciousExact = new Set([
    'const',
    'let',
    'var',
    'return',
    'export',
    'import',
    'function',
    'class',
    'async',
    'else',
    'case',
    'throw',
    'new'
  ]);

  const suspiciousSuffixes = [
    '=',
    ',',
    '.',
    '=>',
    '&&',
    '||',
    '??',
    '+',
    '-',
    '*',
    '/',
    ':',
    '?',
    '(',
    '[',
    '{'
  ];

  if (suspiciousExact.has(lastMeaningful)) {
    addIssue(
      file,
      'error',
      'Fin de fichier',
      `Le fichier se termine sur l'instruction incomplète "${lastMeaningful}".`,
      lines.length
    );
    return;
  }

  if (suspiciousSuffixes.some(suffix => lastMeaningful.endsWith(suffix))) {
    addIssue(
      file,
      'error',
      'Fin de fichier',
      `Fin de fichier probablement tronquée : "${lastMeaningful}".`,
      lines.length
    );
  }

  const incompletePatterns = [
    /\b(const|let|var)\s+[A-Za-z_$][\w$]*\s*$/,
    /\breturn\s+[A-Za-z_$][\w$]*\s*$/,
    /\bimport\s+.*\s+from\s*$/,
    /\bexport\s+(default\s+)?$/,
    /\bfunction\s+[A-Za-z_$][\w$]*\s*\([^)]*$/,
    /\bif\s*\([^)]*$/,
    /\bfor\s*\([^)]*$/,
    /\bwhile\s*\([^)]*$/
  ];

  if (incompletePatterns.some(pattern => pattern.test(lastMeaningful))) {
    addIssue(
      file,
      'error',
      'Fin de fichier',
      `Dernière ligne manifestement incomplète : "${lastMeaningful}".`,
      lines.length
    );
  }
}

function resolveRelativeImport(importer, specifier) {
  const base = path.resolve(path.dirname(importer), specifier);

  const candidates = [
    base,
    `${base}.js`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}.json`,
    path.join(base, 'index.js'),
    path.join(base, 'index.mjs')
  ];

  return candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

function extractImports(source) {
  const imports = [];

  const staticImport = /\bimport\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicImport = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const exportFrom = /\bexport\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g;

  for (const regex of [staticImport, dynamicImport, exportFrom]) {
    let match;
    while ((match = regex.exec(source)) !== null) {
      imports.push(match[1]);
    }
  }

  return imports;
}

function checkRelativeImports(file, source) {
  const imports = extractImports(source);

  for (const specifier of imports) {
    if (!specifier.startsWith('.')) continue;

    checked.imports += 1;

    if (!resolveRelativeImport(file, specifier)) {
      addIssue(
        file,
        'error',
        'Import relatif',
        `La cible "${specifier}" est introuvable.`
      );
    }
  }
}

function extractNamedImports(source) {
  const entries = [];
  const regex = /\bimport\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;

  let match;
  while ((match = regex.exec(source)) !== null) {
    const specifier = match[2];

    if (!specifier.startsWith('.')) continue;

    const names = match[1]
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
      .map(item => item.split(/\s+as\s+/)[0].trim());

    entries.push({ specifier, names });
  }

  return entries;
}

function extractExportedNames(source) {
  const names = new Set();

  const declarationRegex =
    /\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
  const listRegex = /\bexport\s*\{([^}]+)\}/g;

  let match;

  while ((match = declarationRegex.exec(source)) !== null) {
    names.add(match[1]);
  }

  while ((match = listRegex.exec(source)) !== null) {
    for (const item of match[1].split(',')) {
      const parts = item.trim().split(/\s+as\s+/);
      if (parts.length) names.add(parts.at(-1).trim());
    }
  }

  if (/\bexport\s+default\b/.test(source)) {
    names.add('default');
  }

  return names;
}

function checkNamedImports(file, source) {
  for (const entry of extractNamedImports(source)) {
    const target = resolveRelativeImport(file, entry.specifier);
    if (!target || !/\.(?:js|mjs|cjs)$/.test(target)) continue;

    const exported = extractExportedNames(readText(target));

    for (const name of entry.names) {
      if (!exported.has(name)) {
        addIssue(
          file,
          'warning',
          'Export importé',
          `"${name}" est importé depuis "${entry.specifier}", mais aucun export statique correspondant n'a été détecté.`
        );
      }
    }
  }
}

function checkJson(file, source) {
  checked.json += 1;

  try {
    JSON.parse(source);
  } catch (error) {
    addIssue(
      file,
      'error',
      'JSON',
      error instanceof Error ? error.message : String(error)
    );
  }
}

function checkHtml(file, source) {
  checked.html += 1;

  const lower = source.toLowerCase();

  if (!lower.includes('<html') && path.basename(file).toLowerCase() === 'index.html') {
    addIssue(file, 'warning', 'HTML', 'index.html ne contient pas de balise <html>.');
  }

  const pairs = [
    ['html', '<html', '</html>'],
    ['head', '<head', '</head>'],
    ['body', '<body', '</body>']
  ];

  for (const [label, open, close] of pairs) {
    const hasOpen = lower.includes(open);
    const hasClose = lower.includes(close);

    if (hasOpen !== hasClose) {
      addIssue(file, 'error', 'HTML', `Balise ${label} non équilibrée.`);
    }
  }
}

function checkCss(file, source) {
  checked.css += 1;
  const clean = stripCommentsAndStrings(source);

  let balance = 0;
  let line = 1;

  for (const char of clean) {
    if (char === '\n') line += 1;
    if (char === '{') balance += 1;
    if (char === '}') balance -= 1;

    if (balance < 0) {
      addIssue(file, 'error', 'CSS', 'Accolade fermante inattendue.', line);
      return;
    }
  }

  if (balance > 0) {
    addIssue(file, 'error', 'CSS', `${balance} accolade(s) non refermée(s).`);
  }
}

function severityIcon(severity) {
  if (severity === 'error') return '❌';
  if (severity === 'warning') return '⚠️';
  return 'ℹ️';
}

function buildReport(files) {
  const errors = issues.filter(issue => issue.severity === 'error');
  const warnings = issues.filter(issue => issue.severity === 'warning');

  const lines = [
    '# Rapport d’audit ProfilScan',
    '',
    `Généré le ${new Date().toISOString()}`,
    '',
    '## Résumé',
    '',
    `- Fichiers texte contrôlés : **${checked.files}**`,
    `- Fichiers JavaScript contrôlés : **${checked.javascript}**`,
    `- Imports relatifs contrôlés : **${checked.imports}**`,
    `- Fichiers JSON contrôlés : **${checked.json}**`,
    `- Fichiers HTML contrôlés : **${checked.html}**`,
    `- Fichiers CSS contrôlés : **${checked.css}**`,
    `- Erreurs : **${errors.length}**`,
    `- Avertissements : **${warnings.length}**`,
    ''
  ];

  if (!issues.length) {
    lines.push('## Résultat', '', '✅ Aucun problème détecté.', '');
    return lines.join('\n');
  }

  lines.push(
    '## Fichiers suspects',
    '',
    '| État | Fichier | Catégorie | Ligne | Détail |',
    '|---|---|---|---:|---|'
  );

  for (const issue of issues.sort((a, b) =>
    a.file.localeCompare(b.file)
    || a.severity.localeCompare(b.severity)
    || (a.line || 0) - (b.line || 0)
  )) {
    const message = issue.message.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
    lines.push(
      `| ${severityIcon(issue.severity)} | \`${issue.file}\` | ${issue.category} | ${issue.line || ''} | ${message} |`
    );
  }

  lines.push('', '## Fichiers contrôlés', '');

  for (const file of files.map(normalizePath).sort()) {
    lines.push(`- \`${file}\``);
  }

  lines.push('');
  return lines.join('\n');
}

const files = walk(ROOT);
checked.files = files.length;

for (const file of files) {
  const extension = path.extname(file).toLowerCase();
  const source = readText(file);

  if (['.js', '.mjs', '.cjs'].includes(extension)) {
    checkJavaScriptSyntax(file);
    checkDelimiterBalance(file, source);
    checkSuspiciousEnding(file, source);
    checkRelativeImports(file, source);
    checkNamedImports(file, source);
    continue;
  }

  if (extension === '.json') {
    checkJson(file, source);
    continue;
  }

  if (extension === '.html') {
    checkHtml(file, source);
    continue;
  }

  if (extension === '.css') {
    checkCss(file, source);
  }
}

const report = buildReport(files);
fs.writeFileSync(REPORT_PATH, report, 'utf8');

console.log(report);
console.log(`\nRapport écrit dans ${normalizePath(REPORT_PATH)}`);

const errorCount = issues.filter(issue => issue.severity === 'error').length;
process.exitCode = errorCount > 0 ? 1 : 0;
