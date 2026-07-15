import { hausdorffScore } from './hausdorff.js';
import { icpScore } from './icp.js';
import { buildLocalFeatureSignature, compareLocalFeatureSignatures } from './local-feature-signature.js';
import { compareMinutiaeSignatures } from './minutiae-signature.js';
import { compareEllipticFourier } from './elliptic-fourier.js';
import { compareStructuralSignatures } from './structural-signature.js';
import { ransacLineScore } from './ransac.js';
import { fuseScores } from './score-fusion.js';
import { normalizePoints } from './shape-normalizer.js';
import { shapeContextScore } from './shape-context.js';
import { zernikeLikeScore } from './zernike.js';

const DEFAULT_WEIGHTS = {
  ratio: 0.24,
  radial: 0.28,
  hu: 0,
  fourier: 0.10,
  angle: 0.22,
  fill: 0.03,
  minutiae: 0.10,
  localFeature: 0.13,
  advanced: 0.25
};

const DEFAULT_UI_WEIGHTS = {
  ratio: 18,
  radial: 32,
