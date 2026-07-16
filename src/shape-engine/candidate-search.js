import { hausdorffScore } from './hausdorff.js';
import { icpScore } from './icp.js';
import { buildLocalFeatureSignature, compareLocalFeatureSignatures } from './local-feature-signature.js';
import { compareMinutiaeSignatures } from './minutiae-signature.js';
import { ransacLineScore } from './ransac.js';
import { fuseScores } from './score-fusion.js';
import { normalizePoints