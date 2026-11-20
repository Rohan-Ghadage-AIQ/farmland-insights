# Decisions (ADR log)

Format: context, decision, consequences. Newest last.

---

## ADR-001: Treat the backend code as the contract, and record where the build prompt differs

**Context:** the build prompt's §2 was written from a read of the backend. Phase 0 re-read the code and found differences.
**Decision:** follow the code. The differences are listed as D1–D7 in [API_CONTRACT.md](API_CONTRACT.md) §6.
**Consequences:** the frontend's domain layer (`metrics.ts`, `cpi.ts`) encodes the _code's_ behaviour. If the backend changes, `API_CONTRACT.md` and these modules change together.

## ADR-002: Phase 0 ran without a live backend

**Context:** `.env` is empty (0 bytes), so the backend refuses to start (`PropelAuth is not configured`). I did not call `/auth/register` or `/auth/token` on a real PropelAuth tenant, because that would create real users.
**Decision:** generate `openapi.json` from `app.openapi()` instead of fetching `/openapi.json`. Mark live-only facts as UNVERIFIED (API_CONTRACT §7).
**Consequences:** the 401/403 body shapes and `/analyze` latency are unverified. The manual check in Phase 3 stays "pending" until credentials are available.

## ADR-003: "No data" is decided by metric presence, not by score

**Context:** the backend fills missing CPI scores with `0.0`, but `0.0` can also be a genuine score.
**Decision:** a cluster is "No data" for a cell when the cell has none of that cluster's metric keys in `raw_metrics`. This lives in one pure function with tests. When the backend adds nullable scores or coverage (BACKEND_REQUESTS #6), switch to that.
**Consequences:** a cluster with metrics but no threshold rules would still show `0.0`. That is rare and will be documented.

## ADR-004: Show advisories only when the metric has a value

**Context:** the server returns the _critical_ action for metrics with no value.
**Decision:** advisories whose metric is absent from `raw_metrics` appear only in a muted "No data" group and are excluded from "Top recommended actions".
**Consequences:** the UI never presents "critical" advice that was triggered by missing data.

## ADR-005: Don't pretend farm-level weather varies per cell

**Context:** weather is fetched at the farm centroid and broadcast to all cells.
**Decision:** raw-metric map layers for farm-level metrics show a flat colour with the note "Same for every cell (weather is measured at the farm centre)". The layer picker groups metrics into "Varies by cell" and "Farm-level".
**Consequences:** fewer misleading gradients. If the backend adds per-cell weather, update the metadata flag in `metrics.ts`.

## ADR-006: Show units as the code produces them, with a caveat where the scale is suspect

**Context:** `precip`, `et_actual` and `gdd` are on a scale that doesn't match their thresholds (BACKEND_REQUESTS #4).
**Decision:** display the code's real unit (mm/h hourly mean, °C·hours) with an "unverified scale" tooltip. Don't relabel them as mm or °C·day.
**Consequences:** honest but unusual labels until the backend is fixed.

## ADR-007: Stop after Phase 0 for review

**Context:** the build prompt says to continue to Phase 1 unless an open question blocks. Phase 0 found backend issues that may change priorities (security items 1–2, scale bug 4), and Phase 1 installs a large dependency tree.
**Decision:** finish Phase 0, report, and wait for the go-ahead.
**Consequences:** one extra confirmation step.
