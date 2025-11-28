## [0.8.0] - 2025-11-28
- Removed in-app minting/faucet flows; payouts now rely on a dedicated payout wallet (from `PAYOUT_WALLET_SEED`) so issuer supply doesn’t inflate.
- Added testnet setup script (`scripts/setup-testnet-payout.js`) to generate/fund payout, set trustline, mint demo funds, and write `.env`.
- UI updates: payout balances displayed, network badge in header, cleaned Payments dates/Last TX display, removed unsupported trustline removal, stripped fund button.
- README refreshed with setup, env vars (`XRPL_NETWORK`), payout prep, and Docker pull/run instructions.

## [0.7.3] - 2025-11-28
- Align employee/transaction schema to match API usage (names, salary, employee identifiers, wallet columns) with backward-compatible column backfill.
- Fix transaction logging to use numeric employee IDs and prevent CSV imports from writing orphaned references.
- Normalize JWT handling across routes and remove insecure fallbacks; clean up duplicate login response.
- Block wallet seed disclosure via API and add in-memory test harness for schema sanity checks.

## [0.7.2] - 2024-??-??
- Previous release.
