import { buildUnifiedDNA, buildUnifiedFingerprint } from '../shape-engine/fingerprint-pipeline.js';
import { normalizePipelineSettings } from '../shape-engine/pipeline-settings.js';

export async function importDataprofilsText(text, onProgress = () => {}, pipelineSettings = {}) {
  const settings = normalizePipelineSettings(pipelineSettings);
  report(onProgress, 22, 'Extraction de la base', 'Lecture de la base profils');
  const { profiles, sourceFormat } = parseDataprofils(text);

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
  let rasterizedCount = 0;
  let rasterFallbackCount = 0;

  for (let index = 0; index < validProfiles.length; index++) {
    const profile = validProfiles[index];
    const fingerprint = await buildUnifiedFingerprint({ kind: 'profile', profile }, settings);
    const dna = buildUnifiedDNA(profile, settings);
    enriched.push({ ...profile, fingerprint, dna: { ...dna, descriptors: fingerprint.descriptors, pipelineSettings: settings } });
    if (fingerprint.summary?.pipelineMode === 'svg-raster') rasterizedCount++;
    else rasterFallbackCount++;

    if (index % 10 === 0 || index === validProfiles.length - 1) {
      const percent = 58 + ((index + 1) / validProfiles.length) * 30;
      report(onProgress, percent, 'Generation des signatures', `${index + 1} / ${validProfiles.length} · raster ${rasterizedCount} · secours ${rasterFallbackCount}`);
      await yieldToBrowser();
    }
  }

  report(onProgress, 90, 'Collection prete', `${enriched.length} profils prepares · ${rasterizedCount} rasterises · ${rasterFallbackCount} secours`);

  return {
    id: 'local-profils',
    name: 'Base profils locale',
    source: sourceFormat,
    importedAt: new Date().toISOString(),
    pipelineSettings: settings,
    stats: {
      totalProfiles: profiles.length,
      validProfiles: enriched.length,
      invalidProfiles: invalidCount,
      rasterizedProfiles: rasterizedCount,
      rasterFallbackProfiles: rasterFallbackCount
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
  const trimmed = String(text || '').trim();
  const arrayText = looksLikeJson(trimmed) ? trimmed : extractArrayText(trimmed);
  const jsonText = looksLikeJson(trimmed) ? trimmed : toJsonLikeArray(arrayText);

  try {
    const parsed = JSON.parse(jsonText);
    const profiles = Array.isArray(parsed) ? parsed : parsed.profiles;
    if (!Array.isArray(profiles)) throw new Error('Le fichier doit contenir un tableau de profils.');
    return { profiles, sourceFormat: looksLikeJson(trimmed) ? 'dataprofils.json' : 'dataprofils.js' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Base profils illisible : ${message}`);
  }
}

function looksLikeJson(text) {
  return text.startsWith('[') || text.startsWith('{');
}

function toJsonLikeArray(arrayText) {
  const withoutComments = stripComments(arrayText);
  return withoutComments
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3')
    .replace(/,\s*([}\]])/g, '$1');
}

function stripComments(text) {
  let output = '';
  let inString = false;
  let quote = '';
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        output += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        index++;
      }
      continue;
    }

    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) inString = false;
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      output += char;
      continue;
    }

    if (char === '/' && next === '/') {
      inLineComment = true;
      index++;
      continue;
    }

    if (char === '/' && next === '*') {
      inBlockComment = true;
      index++;
      continue;
    }

    output += char;
  }

  return output;
}

function extractArrayText(text) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('Tableau profils introuvable.');
  return text.slice(start, end + 1);
}

function normalizeProfile(profile) {
  const reference = textValue(profile.ref ?? profile.reference);
  const designation = textValue(profile.name ?? profile.designation);
  const width = numberValue(profile.profileWidth ?? profile.largeur ?? profile.width);
  const height = numberValue(profile.profileHeight ?? profile.hauteur ?? profile.height);
  const svgPath = textValue(profile.path ?? profile.paths ?? profile.svgPath);

  if (!reference || !svgPath || !Number.isFinite(width) || !Number.isFinite(height) || height <= 0) return null;

  return {
    reference,
    designation,
    line: nullableText(profile.line ?? profile.ligne),
    config: nullableText(profile.config),
    oldRef: nullableText(profile.oldRef ?? profile.ancienneRef),
    finish: nullableText(profile.finish ?? profile.coloris),
    width,
    height,
    ratio: width / height,
    surface: numberValue(profile.area ?? profile.surface),
    weight: numberValue(profile.weight ?? profile.poids),
    perimeter: numberValue(profile.externalPerimeter ?? profile.perimetreExt),
    externalPerimeter: numberValue(profile.externalPerimeter ?? profile.perimetreExt),
    internalPerimeter: nullableNumber(profile.internalPerimeter ?? profile.perimetreInt),
    totalPerimeter: numberValue(profile.totalPerimeter ?? profile.perimetreTotal),
    inertiaIxx: numberValue(profile.inertiaIxx ?? profile.momentInertieIxx),
    inertiaIyy: numberValue(profile.inertiaIyy ?? profile.momentInertieIyy),
    sectionModulusIxV: numberValue(profile.sectionModulusIxV ?? profile.moduleFlexionIxV),
    sectionModulusIyV: numberValue(profile.sectionModulusIyV ?? profile.moduleFlexionIyV),
    circumscribedDiameter: nullableNumber(profile.circumscribedDiameter ?? profile.diametreCirconscrit),
    profileDiagonal: numberValue(profile.profileDiagonal ?? profile.diagonale),
    svgPath,
    raw: profile
  };
}

function textValue(value) {
  return String(value ?? '').trim();
}

function nullableText(value) {
  const text = textValue(value);
  return text || null;
}

function numberValue(value) {
  const number = parseNumericValue(value);
  return Number.isFinite(number) ? number : 0;
}

function nullableNumber(value) {
  const number = parseNumericValue(value);
  return Number.isFinite(number) ? number : null;
}

function parseNumericValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (value === null || value === undefined || value === '-') return NaN;
  const match = String(value).replace(',', '.').match(/[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/);
  return match ? Number(match[0]) : NaN;
}
