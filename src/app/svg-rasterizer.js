export function isSvgFile(file) {
  return file?.type === 'image/svg+xml' || /\.svg$/i.test(file?.name || '');
}

export async function renderSvgFileToBitmap(file, options = {}) {
  if (!file) throw new Error('Aucun fichier SVG selectionne.');
  const text = await file.text();
  return renderSvgTextToBitmap(text, options);
}

export async function renderSvgTextToBitmap(text, options = {}) {
  const svgText = String(text || '').trim();
  if (!svgText) throw new Error('SVG vide.');

  const svgDocument = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const parserError = svgDocument.querySelector('parsererror');
  if (parserError) throw new Error('SVG illisible.');

  const svg = svgDocument.querySelector('svg');
  if (!svg) throw new Error('Balise SVG introuvable.');

  const viewBox = extractViewBox(svg);
  const paths = extractDrawablePaths(svgDocument);
  if (!paths.length) throw new Error('SVG sans chemin exploitable.');

  const targetMaxSize = clampNumber(options.targetMaxSize, 1024, 256, 2048);
  const minSize = clampNumber(options.minSize, 384, 128, 1024);
  const margin = clampNumber(options.margin, 24, 0, 96);
  const maxViewBoxSide = Math.max(viewBox.width, viewBox.height, 1);
  const scale = Math.max(1, (targetMaxSize - margin * 2) / maxViewBoxSide);
  const width = Math.max(minSize, Math.ceil(viewBox.width * scale + margin * 2));
  const height = Math.max(minSize, Math.ceil(viewBox.height * scale + margin * 2));
  const offsetX = (width - viewBox.width * scale) / 2;
  const offsetY = (height - viewBox.height * scale) / 2;

  const canvas = globalThis.document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas indisponible pour rasteriser le SVG.');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(offsetX - viewBox.x * scale, offsetY - viewBox.y * scale);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#000000';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(0.12, maxViewBoxSide / targetMaxSize);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const pathText of paths) {
    const path = new Path2D(pathText);
    ctx.fill(path, 'evenodd');
    ctx.stroke(path);
  }

  ctx.restore();
  return createImageBitmap(canvas);
}

function extractViewBox(svg) {
  const viewBox = svg.getAttribute('viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter(Number.isFinite);

  if (viewBox?.length >= 4 && viewBox[2] > 0 && viewBox[3] > 0) {
    return { x: viewBox[0], y: viewBox[1], width: viewBox[2], height: viewBox[3] };
  }

  const width = parseSvgLength(svg.getAttribute('width')) || 100;
  const height = parseSvgLength(svg.getAttribute('height')) || 100;
  return { x: 0, y: 0, width, height };
}

function extractDrawablePaths(svgDocument) {
  const pathTexts = [...svgDocument.querySelectorAll('path')]
    .map(path => path.getAttribute('d'))
    .map(value => String(value || '').trim())
    .filter(Boolean);

  const polylineTexts = [...svgDocument.querySelectorAll('polyline, polygon')]
    .map(element => pointsToPath(element.getAttribute('points'), element.tagName.toLowerCase() === 'polygon'))
    .filter(Boolean);

  return [...pathTexts, ...polylineTexts];
}

function pointsToPath(pointsText, closed) {
  const numbers = String(pointsText || '').match(/[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g)?.map(Number) || [];
  const pairs = [];
  for (let index = 0; index < numbers.length - 1; index += 2) pairs.push([numbers[index], numbers[index + 1]]);
  if (!pairs.length) return '';
  return `M ${pairs.map(pair => pair.join(' ')).join(' L ')}${closed ? ' Z' : ''}`;
}

function parseSvgLength(value) {
  const number = Number(String(value || '').replace(',', '.').match(/[-+]?(?:\d*\.\d+|\d+)/)?.[0]);
  return Number.isFinite(number) ? number : 0;
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}
