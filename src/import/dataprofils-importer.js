import { buildUnifiedDNA, buildUnifiedFingerprint } from '../shape-engine/fingerprint-pipeline.js';
import { normalizePipelineSettings } from '../shape-engine/pipeline-settings.js';

export async function importDataprofilsText(text, onProgress = () => {}, pipelineSettings = {}) {
  const settings = normalizePipelineSettings(pipelineSettings);
  report(onProgress, 22, 'Extraction de la base', 'Lecture de dataprofils.json');
  const profiles = parseDataprofilsJson(text);

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
    source: 'dataprofils.json',
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

function parseDataprofilsJson(text) {
  try {
    const parsed = JSON.parse(String(text || '').trim());
    const profiles = Array.isArray(parsed) ? parsed : parsed.profiles;
    if (!Array.isArray(profiles)) throw new Error('Le fichier doit contenir un tableau de profils.');
    return profiles;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`dataprofils.json illisible : ${message}`);
  }
}

function normalizeProfile(profile) {
  const reference = textValue(profile.ref);
  const designation = textValue(profile.name);
  const width = numberValue(profile.profileWidth);
  const height = numberValue(profile.profileHeight);
  const svgPath = textValue(profile.path);

  if (!reference || !svgPath || !Number.isFinite(width) || !Number.isFinite(height) || height <= 0) return null;

  return {
    reference,
    designation,
    line: nullableText(profile.line),
    config: nullableText(profile.config),
    oldRef: nullableText(profile.oldRef),
    finish: nullableText(profile.finish),
    width,
    height,
    ratio: width / height,
    surface: numberValue(profile.area),
    weight: numberValue(profile.weight),
    perimeter: numberValue(profile.externalPerimeter),
    externalPerimeter: numberValue(profile.externalPerimeter),
    internalPerimeter: nullableNumber(profile.internalPerimeter),
    totalPerimeter: numberValue(profile.totalPerimeter),
    inertiaIxx: numberValue(profile.inertiaIxx),
    inertiaIyy: numberValue(profile.inertiaIyy),
    sectionModulusIxV: numberValue(profile.sectionModulusIxV),
    sectionModulusIyV: numberValue(profile.sectionModulusIyV),
    circumscribedDiameter: nullableNumber(profile.circumscribedDiameter),
    profileDiagonal: numberValue(profile.profileDiagonal),
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
