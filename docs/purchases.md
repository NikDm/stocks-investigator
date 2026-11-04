# Actual purchase records

Open **Actual purchase records** on the private dashboard at `/purchases`. Recording an actual purchase is optional and independent of opportunity selection. Enter the stable security ID, purchase date and positive decimal USD entry price, with an optional linked opportunity security ID and a note of up to 500 characters. The link must refer to an existing tracked opportunity for the same security; archived opportunities remain linkable. An unlinked purchase does not require tracking or a current assessment. Security IDs are entered manually; this feature does not reconcile broker identities or verify execution.

Dates have date precision, with no fabricated execution instant. Future dates relative to New York are rejected. Entry prices are actual entries recorded by the investor, separate from hypothetical evaluation reference prices. Quantity, portfolio calculations, broker synchronization and order placement are excluded.

Corrections append a complete replacement of the editable fields, retaining the original record ID, original acquisition time and every revision's server acquisition time. Omitted optional fields clear those fields. Security identity is fixed: remove an incorrectly identified record and record a separate purchase. Removal appends a terminal tombstone retaining the last fields; it never erases history. It is a record correction, not a sale transaction. Recording, correcting and removing purchases never select/archive opportunities or write assessments, cohorts, baselines or outcomes.

## Private HTTP interface

All routes require Access authentication. GET `/api/purchases` lists at most 100 latest records, including removed records, ordered by purchase ID. Use `?after=<last-purchase-id>` for the next page. GET `/api/purchases/:id` returns `purchase`, `history`, `events` and `nextAfter`; history pages contain at most 100 append-only events. Pass `?after=<nextAfter>` for more events. Unknown purchase IDs return 404.

POST `/api/purchases` accepts strict JSON. Include the configured Origin and the token from `/api/csrf` in `X-CSRF-Token`. Example:

```json
{"action":"record","purchaseId":"my-purchase-id","securityId":"stable-security-id","purchaseDate":"2026-11-03","entryPriceUsd":"12.34","expectedRevision":0,"key":"unique-command-key"}
```

`correct` uses the same fields with the current expected revision, optional `opportunityId` and `note`, and a fresh key. `remove` accepts only action, purchaseId, expectedRevision and key. Accepted commands return 201 with their revision. Identical authenticated-identity-scoped key replays return their original result even after corrections/removal; changed payloads conflict. Stale revisions, invalid links, future dates and terminal-record changes return 409; schema validation returns 400, failed Origin/CSRF 403, and database failures 503. Concurrent corrections cannot both publish the same revision. HTML forms use `/purchases/commands` with the same validation and redirect on success.

Migration 0011 stores only append-only purchase events, with database revision checks and update/delete guards. No scheduled job or core evaluation stage depends on these records. Apply the migration before use; the existing full D1 export/restore path includes this ledger.
