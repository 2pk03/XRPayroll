# XRPayroll
Simplify cross-border payments using Ripple's Stablecoin RLUSD via XRPL to hedge FIAT exchange fees and speedup payments. AGI research project, approx 70% Written with AI (o1 from OpenAI).
The app uses routes and can be adopted to any blockchain by implementing a new route. Right now it supports XRPL.

## Features

- **Issuer / payout split**: Issuer address defines RLUSD; payouts spend from a separate payout wallet so supply doesn’t inflate.  
- **Trust lines**: Employees trust the issuer’s USD (RLUSD) IOU; readiness shown in UI.  
- **Payments & tracing**: Send RLUSD from payout wallet to employees and trace hashes.  
- **User management / RBAC**: Admin vs employee views; My Payments for employees.  
- **SQLite persistence**: Users, employers, employees, transactions.  

## Setup
```bash
npm install
```

Create `.env` (example):
```
ISSUER_WALLET_SEED=...        # RLUSD issuer (testnet or mainnet)
PAYOUT_WALLET_SEED=...        # Payout wallet that holds RLUSD + XRP for fees
JWT_SECRET=changeme
XRPL_NETWORK=testnet          # devnet | testnet | mainnet
# XRPL_ALLOW_MAINNET=true     # only if you really point at mainnet
```

For testnet, run once to prep payout (faucet, trustline, mint 1000 USD IOU):
```bash
node scripts/setup-testnet-payout.js
```
Then restart the backend so it picks up `PAYOUT_WALLET_SEED`.

## Run
```bash
npm run dev
```
Open `http://localhost:8080` (default admin: `admin/adminpassword`).

## Docker
Pull the built image from GitHub Container Registry:
```bash
docker pull ghcr.io/2pk03/xrpayroll/xrpayroll:latest
```
Run with your `.env` mounted:
```bash
docker run --env-file .env -p 8080:8080 ghcr.io/2pk03/xrpayroll/xrpayroll:latest
```

## XRPL Notes
- Currency code defaults to `USD` (RLUSD). Change via `XRPL_CURRENCY` if needed.  
- Mainnet: no faucets. Admin must supply funded issuer + payout addresses and manage seeds off-app (HSM/signer recommended). Employees must trust the RLUSD issuer before payouts.  
- Payout wallet is used for all sends; issuer supply will not grow when payout has balance.

## License

This demo is released under the **Mozilla Public License, v. 2.0**. A copy of the license text can be found at [mozilla.org/MPL/2.0/](https://mozilla.org/MPL/2.0/).  

Under this license:

- You must **preserve** this notice.  
- You must **disclose** your source code if you distribute a **modified version** of this program.  

## Author

- **Alexander Alten**  
  - GitHub Handle: [2pk03](https://github.com/2pk03)  
