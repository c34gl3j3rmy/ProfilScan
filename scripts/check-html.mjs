#!/usr/bin/env node

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const EXCLUDED_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.cache']);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;

    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.html') files.push(fullPath);
  }

  return files;
}

const files = await walk(ROOT);
const failures = [];

for (const file of files) {
  const source = (await readFile(file, 'utf8')).toLowerCase();

  for (const tag of ['html', 'head', 'body']) {
    const hasOpening = source.includes(`<${tag}`);
    const hasClosing = source.includes(`</${tag}>`);

    if (hasOpening !== hasClosing) {
      failures.push(`${path.relative(ROOT, file).split(path.sep).join('/')} : balise ${tag} non equilibree`);
    }
  }
}

if (failures.length) {
  console.error(`Structure HTML incoherente dans ${failures.length} cas :`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`OK - ${files.length} fichier(s) HTML controle(s).`);
}
