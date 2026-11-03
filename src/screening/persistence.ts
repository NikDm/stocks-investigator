import { hash, type Lease } from '../persistence';
import { MarketCapture } from '../market/capture';
import type { Decision, SavedObservation } from '../market/types';
import { checkVersion, measure, rank, type ScreenResult, type ScreenRow } from './screen';

type Summary = Omit<ScreenResult,'rows' | 'universe'> & { universeCount: number; rowCount: number; inputHash: string; completedAt: number };
export class Screener {
  constructor(readonly capture: MarketCapture, readonly clock: () => number = Date.now) {}
  private sql(query: string, ...args: (string | number)[]) { return this.capture.foundation.db.prepare(query).bind(...args); }
  // One bounded metric partition per call; ranking is a separate compact stage.
  async step(lease: Lease, snapshotId: string, ruleVersion = 'screen-eval-v1', partitionSize = 50): Promise<boolean> {
    if (!Number.isInteger(partitionSize) || partitionSize < 1 || partitionSize > 50) throw new Error('invalid screening partition');
    const manifest = await this.capture.snapshot(snapshotId,0,0);
    if (!manifest) throw new Error('snapshot missing');
    checkVersion(manifest,ruleVersion);
    if (await this.sql('SELECT snapshot_id FROM screening_results WHERE snapshot_id=?',snapshotId).first()) return true;
    const decisions = (await this.sql(`SELECT d.value FROM market_decisions d LEFT JOIN screening_metrics m ON m.snapshot_id=d.snapshot_id AND m.ticker=d.ticker
      WHERE d.snapshot_id=? AND m.ticker IS NULL ORDER BY d.ticker LIMIT ?`,snapshotId,partitionSize).all<{ value: string }>()).results.map(r => JSON.parse(r.value) as Decision);
    if (decisions.length) {
      const ids = [...new Set(decisions.flatMap(d => d.inputIds))];
      // Fetch exact frozen versions, including their original acquisition times; no latest-history query.
      const saved = ids.length ? (await this.sql(`SELECT o.id,o.value,o.acquired_at,o.revision_of FROM market_observations o
        JOIN json_each(?) j ON o.id=j.value`,JSON.stringify(ids)).all<{ id: string; value: string; acquired_at: number; revision_of: string | null }>()).results : [];
      const observations = saved.map(r => ({ ...JSON.parse(r.value), id: r.id, acquiredAt: r.acquired_at, revisionOf: r.revision_of } as SavedObservation));
      const rows = measure({ manifest: { ...manifest, decisions }, observations, splitVolumeVerified: manifest.splitVolumeVerified === true });
      const writes = [];
      for (const row of rows) {
        const value = JSON.stringify(row), fingerprint = await hash(value);
        writes.push(this.sql('INSERT INTO screening_metrics(snapshot_id,ticker,fingerprint,value) VALUES(?,?,?,?)',snapshotId,row.ticker,fingerprint,value));
      }
      await this.capture.foundation.fenced(lease,this.clock(),writes);
      return false;
    }
    // Input IDs remain in persisted rows and market decisions; do not duplicate their full-universe payload in memory here.
    const compact = (await this.sql("SELECT ticker,fingerprint,json_set(value,'$.inputIds',json('[]')) AS value FROM screening_metrics WHERE snapshot_id=? ORDER BY ticker",snapshotId)
      .all<{ ticker: string; fingerprint: string; value: string }>()).results;
    const result = rank(manifest,compact.map(r => JSON.parse(r.value) as ScreenRow),ruleVersion);
    const { rows, universe, ...rest } = result;
    const summary: Summary = { ...rest, universeCount: universe.length, rowCount: rows.length,
      inputHash: await hash(JSON.stringify({ manifest, metrics: compact.map(r => [r.ticker,r.fingerprint]) })), completedAt: this.clock() };
    const writes = [];
    for (let offset = 0; offset < rows.length; offset += 100) {
      const page = rows.slice(offset,offset+100).map(r => ({ ticker: r.ticker, rank: r.rank, failedGates: r.failedGates,
        disposition: r.disposition, marketConfirmation: r.marketConfirmation, rs20: r.metrics?.rs20 ?? null }));
      writes.push(this.sql(`INSERT INTO screening_ranks(snapshot_id,ticker,value)
        SELECT ?,json_extract(value,'$.ticker'),value FROM json_each(?)`,snapshotId,JSON.stringify(page)));
    }
    writes.push(this.sql('INSERT INTO screening_results(snapshot_id,value) VALUES(?,?)',snapshotId,JSON.stringify(summary)));
    await this.capture.foundation.fenced(lease,this.clock(),writes);
    return true;
  }
  async result(snapshotId: string, offset = 0, limit = 100): Promise<(Summary & { rows: ScreenRow[]; offset: number }) | null> {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('invalid screening page');
    const summary = await this.sql('SELECT value FROM screening_results WHERE snapshot_id=?',snapshotId).first<{ value: string }>();
    if (!summary) return null;
    const rows = (await this.sql(`SELECT m.value AS metrics,r.value AS ranking FROM screening_metrics m JOIN screening_ranks r ON r.snapshot_id=m.snapshot_id AND r.ticker=m.ticker
      WHERE m.snapshot_id=? ORDER BY m.ticker LIMIT ? OFFSET ?`,snapshotId,limit,offset).all<{ metrics: string; ranking: string }>()).results.map(r => {
        const metric = JSON.parse(r.metrics) as ScreenRow;
        const { rs20, ...ranking } = JSON.parse(r.ranking) as Pick<ScreenRow,'rank' | 'failedGates' | 'disposition' | 'marketConfirmation'> & { rs20: string | null };
        return { ...metric, ...ranking, metrics: metric.metrics ? { ...metric.metrics, rs20 } : null };
      });
    return { ...JSON.parse(summary.value) as Summary, rows, offset };
  }
}
