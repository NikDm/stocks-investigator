import { expect, it } from 'vitest';
import { historicalDiscoveryView } from '../src/outcomes/retrospective-history';

it('keeps early watch and rejected research overlapping and labels late evidence as hindsight', () => {
  const html = historicalDiscoveryView({ securityId:'A', cutoff:100,
    main:[], baseline:[], research:{outcome:'rejected',versionId:'original-version',gap:null},
    watch:true, disposition:'momentum_gate_failure', failedGates:['r20'], inputIds:['saved-input'],
    evidence:[{id:'then',acquiredAt:90,publishedAt:80},{id:'later',acquiredAt:101,publishedAt:80}],
  });
  expect(html).toContain('Not surfaced');
  expect(html).toContain('early-watch-only');
  expect(html).toContain('researched/rejected');
  expect(html).toContain('momentum-gate failure');
  expect(html).toContain('original-version');
  expect(html).toContain('Contemporaneous evidence');
  expect(html).toContain('/evidence/then');
  expect(html).toContain('Hindsight evidence (excluded from historical detectability)');
  expect(html).toContain('/evidence/later');
  expect(html).toContain('saved-input');
});
