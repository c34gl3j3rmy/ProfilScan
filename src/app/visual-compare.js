import { loadImageFile } from './image-import.js';
import { renderSvgTextToBitmap } from './svg-rasterizer.js';
import { getCollection } from '../storage/indexed-db.js';

const fileInput = document.querySelector('#fileInput');
const referenceInput = document.querySelector('#referenceInput');
const compareButton = document.querySelector('#compareButton');
const downloadButton = document.querySelector('#downloadButton');
const statusNode = document.querySelector('#status');

const uploadedCanvas = document.querySelector('#uploadedCanvas');
const expectedCanvas = document.querySelector('#expectedCanvas');
const diffCanvas = document.querySelector('#diffCanvas');
const uploadedStats = document.querySelector('#uploadedStats');
const expectedStats = document.querySelector('#expectedStats');
const diffStats = document.querySelector('#diffStats');

let lastComparison = null;

compareButton?.addEventListener('click', runVisualComparison);
downloadButton?.addEventListener('click', downloadComparisonPng);
fileInput?.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file && !referenceInput.value.trim()) referenceInput.value = referenceFromFilename(file.name);
});

async function runVisualComparison() {
  const file = fileInput?.files?.[0];
  if (!file) {
    setStatus('Selectionne un fichier SVG/image a comparer.', true);
    return;
  }

  compareButton.disabled = true;
  downloadButton.disabled = true;
  setStatus('Chargement de la base locale...');

  try {
    const collection = await getCollection();
    if (!collection?.profiles?.length) throw new Error('Base locale absente. Importe d abord dataprofils.json dans ProfilScan.');

    const expectedReference = (referenceInput.value || referenceFromFilename(file.name)).trim();
    const expectedProfile = collection.profiles.find(profile => sameReference(profile.reference, expectedReference));
    if (!expectedProfile) throw new Error('Reference attendue introuvable dans la base : ' + expectedReference);

    setStatus('Rasterisation du fichier uploadé...');
    const uploadedBitmap = await loadImageFile(file);

    setStatus('Rasterisation du profil attendu depuis dataprofils.json...');
    const expectedBitmap = await renderProfileBitmap(expectedProfile);

    const uploaded = drawBitmapToCanvas(uploadedBitmap, uploadedCanvas, 'Image uploadée');
    const expected = drawBitmapToCanvas(expectedBitmap, expectedCanvas, 'Profil attendu');
    const diff = drawDiff(uploadedCanvas, expectedCanvas, diffCanvas);

    renderStats(uploadedStats, uploaded.stats);
    renderStats(expectedStats, expected.stats);
    renderStats(diffStats, diff.stats);

    lastComparison = { fileName: file.name, expectedReference, uploadedCanvas, expectedCanvas, diffCanvas, uploadedStats: uploaded.stats, expectedStats: expected.stats, diffStats: diff.stats };
    downloadButton.disabled = false;
    setStatus('Comparaison prête : ' + file.name + ' vs ' + expectedReference + '.', diff.stats.differencePercent > 8);
  } catch (error) {
    setStatus(formatError(error), true);
  } finally {
    compareButton.disabled = false;
  }
}

async function renderProfileBitmap(profile) {
  const svgText = buildProfileSvg(profile);
  return renderSvgTextToBitmap(svgText, { targetMaxSize: 1024, minSize: 384, margin: 24 });
}

function buildProfileSvg(profile) {
  const width = positiveNumber(profile.width, profile.raw?.profileWidth, 100);
  const height = positiveNumber(profile.height, profile.raw?.profileHeight, 100);
  const path = String(profile.svgPath || profile.raw?.path || '').trim();
  if (!path) throw new Error('Profil sans chemin SVG exploitable : ' + profile.reference);
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '"><path d="' + escapeAttribute(path) + '" fill="#000" stroke="#000" stroke-width="0.12" fill-rule="evenodd" stroke-linejoin="round" stroke-linecap="round"/></svg>';
}

function drawBitmapToCanvas(bitmap, canvas, label) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const maxSize = 720;
  const scale = Math.min(maxSize / bitmap.width, maxSize / bitmap.height, 1);
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const stats = analyzeCanvas(canvas);
  stats.label = label;
  stats.sourceWidth = bitmap.width;
  stats.sourceHeight = bitmap.height;
  return { canvas, stats };
}

