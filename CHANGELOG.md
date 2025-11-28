## [0.7.3] - 2025-11-28
- Align employee/transaction schema to match API usage (names, salary, employee identifiers, wallet columns) with backward-compatible column backfill.
- Fix transaction logging to use numeric employee IDs and prevent CSV imports from writing orphaned references.
- Normalize JWT handling across routes and remove insecure fallbacks; clean up duplicate login response.
- Block wallet seed disclosure via API and add in-memory test harness for schema sanity checks.

## [0.7.2] - 2024-??-??
- Previous release.
