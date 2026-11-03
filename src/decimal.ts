import Decimal from 'decimal.js';
// Input decimal strings have at most 60 characters; retain guard digits for logs and ratios.
export const D = Decimal.clone({ precision: 90, rounding: Decimal.ROUND_HALF_EVEN });
export const rounded = (value: Decimal) => value.toFixed(12, Decimal.ROUND_HALF_EVEN);
export const mean = (values: Decimal[]) => values.reduce((sum, value) => sum.plus(value), new D(0)).div(values.length);
export function median(values: Decimal[]) {
  const sorted = [...values].sort((a,b) => a.cmp(b)), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : sorted[middle - 1]!.plus(sorted[middle]!).div(2);
}
