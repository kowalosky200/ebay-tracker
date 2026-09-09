# RETRADE audit and development handover

**Coverage:** 23 August to 4 September 2026

**Authoritative branch:** `main`

**Current known-good commit:** `4f5d3e1` (`fix(resilience): harden backup and offline recovery (#14)`)

**Repository:** `kowalosky200/RETRADE`

This document records the production outcomes from the last two weeks of work. It deliberately summarises completed fixes rather than listing every temporary extraction, visual-test or patch-preparation commit.

## Current position

| Audit area | Status | Evidence |
| --- | --- | --- |
| Stage 1 — sync and durable persistence | Passed | Durable write-ahead outbox, serialized saves, retry/drain fixes, stale-device protection and schema-contract checks are on `main`. |
| Stage 2 — Supabase security and integrity | Passed | Migrations `001`–`010` are preserved in order; the final verification migration contains 12 fail-closed checks. Milestone branch: `archive/stage2-complete-2026-09-03`. |
| Stage 3 — lifecycle and accounting integrity | Passed from repository evidence | Lifecycle mutations were centralized and guarded; partner settlements are transaction-backed. Commits `1c03e50` and `5d3fc4f`. |
| Stage 4 — resilience and recovery | Fixes merged; final operational sweep outstanding | Backup content verification, release-gate persistence coverage and account-isolated settings queues merged through PR #14. CI passed. The final browser/production recovery exercise was interrupted and still needs to be recorded. |

The local checkout was clean on `main` at `4f5d3e1` when this handover was prepared.

## Completed product and accounting fixes

### Inventory, returns and sale lifecycle

- Supplier returns now retain the terminal disposition, refunded cash and unrecovered-cost treatment instead of losing the lifecycle state.
- Scrap/disposal fields persist to Supabase and cash capital-lost calculations account for supplier refunds.
- Sale-N editing, relisting, return and resale sequencing were hardened so later sale cycles do not rewrite earlier sale history.
- Full-return records retain stable database identity; correcting a return no longer inserts a duplicate event beside the original.
- A database integrity migration repaired corrupted return cycles and prevents invalid duplicate full-return states.
- Dispose, supplier-return and restore actions now start the serialized cloud writer immediately after the local durable save.
- Bulk sales-platform editing now writes to the correct sale cycle.
- Bulk and grouped-order mutations use lifecycle helpers and validity checks rather than relying on whether a UI control is visible.
- Undo actions are dependency-aware, including return plus relist chains, and keep the audit history coherent.
- Realised and projected lifetime profit were separated so recoverable stock is not treated as a realised loss.
- Expected-profit calculations and Sale-N fee-credit presentation use the same accounting rules.

### Partners, consignments and settlements

- Consignment economics, partner stock attribution and partner forecasting were hardened.
- The partner page crash was fixed, and inline/contextual partner assignment was added.
- Account groups and archive navigation were added.
- Partner settlement and deletion paths now preserve the cash ledger and linked audit records.
- Settlements are transaction-backed: the settlement transaction is authoritative, and an incorrect payment is reversed through that transaction rather than by editing an item flag.

### Cashflow and tax

- Cashflow, tax reporting and partner accounting were audited and corrected.
- Derived cash-ledger rows reconcile with lifecycle changes, including supplier-return undo and partner operations.
- Sale attribution and platform-specific fees are retained for each sale cycle.

## Completed sync, offline and multi-device fixes

- Every durable mutation is staged synchronously in a user-scoped local write-ahead outbox before the cloud write begins.
- Supabase writes are serialized so overlapping saves cannot acknowledge or erase later edits.
- Sync passes use immutable snapshots and retain failed keys for retry.
- The outbox drains even when the live database fingerprint already matches the last in-memory snapshot.
- Cloud reads no longer manufacture idle local changes or trigger a permanent sync loop.
- Stale-device boot recovery compares revision/base state and quarantines unsafe work instead of overwriting newer cloud data.
- Non-item records use saved cloud bases and three-way conflict handling for offline/device convergence.
- Item lifecycle recovery preserves local edits when safe and blocks stale resurrection of sold, returned or disposed stock.
- Large or untrustworthy recovery queues are quarantined for manual recovery.
- Pending settings are durable and now use a separate browser key per authenticated user. A legacy queue migrates only when its stored owner matches the signed-in account.
- The release-candidate check now reads an explicit ten-entity persistence contract covering items, trips, expenses, cash, sourcing runs, accounts, activity, job lots, memberships and reconciliations.

## Completed backup and recovery fixes

- Full JSON backups include the durable supporting records needed for a real restore, including accounts, sourcing runs, cash, trips, expenses, job lots, reconciliations and settings.
- Restore merges by durable identity and prevents cross-month duplicate item IDs.
- Restored changes enter the durable outbox and are flushed to Supabase; success is reported only after the queue drains.
- New backups include a deterministic content fingerprint. A changed value can no longer pass validation merely because every collection still has the same row count.
- Older V5 count-only backups and earlier supported backup formats remain importable.

## Completed Supabase work

The applied migration history remains flat and append-only in `supabase/migrations/`:

