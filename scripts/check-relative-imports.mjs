import { access, readdir, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const SOURCE_ROOT = path.resolve('src');
const IMPORT_PATTERN = /(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g;
const EXTENSIONS = ['', '.js', '.mjs', '.cjs', '.json'];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else if (/\.(?:js|mjs|cjs)$/.test(entry.name)) files.push(fullPath);
  }

  return files;
}

async function exists(file) {
  try {
    await access(file, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveImport(importer, specifier) {
  const base = path.resolve(path.dirname(importer), specifier);
  const candidates = [
    ...EXTENSIONS.map(extension => `${base}${extension}`),
    path.join(base, 'index.js'),
    path.join(base, 'index.mjs'),
    path.join(base, 'index.cjs')
  ];

  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }

  return null;
}

const files = await walk(SOURCE_ROOT);
const missing = [];
let checked = 0;

for (const file of files) {
  const source = await readFile(file, 'utf8');
  IMPORT_PATTERN.lastIndex = 0;

  let match;
  while ((match = IMPORT_PATTERN.exec(source)) !== null) {
    const specifier = match[1] || match[2];
    checked += 1;

    if (!await resolveImport(file, specifier)) {
      missing.push(`${path.relative(process.cwd(), file)} -> ${specifier}`);
    }
  }
}

if (missing.length) {
  console.error('Imports relatifs introuvables :');
  for (const item of missing) console.error(`- ${item}`);
  process.exitCode = 1;
} else {
  console.log(`OK - ${checked} import(s) relatif(s) controle(s) dans ${files.length} fichier(s).`);
}
