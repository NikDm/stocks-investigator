import { barSchema, type SavedObservation } from './types';
// Exact base-10 quantities; eligibility never rounds through binary money.
function quantity(text: string): [bigint, bigint] {
  const [whole, fraction = ''] = text.split('.');
  return [BigInt(whole! + fraction), 10n ** BigInt(fraction.length)];
}
export function compare(a: string, b: string) {
  const [an, ad] = quantity(a), [bn, bd] = quantity(b);
  return an * bd < bn * ad ? -1 : an * bd > bn * ad ? 1 : 0;
}
export function validBar(value: unknown) {
  const parsed = barSchema.safeParse(value);
  if (!parsed.success) return false;
  const b = parsed.data;
  return [b.o,b.h,b.l,b.c,b.v].every(n => compare(n,'0') > 0)
    && compare(b.l,b.o) <= 0 && compare(b.l,b.c) <= 0 && compare(b.h,b.o) >= 0 && compare(b.h,b.c) >= 0;
}
export function liquid(raw: SavedObservation[]) {
  const latest = barSchema.parse(raw.at(-1)!.value);
  if (compare(latest.c,'5') < 0) return 'below_price';
  const dollars = raw.slice(-20).map(row => {
    const bar = barSchema.parse(row.value), [cn,cd] = quantity(bar.c), [vn,vd] = quantity(bar.v);
    return { n: cn * vn, d: cd * vd };
  }).sort((a,b) => a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0);
  const a = dollars[9]!, b = dollars[10]!;
  return a.n * b.d + b.n * a.d >= 10000000n * a.d * b.d ? 'eligible' : 'below_liquidity';
}

export function openingTime(o: SavedObservation): bigint | null {
  const t = o.value['t'];
  if (typeof t !== 'string') return null;
  const match = t.match(/T\d{2}:\d{2}:\d{2}(?:\.(\d{1,9}))?(?:Z|[+-]\d{2}:\d{2})$/);
  const milliseconds = Date.parse(t);
  if (!match || !Number.isFinite(milliseconds)) return null;
  return BigInt(milliseconds)*1000000n + BigInt((match[1] ?? '').padEnd(9,'0').slice(3));
}
export function officialOpening(o: SavedObservation, venue: string, open: number) {
  const time = openingTime(o), price = o.value['p'];
  return o.feed==='sip' && o.basis==='raw' && o.value['x']===venue && o.value['c']==='Q'
    && time!==null && time>=BigInt(open)*1000000n && time<=BigInt(open+30*60000)*1000000n
    && typeof price==='string' && /^(0|[1-9]\d*)(\.\d+)?$/.test(price) && compare(price,'0')>0;
}