1. `20260902_001_stage1_item_parts_date.sql` — adds the missing `item_parts.date` sync field.
2. `20260902_002_stage1_schema_contract_check.sql` — read-only Stage 1 contract check.
3. `20260902_003_stage2_security_audit.sql` — read-only ownership/RLS/security audit.
4. `20260902_004_stage2_integrity_hardening.sql` — ownership and relationship constraints.
5. `20260902_005_stage2_rpc_hardening.sql` — account-deletion RPC execution/search-path hardening.
6. `20260902_006_stage2_reconciliation_owner_guard.sql` — owner-safe reconciliation references.
7. `20260902_007_stage2_owner_query_indexes.sql` — indexes for user-scoped application queries.
8. `20260902_008_stage2_lifecycle_return_integrity.sql` — return-history repair and integrity enforcement.
9. `20260902_009_stage2e_rls_policy_consolidation.sql` — idempotent consolidation to one authenticated owner policy per user-owned table.
10. `20260903_010_stage2_final_verification.sql` — final fail-closed security and integrity verification with 12 checks.

Applied migrations must not be renamed, moved, grouped into subfolders or edited. Any later database repair must be a new numbered migration.

## Completed loading, motion and interaction work

- The artificial/mimic loader was replaced with skeletons inside the actual Home, Sales and Inventory layouts.
- The loader retains the established rounded shimmer appearance while masking live figures, labels, empty-state messages and seeded colour accents.
- Skeletons now reveal into real values through a cross-fade; dashboard graph motion begins after the reveal so figures and charts do not jump into place.
- Sales filters and month cards animate consistently with the dashboard.
- Navigation and filter response were made immediate.
- Saved theme is applied before first paint and remains stable through hydration.
- The current-period chart accent is animated without reintroducing loading-state colour leaks.

## Completed repository cleanup and safeguards

- Production code was split into `app.js`, `accounting.js`, `reports.js`, `app.css`, `index.html` and `sw.js` instead of continuing in one monolithic page.
- The retired site and bundled spreadsheet library were moved to `archive/legacy-site/`.
- Completed Stage 2 diagnostic output was grouped under `docs/audits/stage2/`.
- Temporary patch helpers and extraction workflows were moved under `.github/archive/`.
- Accidental placeholders and root-level scratch files were removed.
- `.gitignore`, a pull-request template, the development workflow and CI safeguards were added.
- CI checks syntax and blocks committed secrets, environment files and local business-data backup exports.
- Production migration history stays flat because Supabase requires timestamped migrations in that directory.

## Verification already completed

- Stage 2 final verification is represented by the 12-check fail-closed migration and the Stage 2 milestone branch.
- Stage 3 lifecycle and settlement changes passed their focused repository checks and were merged to `main`.
- Stage 4 focused checks covered same-count value corruption, legacy-backup compatibility, per-user settings queues and all ten durable entity types.
- JavaScript syntax checks passed for `app.js`, `accounting.js`, `reports.js` and `sw.js`.
- Repository whitespace checks passed.
- PR #14 (`Stage 4: harden backup and offline recovery`) passed RETRADE CI and was squash-merged as `4f5d3e1`.

## Outstanding work

### 1. Close Stage 4 with an operational resilience sweep

Run this against a non-production test account, or against production only with a fresh private backup and disposable test records:

- Create and edit one record of each durable entity type while offline, reload, reconnect and confirm the outbox drains without duplication or loss.
- Make conflicting edits on two devices and verify the newer cloud state or the intended three-way merge wins; confirm unsafe stale work is quarantined.
- Sign into two different accounts in the same browser and verify each account retains only its own pending settings.
- Export a backup, import it unchanged, then alter one value without changing row counts and verify the altered file is rejected.
- Restore a valid backup containing a cross-month item move and confirm one durable item ID exists afterward.
- Run the in-app release-candidate checks and save the result in `docs/audits/stage4/`.

If all checks pass, update `docs/audits/stage4/README.md` from “first-pass findings” to a completed result and create `archive/stage4-complete-2026-09-04` (or the actual completion date).

### 2. Clean merged remote working branches

The short-lived remote branches below were still visible during the last local inspection. Compare each with `main` and delete only those whose work is already merged or superseded:

- `audit/stage-1-sync-hardening`
- `audit/stage-3-data-integrity`
- `audit/stage-4-resilience`
- `chore/repo-workflow-hardening`
- `fix/loading-motion-route-restore`
- `fix/theme-first-paint-loading`
- `fix/theme-hydration-stability`
- `ui/chart-current-period-accent`
- `ui/dashboard-motion-mobile`
- `ui/filter-motion-sales-loading-polish`
- `ui/interaction-responsiveness`
- `ui/loading-cashflow-polish`

Keep `archive/stage2-complete-2026-09-03`. Treat `feature/monitors` as a separate unfinished workstream and do not delete or merge it as part of audit cleanup.

### 3. Resume the remaining full-audit scope

The inaccessible “FULL AUDIT v1.6” conversation prevented recovery of any exact Stage 5+ checklist. Before assigning a new stage number, retrieve that checklist if possible. If it remains unavailable, continue from the repository state and define the next stage explicitly in a new `docs/audits/stage5/README.md` before changing code.

The next audit should not reopen completed Stage 1–3 work without new evidence. Begin with the unresolved Stage 4 operational checks above, then examine the next agreed domain in isolation.

## Safe continuation sequence

1. Pull `main` and confirm the head is at least `4f5d3e1`.
2. Read this handover, `docs/DEVELOPMENT_WORKFLOW.md`, `docs/audits/stage4/README.md` and `supabase/migrations/README.md`.
3. Finish and record the Stage 4 operational sweep.
4. Mark Stage 4 complete and create its milestone only after the evidence is saved.
5. Clean verified merged remote branches.
6. Start the next audit stage from fresh `main` on a new `audit/*` branch.
