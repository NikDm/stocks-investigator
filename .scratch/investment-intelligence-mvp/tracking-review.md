# Issue 09 — independent review

Approved fixed point: `997aaf7a68f5565b63bc8d9643fc83cd3b9beaef`. Initial implementation: `a422a97`. Corrections: `0fd338a`, plus invalidation display metadata verified in the final working diff. Review used `git diff 997aaf7a68f5565b63bc8d9643fc83cd3b9beaef...HEAD`, with separate fresh-context Standards and Spec agents. Both independently verified their fixes. No full test suite was delegated to reviewers.

## Standards

Initial report: no confirmed documented-standard violations or ADR contradictions. Two judgment calls:

- Possible Duplicated Code: tracking repeated the research response envelope and tool request schema. Fixed by exporting and sharing `researchResponseSchema`, which owns the existing `toolSchema` union.
- Possible Feature Envy: tracking mutated the research dispatcher's issuer configuration directly. Fixed by the validating, dispatcher-owned `setIssuerCiks` method, used by both discovery and tracking.

Follow-up reviewer: “Verified both fixes … No remaining Standards findings.”

Standards: **0 hard breaches; 2 heuristic findings fixed; 0 remaining.**

## Spec

Initial report found four actionable issues:

1. Close invalidation inspected only the latest two bars and could miss a crossing during a failed/missing report. Fixed by replaying previously unchecked closes within the recorded interval, even when recent closes have recovered. A regression exercises a concealed crossing followed by recovery.
2. Renewal of an invalidated thesis checked only the newer assessment cutoff. Fixed by requiring later, explicitly changed thesis reasoning; a newer copy of the invalidated thesis cannot reset it to positive. Regression exercises this at the checkpoint.
3. Added wording on a known origin/event could be mislabeled a revision without `revisionOf`. Fixed by withholding known-event paraphrases without a concrete revision from material changes. Ambiguous conservative shared issuer-event identity produces a visible gap. Regression includes a reworded repeat story.
4. The missing-market branch published insufficient evidence with null thesis/conditions. Fixed by centralized finalization that preserves the recorded thesis and invalidation conditions for every new tracking version. Regression removes the tracked name from current market inputs.

Follow-up reviewer confirmed all four original findings addressed and reported no remaining actionable findings. A final independent check also confirmed that newly published tracking assessments retain immutable invalidation status/time/reasons and that the linked private assessment page displays that status without changing earlier versions.

Spec: **4 findings fixed; 0 remaining; no concrete scope creep found.**
