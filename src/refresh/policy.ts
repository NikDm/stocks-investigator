// Admission reserves the worst bounded number of five-minute ticks. These limits
// are conservative local allowances; hosted throughput still needs measurement.
export const refreshPolicy = {
  tickMs: 300000, freezeMarginMs: 300000, cooldownMs: 600000, sessionLimit: 2,
  stagesPerName: 20, stagesPerTick: 10,
  priceDelayMs: 900000, staleAfterMs: 1200000, premarketBeforeOpenMs: 5.5*3600000,
} as const;
export function nextRefreshTick(now: number) { return now-now%refreshPolicy.tickMs+refreshPolicy.tickMs; }
export function refreshWorkWindow(count: number) {
  return Math.ceil((count*(refreshPolicy.stagesPerName+1)+1)/refreshPolicy.stagesPerTick)*refreshPolicy.tickMs;
}