function drawDiff(uploaded, expected, output) {
  const width = Math.max(uploaded.width, expected.width);
  const height = Math.max(uploaded.height, expected.height);
  output.width = width;
  output.height = height;

  const ctx = output.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const left = normalizedMask(uploaded, width, height);
  const right = normalizedMask(expected, width, height);
  const image = ctx.createImageData(width, height);
  let common = 0;
  let onlyUpload = 0;
  let onlyExpected = 0;
  let empty = 0;

  for (let i = 0; i < left.length; i++) {
    const a = left[i];
    const b = right[i];
    const offset = i * 4;
    if (a && b) {
      common++;
      image.data[offset] = 0;
      image.data[offset + 1] = 0;
      image.data[offset + 2] = 0;
      image.data[offset + 3] = 255;
    } else if (a) {
      onlyUpload++;
      image.data[offset] = 220;
      image.data[offset + 1] = 38;
      image.data[offset + 2] = 38;
      image.data[offset + 3] = 255;
    } else if (b) {
      onlyExpected++;
      image.data[offset] = 37;
      image.data[offset + 1] = 99;
      image.data[offset + 2] = 235;
      image.data[offset + 3] = 255;
    } else {
      empty++;
      image.data[offset] = 255;
      image.data[offset + 1] = 255;
      image.data[offset + 2] = 255;
      image.data[offset + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  const union = common + onlyUpload + onlyExpected;
  const stats = {
    label: 'Différence visuelle',
    width,
    height,
    commonPixels: common,
    onlyUploadPixels: onlyUpload,
    onlyExpectedPixels: onlyExpected,
    emptyPixels: empty,
    similarityPercent: union ? round(common / union * 100) : 100,
    differencePercent: union ? round((onlyUpload + onlyExpected) / union * 100) : 0,
    legend: 'noir=commun, rouge=upload seul, bleu=attendu seul'
  };
  return { canvas: output, stats };
}

function normalizedMask(sourceCanvas, width, height) {
  const temp = document.createElement('canvas');
  temp.width = width;
  temp.height = height;
  const ctx = temp.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  const scale = Math.min(width / sourceCanvas.width, height / sourceCanvas.height);
  const drawWidth = sourceCanvas.width * scale;
  const drawHeight = sourceCanvas.height * scale;
  const offsetX = (width - drawWidth) / 2;
  const offsetY = (height - drawHeight) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(sourceCanvas, offsetX, offsetY, drawWidth, drawHeight);
  return canvasMask(temp);
}

function analyzeCanvas(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let dark = 0;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const offset = (y * canvas.width + x) * 4;
      if (isDark(data[offset], data[offset + 1], data[offset + 2], data[offset + 3])) {
        dark++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  const bboxWidth = maxX >= minX ? maxX - minX + 1 : 0;
  const bboxHeight = maxY >= minY ? maxY - minY + 1 : 0;
  return {
    width: canvas.width,
    height: canvas.height,
    ratio: round(canvas.width / canvas.height),
    darkPixels: dark,
    darkPercent: round(dark / (canvas.width * canvas.height) * 100),
    bbox: bboxWidth ? { x: minX, y: minY, width: bboxWidth, height: bboxHeight, ratio: round(bboxWidth / bboxHeight) } : null
  };
}

function canvasMask(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const mask = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < mask.length; i++) {
    const offset = i * 4;
    mask[i] = isDark(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]) ? 1 : 0;
  }
  return mask;
}

function isDark(r, g, b, a) {
  if (a < 20) return false;
  return (r + g + b) / 3 < 180;
}

function renderStats(table, stats) {
  table.innerHTML = '';
  for (const [key, value] of Object.entries(stats || {})) {
    const row = document.createElement('tr');
    const th = document.createElement('th');
    const td = document.createElement('td');
    th.textContent = key;
    td.textContent = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
    row.append(th, td);
    table.appendChild(row);
  }
}

function downloadComparisonPng() {
  if (!lastComparison) return;
  const width = 1800;
  const height = 760;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText('ProfilScan comparaison visuelle - ' + lastComparison.fileName + ' vs ' + lastComparison.expectedReference, 32, 46);
  drawPanel(ctx, lastComparison.uploadedCanvas, 32, 82, 540, 540, 'Upload rasterisé');
  drawPanel(ctx, lastComparison.expectedCanvas, 630, 82, 540, 540, 'Profil attendu base');
  drawPanel(ctx, lastComparison.diffCanvas, 1228, 82, 540, 540, 'Différence');
  ctx.font = '18px sans-serif';
  ctx.fillText('Différence: ' + lastComparison.diffStats.differencePercent + '% · Similarité: ' + lastComparison.diffStats.similarityPercent + '%', 32, 690);
  ctx.fillText('noir=commun · rouge=upload seul · bleu=attendu seul', 32, 722);
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = 'profilscan-visual-compare-' + lastComparison.expectedReference + '-' + timestampForFile() + '.png';
  link.click();
}

function drawPanel(ctx, source, x, y, width, height, title) {
  ctx.strokeStyle = '#cbd5df';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(title, x, y - 12);
  const scale = Math.min((width - 24) / source.width, (height - 24) / source.height);
  const drawWidth = source.width * scale;
  const drawHeight = source.height * scale;
  ctx.drawImage(source, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function setStatus(message, isError = false) {
  if (!statusNode) return;
  statusNode.textContent = message;
  statusNode.className = 'status ' + (isError ? 'warn' : 'ok');
}

function referenceFromFilename(fileName) {
  const dot = fileName.lastIndexOf('.');
  return (dot > 0 ? fileName.slice(0, dot) : fileName).trim().replace(/\.min$/i, '');
}

function sameReference(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function positiveNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 100;
}

function escapeAttribute(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function round(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
