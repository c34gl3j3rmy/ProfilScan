import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const IGNORED = new Set(['.git', 'node_modules']);
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.json', '.css', '.html']);
const findings = [];
const checked = [];

function walk(directory) {
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (IGNORED.has(entry.name)) continue;
    const absolute