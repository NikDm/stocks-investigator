import { z } from 'zod';
import { calendarSchema, dateSchema } from './calendar';
export const identitySchema = z.object({
  brokerTicker: z.string(), isin: z.string(), securityId: z.string().min(1), issuerId: z.string().min(1),
  symbol: z.string().regex(/^[A-Z0-9][A-Z0-9.\/-]{0,24}$/), asof: dateSchema,
  primaryVenue: z.string(), securityType: z.string(), compositeFIGI: z.string().min(1), shareClassFIGI: z.string().min(1),
  listing: z.enum(['verified','unlisted','ambiguous','contradictory']),
  comparability: z.enum(['verified','unknown']).default('unknown'), verifiedActionIds: z.array(z.string()).default([]),
  evidence: z.array(z.string().url()).min(1).max(10), actionVersion: z.string().min(1),
  providerAssetId: z.string().optional(),
});
export const beginSchema = z.object({
  id: z.string().min(1).max(150), reportDate: dateSchema, calendar: calendarSchema, calendarFrom: dateSchema, calendarThrough: dateSchema,
  instruments: z.array(z.object({ ticker: z.string(), isin: z.string(), type: z.string(), currencyCode: z.string(), workingScheduleId: z.coerce.number().int() })),
  exchanges: z.array(z.object({ name: z.string(), workingSchedules: z.array(z.object({ id: z.coerce.number().int() })) })),
  identities: z.array(identitySchema), mappingVersion: z.string().min(1),
  sourceReceipts: z.array(z.string()).default([]), mappingGaps: z.array(z.object({ ticker: z.string(), reason: z.string() })).default([]),
});
export type Begin = z.input<typeof beginSchema>;
export type Identity = z.infer<typeof identitySchema>;
export type Decision = { ticker: string; isin: string; reason: string; identity: Identity | null; inputIds: string[] };
export type Snapshot = { ruleVersion: 'screen-eval-v1'; id: string; reportDate: string; expectedSession: string; deadline: number; open: number; close: number;
  auctionAfter: number; referenceDeadline: number; startedAt: number; cutoff: number | null; status: string;
  mappingVersion: string; sourceReceipts: string[]; decisions: Decision[]; calendar: z.infer<typeof calendarSchema>; calendarFrom: string; calendarThrough: string };
export const decimal = z.string().regex(/^(0|[1-9]\d*)(\.\d+)?$/).max(60);
export const barSchema = z.object({ t: z.string().datetime({ offset: true }), o: decimal, h: decimal, l: decimal, c: decimal, v: decimal });
export type Bar = z.infer<typeof barSchema>;
export const observationSchema = z.object({
  source: z.literal('alpaca').default('alpaca'), securityId: z.string().min(1), kind: z.enum(['daily','opening','action']), symbol: z.string(), asof: dateSchema,
  feed: z.enum(['sip','not_applicable']), basis: z.enum(['raw','split']), eventAt: z.number().int().nonnegative(), session: dateSchema,
  actionVersion: z.string(), mappingVersion: z.string(), value: z.record(z.string(), z.json()),
}).refine(o => o.feed === (o.kind === 'action' ? 'not_applicable' : 'sip') && (o.kind === 'daily' || o.basis === 'raw'), 'incorrect feed for observation kind');
export type Observation = z.infer<typeof observationSchema>;
export type SavedObservation = Observation & { id: string; acquiredAt: number; revisionOf: string | null };
export const requestSchema = z.object({
  id: z.string().min(1).max(100), kind: z.enum(['bars','auctions','actions']), basis: z.enum(['raw','split']),
  start: dateSchema, end: dateSchema, securities: z.array(identitySchema).min(1).max(100),
  freshnessAttempt: z.number().int().min(1).max(3).optional(), initialDeadlines: z.array(z.object({ session: dateSchema, cutoff: z.number().int().nonnegative() })).optional(), purpose: z.enum(['initial','revision']).optional(),
  notBefore: z.number().int().nonnegative().default(0), deadline: z.number().int().nonnegative().optional(),
});
export type MarketRequest = z.infer<typeof requestSchema>;
export type Task = { id: string; request: MarketRequest; token: string | null; page: number; state: string; attempts: number; next_at: number; reason: string | null };
export type ProviderPage = { observations: Observation[]; nextToken: string | null };
