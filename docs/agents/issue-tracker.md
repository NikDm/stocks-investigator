# Issue tracker: Local Markdown

Issues and specs live in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`.
- Spec: `.scratch/<feature-slug>/spec.md`.
- One file per implementation ticket:
  `.scratch/<feature-slug>/issues/<NN>-<slug>.md`,
  numbered from `01`.
- Record triage state in a `Status:` line near the top.
  Use the roles in `triage-labels.md`.
- Append conversation history under `## Comments`.

When publishing to the issue tracker, create the appropriate file,
including parent directories as needed.

When fetching a ticket, read the referenced file.

## Wayfinding operations

- Map: `.scratch/<effort>/map.md`, containing Notes,
  Decisions-so-far, and Fog.
- Child ticket: `.scratch/<effort>/issues/NN-<slug>.md`.
  Put the question in its body.
- Record ticket type in `Type:`:
  `research`, `prototype`, `grilling`, or `task`.
- Record dependencies in `Blocked by: NN, NN`.
  A ticket is unblocked when all dependencies are resolved.
- Select the lowest-numbered open, unblocked, unclaimed ticket.
- Before starting, set `Status: claimed` and save.
- On completion, append an `## Answer`, set `Status: resolved`,
  and add a summary and link to the map's Decisions-so-far.
