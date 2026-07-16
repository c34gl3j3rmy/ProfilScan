import { round } from '../shared/common-utils.js';

export function compareNormalizedBBoxes(uploadCanvas, expectedCanvas) {
  const size = 512;
  const left = cropToBbox(uploadCanvas, size);
  const right = cropToBbox(expectedCanvas, size);
  const diff = compareMasks(canvasMask(left), canvasMask(right));
  return { size, ...diff };
}

export function cropToBbox(sourceCanvas, size) {
  const stats = analyzeCanvas(sourceCanvas);
  const target = document.createElement('canvas');
  target.width = size;
  target.height = size;
  const ctx = target.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  if (!stats.bbox) return target;
  const margin = 24;
  const scale = Math.min((size - margin * 2) / stats.bbox.width, (size - margin * 2) / stats.bbox.height);
  const drawWidth = stats.bbox.width * scale;
  const drawHeight = stats.bbox.height * scale;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(sourceCanvas, stats.bbox.x, stats.bbox.y, stats.bbox.width, stats.bbox.height, (size - drawWidth) / 2, (size - drawHeight) / 2, drawWidth, drawHeight);
  return target;
}

export function drawBitmapToCanvas(bitmap, canvas, label) {
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

export function drawDiff(uploaded, expected, output) {
  const width = Math.max(uploaded.width, expected.width);
  const height = Math.max(uploaded.height, expected.height);
  output.width = width;
  output.height = height;

  const ctx = output.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const left = normalizedMask(uploaded, width, height);
  const right = normalizedMask(expected, width, height);
  const diff = compareMasks(left, right);
  const image = ctx.createImageData(width, height);

  for (let i = 0; i < left.length; i++) {
    const a = left[i];
    const b = right[i];
    const offset = i * 4;
    if (a && b) setPixel(image.data, offset, 0, 0, 0);
    else if (a) setPixel(image.data, offset, 220, 38, 38);
    else if (b) setPixel(image.data, offset, 37, 99, 235);
    else setPixel(image.data, offset, 255, 255, 255);
  }

  ctx.putImageData(image, 0, 0);
  const stats = {
    label: 'Difference visuelle',
    width,
    height,
    commonPixels: diff.commonPixels,
    onlyUploadPixels: diff.onlyUploadPixels,
    onlyExpectedPixels: diff.onlyExpectedPixels,
    emptyPixels: diff.emptyPixels,
    similarityPercent: diff.similarityPercent,
    differencePercent: diff.differencePercent,
    legend: 'noir=commun, rouge=upload seul, bleu=attendu seul'
  };
  return { canvas: output, stats };
}

export function compareMasks(left, right) {
  let common = 0;
  let onlyUpload = 0;
  let onlyExpected = 0;
  let empty = 0;
  for (let i = 0; i < left.length; i++) {
    const a = left[i];
    const b = right[i];
    if (a && b) common++;
    else if (a) onlyUpload++;
    else if (b) onlyExpected++;
    else empty++;
  }
  const union = common + onlyUpload + onlyExpected;
  return {
    commonPixels: common,
    onlyUploadPixels: onlyUpload,
    onlyExpectedPixels: onlyExpected,
    emptyPixels: empty,
    similarityPercent: union ? round(common / union * 100) : 100,
    differencePercent: union ? round((onlyUpload + onlyExpected) / union * 100) : 0
  };
}

export function normalizedMask(sourceCanvas, width, height) {
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

export function analyzeCanvas(canvas) {
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

export function bboxFill(stats) {
  if (!stats?.bbox) return null;
  return round(stats.darkPixels / (stats.bbox.width * stats.bbox.height));
}

export function canvasMask(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const mask = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < mask.length; i++) {
    const offset = i * 4;
    mask[i] = isDark(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]) ? 1 : 0;
  }
  return mask;
}

export function isDark(r, g, b, a) {
  if (a < 20) return false;
  return (r + g + b) / 3 < 180;
}

export function drawScoreChart(canvas, rows) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('Sous-scores Top1 vs profil attendu', 28, 36);
  ctx.font = '14px sans-serif';
  ctx.fillText('Top1 = barre haute · attendu = barre basse · delta attendu-Top1 : positif favorable, negatif penalisant', 28, 62);

  if (!rows.length) {
    ctx.font = '18px sans-serif';
    ctx.fillText('Aucun sous-score comparable : le profil attendu est probablement absent du Top10.', 28, 130);
    return;
  }

  const plotX = 70;
  const plotY = 95;
  const plotWidth = width - 120;
  const plotHeight = 320;
  const maxScore = Math.max(1, ...rows.flatMap(row => [Number(row.top1) || 0, Number(row.expected) || 0]));
  const groupWidth = plotWidth / rows.length;
  const barWidth = Math.max(10, Math.min(34, groupWidth * 0.32));

  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = plotY + plotHeight - (i / 5) * plotHeight;
    ctx.beginPath();
    ctx.moveTo(plotX, y);
    ctx.lineTo(plotX + plotWidth, y);
    ctx.stroke();
    ctx.fillStyle = '#6b7280';
    ctx.fillText(String(round((i / 5) * maxScore)), 18, y + 5);
  }

  rows.forEach((row, index) => {
    const center = plotX + index * groupWidth + groupWidth / 2;
    const topHeight = ((Number(row.top1) || 0) / maxScore) * plotHeight;
    const expectedHeight = ((Number(row.expected) || 0) / maxScore) * plotHeight;
    const topX = center - barWidth - 2;
    const expectedX = center + 2;
    const baseY = plotY + plotHeight;

    ctx.fillStyle = '#64748b';
    ctx.fillRect(topX, baseY - topHeight, barWidth, topHeight);
    ctx.fillStyle = Number(row.deltaExpectedMinusTop1) >= 0 ? '#166534' : '#b91c1c';
    ctx.fillRect(expectedX, baseY - expectedHeight, barWidth, expectedHeight);

    ctx.save();
    ctx.translate(center - 4, plotY + plotHeight + 92);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = '#111827';
    ctx.font = '13px sans-serif';
    ctx.fillText(row.key, 0, 0);
    ctx.restore();
  });

  ctx.fillStyle = '#64748b';
  ctx.fillRect(plotX, height - 55, 18, 12);
  ctx.fillStyle = '#111827';
  ctx.fillText('Top1', plotX + 26, height - 44);
  ctx.fillStyle = '#166534';
  ctx.fillRect(plotX + 110, height - 55, 18, 12);
  ctx.fillStyle = '#111827';
  ctx.fillText('Attendu meilleur ou egal', plotX + 136, height - 44);
  ctx.fillStyle = '#b91c1c';
  ctx.fillRect(plotX + 330, height - 55, 18, 12);
  ctx.fillStyle = '#111827';
  ctx.fillText('Attendu penalise', plotX + 356, height - 44);
}

export function renderScoreRows(table, rows) {
  table.innerHTML = '';
  const header = document.createElement('tr');
  ['descripteur', 'Top1', 'attendu', 'delta attendu-Top1'].forEach(text => {
    const th = document.createElement('th');
    th.textContent = text;
    header.appendChild(th);
  });
  table.appendChild(header);
  rows.forEach(row => {
    const tr = document.createElement('tr');
    [row.key, row.top1, row.expected, row.deltaExpectedMinusTop1].forEach((value, index) => {
      const td = document.createElement('td');
      td.textContent = value === null || value === undefined ? '-' : String(value);
      if (index === 3 && Number(value) < 0) td.className = 'warn';
      if (index === 3 && Number(value) > 0) td.className = 'ok';
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
}

export function drawPanel(ctx, source, x, y, width, height, title) {
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

export function setPixel(data, offset, r, g, b) {
  data[offset] = r;
  data[offset + 1] = g;
  data[offset + 2] = b;
  data[offset + 3] = 255;
}
