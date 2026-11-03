import { z } from 'zod';
import { Conflict, type Foundation } from '../persistence';
export const feedbackSchema = z.discriminatedUnion('response',[
  z.object({ id: z.string().regex(/^[\w-]{1,100}$/), response: z.literal('no_response') }).strict(),
  z.object({ id: z.string().regex(/^[\w-]{1,100}$/), response: z.literal('responded'), minutes: z.number().min(0).max(1440).optional(),
    usefulness: z.enum(['useful','mixed','not_useful']).optional(), understanding: z.boolean().optional(), effort: z.boolean().optional(),
    decision: z.boolean().optional(), note: z.string().trim().max(1000).optional() }).strict(),
]);
export class ReviewFeedback {
  constructor(readonly store: Foundation, readonly clock: () => number = Date.now) {}
  async record(reportId: string, raw: unknown) {
    const value = feedbackSchema.parse(raw), encoded = JSON.stringify(value);
    const report = await this.store.db.prepare('SELECT artifact_at FROM morning_reports WHERE id=?').bind(reportId).first<{ artifact_at: number }>();
    if (!report || report.artifact_at>this.clock()) throw new Conflict('report unavailable');
    await this.store.db.prepare('INSERT INTO review_feedback(id,report_id,recorded_at,value) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING')
      .bind(value.id,reportId,this.clock(),encoded).run();
    const prior = await this.store.db.prepare('SELECT report_id,value FROM review_feedback WHERE id=?').bind(value.id).first<{ report_id: string; value: string }>();
    if (prior?.report_id!==reportId || prior.value!==encoded) throw new Conflict('feedback conflict');
  }
  async summary(month: string) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('invalid feedback month');
    const rows = (await this.store.db.prepare(`SELECT r.id,f.value FROM morning_reports r LEFT JOIN review_feedback f ON f.rowid=(
      SELECT rowid FROM review_feedback WHERE report_id=r.id ORDER BY recorded_at DESC,rowid DESC LIMIT 1)
      WHERE substr(r.report_date,1,7)=? AND json_extract(r.value,'$.status')!='unavailable' ORDER BY r.report_date`).bind(month)
      .all<{ id: string; value: string | null }>()).results;
    const feedback = rows.flatMap(r => r.value ? [feedbackSchema.parse(JSON.parse(r.value))] : []);
    const responses = feedback.filter(r => r.response==='responded');
    const minutes = responses.flatMap(r => r.minutes===undefined ? [] : [r.minutes]).sort((a,b) => a-b);
    const median = !minutes.length ? null : minutes.length%2 ? minutes[Math.floor(minutes.length/2)]! : (minutes[minutes.length/2-1]!+minutes[minutes.length/2]!)/2;
    return { eligible: rows.length, responses: responses.length, explicitNoResponse: feedback.length-responses.length, missing: rows.length-feedback.length,
      medianMinutes: median, timedResponses: minutes.length, within15: minutes.filter(m => m<=15).length,
      usefulness: Object.fromEntries(['useful','mixed','not_useful'].map(k => [k,responses.filter(r => r.usefulness===k).length])),
      usefulnessResponses: responses.filter(r => r.usefulness!==undefined).length,
      notes: responses.flatMap(r => r.note ? [r.note] : []) };
  }
}
