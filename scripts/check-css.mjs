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
    else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.css') files.push(fullPath);
  }

  return files;
}

function removeComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

const files = await walk(ROOT);
const failures = [];

for (const file of files) {
  const source = removeComments(await readFile(file, 'utf8'));
  let balance = 0;

  for (const char of source) {
    if (char === '{') balance += 1;
    if (char === '}') balance -= 1;

    if (balance < 0) break;
  }

  if (balance !== 0) {
    failures.push(`${path.relative(ROOT, file).split(path.sep).join('/')} : accolades non equilibrees`);
  }
}

if (failures.length) {
  console.error(`Structure CSS incoherente dans ${failures.length} fichier(s) :`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`OK - ${files.length} fichier(s) CSS controle(s).`);
}
