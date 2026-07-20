#!/usr/bin/env node

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();

const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.cache'
]);

const EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs'
]);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;

    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
      continue;
    }

    if (
      entry.isFile()
      && EXTENSIONS.has(path.extname(entry.name).toLowerCase())
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

const files = await walk(ROOT);
const failures = [];

for (const file of files) {
  const result = spawnSync(
    process.execPath,
    ['--check', file],
    { encoding: 'utf8' }
  );

  if (result.status !== 0) {
    const output = `${result.stderr || ''}\n${result.stdout || ''}`.trim();

    failures.push({
      file: path.relative(ROOT, file).split(path.sep).join('/'),
      output: output || 'Échec de node --check.'
    });
  }
}

if (failures.length) {
  console.error(`Erreur de syntaxe dans ${failures.length} fichier(s) :`);

  for (const failure of failures) {
    console.error(`\n--- ${failure.file} ---`);
    console.error(failure.output);
  }

  process.exitCode = 1;
} else {
  console.log(`OK - ${files.length} fichier(s) JavaScript contrôlé(s).`);
}
