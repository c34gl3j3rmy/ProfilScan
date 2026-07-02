import { buildShapeDNA, buildShapeFingerprint } from '../shape-engine/signature-builder.js';

export async function importDataprofilsText(text, onProgress = () => {}) {
  report(onProgress, 22, 'Extraction de la base', 'Lecture du tableau Profils');
  const profiles = parseDataprofils(text);

  report(onProgress, 35, 'Validation des profils', `${profiles.length} profils trouves`);
  const validProfiles = [];
  let invalidCount = 0;

  for (let index = 0; index < profiles.length; index++) {
    const normalized = normalizeProfile(profiles[index]);
    if (normalized) validProfiles.push(normalized);
    else invalidCount++;

    if (index % 25 === 0 || index === profiles.length - 1) {
      const percent = 35 + ((index + 1) / profiles.length) * 20;
      report(onProgress, percent, 'Validation des profils', `${index + 1} / ${profiles.length}`);
      await yieldToBrowser();
    }
  }

  if (validProfiles.length === 0) throw new Error('Aucun profil valide trouve.');

  if (invalidCount > 0) {
    report(onProgress, 56, 'Validation terminee', `${invalidCount} profils ignores`);
  } else {
    report(onProgress, 56, 'Validation terminee', 'Tous les profils sont valides');
  }

  const enriched = [];
  for (let index = 0; index < validProfiles.length; index++) {
    const profile = validProfiles[index];
    const fingerprint = buildShapeFingerprint(profile);
    const dna = buildShapeDNA(profile);
    enriched.push({ ...profile, fingerprint, dna });

    if (index % 10 === 0 || index === validProfiles.length - 1) {
      const percent = 58 + ((index + 1) / validProfiles.length) * 30;
      report(onProgress, percent, 'Generation des signatures', `${index + 1} / ${validProfiles.length}`);
      await yieldToBrowser();
    }
  }

  report(onProgress, 90, 'Collection prete', `${enriched.length} profils prepares`);

  return {
    id: 'local-profils',
    name: 'Base profils locale',
    source: 'dataprofils.js',
    importedAt: new Date().toISOString(),
    stats: {
      totalProfiles: profiles.length,
      validProfiles: enriched.length,
      invalidProfiles: invalidCount
    },
    profiles: enriched
  };
}

function report(onProgress, percent, label, detail) {
  onProgress({ percent, label, detail });
}

function yieldToBrowser() {
  return new Promise(resolve => setTimeout(resolve, 0));
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

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      continue;
    }

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
