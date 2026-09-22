// Audit the calibration evaluator at the sample sizes the lab actually uses. Run: node program/calib-audit.ts
import { auditCalibrationEvaluator } from '../kit/threshold.ts';
console.log('n      false-alarm  power   trustworthy');
for (const n of [40, 100, 150, 300, 600, 1500]) {
  const a = auditCalibrationEvaluator(n, 200);
  console.log(`${String(n).padEnd(6)} ${(a.falseAlarmRate * 100).toFixed(1).padStart(6)}%    ${(a.power * 100).toFixed(1).padStart(5)}%   ${a.trustworthy}`);
}
