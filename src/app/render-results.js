export function renderResults(result) {
  const canvas = document.querySelector('#resultCanvas');
  const ctx = canvas.getContext('2d');
  canvas.width = result.width;
  canvas.height = result.height;

  if (result.preview) ctx.drawImage(result.preview, 0, 0);
  else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.lineWidth = Math.max(2, canvas.width / 300);
  ctx.strokeStyle = '#22c55e';
  ctx.fillStyle = '#22c55e';
  ctx.font = `${Math.max(14, canvas.width / 35)}px system-ui`;

  for (const item of result.items) {
    const { x, y, width, height } = item.boundingBox;
    ctx.strokeRect(x, y, width, height);
    ctx.fillText(`${item.reference} - ${Math.round(item.score)}%`, x, Math.max(20, y - 8));
  }

  document.querySelector('#detectedCount').textContent = `Profils detectes : ${result.items.length}`;
  const list = document.querySelector('#resultList');
  list.innerHTML = '';
  for (const item of result.items) {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${item.reference}</strong><br>${item.designation}<br>${Math.round(item.score)} %`;
    list.appendChild(li);
  }
}
