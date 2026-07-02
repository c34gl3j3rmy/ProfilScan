import { buildShapeDNA, buildShapeFingerprint } from '../shape-engine/signature-builder.js';

export async function importDataprofilsText(text) {
  const profiles = parseDataprofils(text);
  const validProfiles = profiles.map(normalizeProfile).filter(Boolean);
  if (validProfiles.length === 0) throw new Error('Aucun profil valide trouve.');

  const enriched = validProfiles.map(profile => ({
    ...profile,
    fingerprint: buildShapeFingerprint(profile),
    dna: buildShapeDNA(profile)
  }));

  return {
    id: 'local-profils',
    name: 'Base profils locale',
    source: 'dataprofils.js',
    importedAt: new Date().toISOString(),
    profiles: enriched
  };
}

function parseDataprofils(text) {
  const jsonText = extractArrayText(text);
  try {
    return JSON.parse(jsonText);
  } catch {
    const sanitized = jsonText
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3')
      .replace(/,\s*]/g, ']')
      .replace(/,\s*}/g, '}');
    return JSON.parse(sanitized);
  }
}

function extractArrayText(text) {
  const marker = text.indexOf('window.Profils');
  const start = text.indexOf('[', marker >= 0 ? marker : 0);
  if (start < 0) throw new Error('Tableau Profils introuvable.');
  let depth = 0;
  let inString = false;
  let quote = '';
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) inString = false;
      continue;
    }
    if (char === '"' || char === "'") { inString = true; quote = char; continue; }
    if (char === '[') depth++;
    if (char === ']') depth--;
    if (depth === 0) return text.slice(start, i + 1).replace(/'/g, '"');
  }
  throw new Error('Fin du tableau Profils introuvable.');
}

function normalizeProfile(profile) {
  if (!profile || !profile.reference || !profile.paths) return null;
  const width = Number(profile.largeur);
  const height = Number(profile.hauteur);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return {
    reference: String(profile.reference).trim(),
    designation: String(profile.designation || '').trim(),
    width,
    height,
    ratio: width / height,
    surface: Number(profile.surface) || 0,
    perimeter: Number(profile.perimetreExt) || 0,
    svgPath: String(profile.paths)
  };
}
