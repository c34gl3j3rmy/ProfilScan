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
    else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.json') files.push(fullPath);
  }

  return files;
}

const files = await walk(ROOT);
const failures = [];

for (const file of files) {
  try {
    JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    failures.push({
      file: path.relative(ROOT, file).split(path.sep).join('/'),
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

if (failures.length) {
  console.error(`JSON invalide dans ${failures.length} fichier(s) :`);
  for (const failure of failures) console.error(`- ${failure.file}: ${failure.message}`);
  process.exitCode = 1;
} else {
  console.log(`OK - ${files.length} fichier(s) JSON controle(s).`);
}
