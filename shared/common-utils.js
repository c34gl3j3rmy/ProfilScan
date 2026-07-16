export function sameReference(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

export function round(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

export function roundedScore(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

export function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? round(number) : null;
}

export function numericDiff(a, b) {
  const first = Number(a);
  const second = Number(b);
  return Number.isFinite(first) && Number.isFinite(second) ? round(first - second) : null;
}

export function positiveNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 100;
}

export function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function formatError(error) {
  if (error instanceof Error && error.message) return error.message;
  if (error?.message) return String(error.message);
  if (error?.filename) return `${error.filename}:${error.lineno || '?'} - ${error.message || 'Erreur script'}`;
  if (error?.type) return `Evenement ${error.type}`;
  return String(error);
}
