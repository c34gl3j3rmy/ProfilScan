export function buildShapeFingerprint(profile) {
  const values = [
    normalize(profile.width, 200),
    normalize(profile.height, 200),
    normalize(profile.ratio, 10),
    normalize(profile.surface, 2000),
    normalize(profile.perimeter, 1000)
  ];
  return {
    version: '1.0',
    reference: profile.reference,
    values,
    summary: {
      width: profile.width,
      height: profile.height,
      ratio: profile.ratio,
      surface: profile.surface,
      perimeter: profile.perimeter
    }
  };
}

export function buildShapeDNA(profile) {
  return {
    version: '1.0',
    identity: {
      reference: profile.reference,
      designation: profile.designation,
      collection: 'local'
    },
    globalShape: {
      width: profile.width,
      height: profile.height,
      ratio: profile.ratio,
      surface: profile.surface,
      perimeter: profile.perimeter
    },
    topology: {
      contourCount: 1,
      holeCount: 0,
      componentCount: 1
    },
    contour: {
      normalizedPoints: [],
      simplifiedPoints: []
    },
    descriptors: {
      hu: [],
      fourier: [],
      radial: [],
      angleHistogram: []
    },
    quality: {
      source: 'svg',
      confidence: 1,
      warnings: ['SVG path sampling non implemente dans ce scaffold.']
    }
  };
}

function normalize(value, max) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value / max));
}
