import { evidenceSchema } from './assessment';

// Keep the recent change-review window, while explicitly cited older records remain
// verifiable. Never allow a growing immutable history to hide all newer evidence.
export async function acquiredEvidence(db: D1Database, securityId: string, cutoff: number, requiredIds: string[] = []) {
  if (requiredIds.length>50) throw new Error('too many evidence references');
  const rows = (await db.prepare(`SELECT value FROM research_evidence WHERE security_id=? AND acquired_at<=?
    ORDER BY CASE WHEN id IN (SELECT value FROM json_each(?)) THEN 0 ELSE 1 END,acquired_at DESC,rowid DESC LIMIT 50`)
    .bind(securityId,cutoff,JSON.stringify(requiredIds)).all<{ value: string }>()).results;
  return rows.reverse().map(r => evidenceSchema.parse(JSON.parse(r.value)));
}
