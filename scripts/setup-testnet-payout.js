/**
 * Setup a testnet payout wallet:
 * - Requires ISSUER_WALLET_SEED in .env
 * - Generates payout wallet, faucets XRP, sets USD trustline to issuer,
 *   mints demo USD from issuer to payout, and writes PAYOUT_WALLET_SEED to .env
 *
 * Usage: node scripts/setup-testnet-payout.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Client, Wallet } = require('xrpl');

const ISSUER_SEED = process.env.ISSUER_WALLET_SEED;
const CURRENCY = (process.env.XRPL_CURRENCY || 'USD').toUpperCase();
const NETWORK = (process.env.XRPL_NETWORK || 'testnet').toLowerCase();
const ENDPOINT =
  NETWORK === 'devnet'
    ? 'wss://s.devnet.rippletest.net:51233'
    : 'wss://s.altnet.rippletest.net:51233';

async function main() {
  if (!ISSUER_SEED) {
    console.error('ISSUER_WALLET_SEED is missing in .env');
    process.exit(1);
  }
  const client = new Client(ENDPOINT);
  await client.connect();
  console.log(`Connected to ${NETWORK}`);

  const issuer = Wallet.fromSeed(ISSUER_SEED);
  console.log(`Issuer: ${issuer.classicAddress}`);

  // Create payout wallet
  const payout = Wallet.generate();
  console.log(`Payout: ${payout.classicAddress}`);

  // Faucet payout
  await axios.post('https://faucet.altnet.rippletest.net/accounts', {
    destination: payout.classicAddress,
  });
  console.log('Payout funded with XRP (testnet faucet)');

  // Trustline payout -> issuer
  const ledgerIdxTL = (await client.request({ command: 'ledger_current' })).result.ledger_current_index;
  const tlTx = {
    TransactionType: 'TrustSet',
    Account: payout.classicAddress,
    LimitAmount: {
      currency: CURRENCY,
      issuer: issuer.classicAddress,
      value: '1000000',
    },
    LastLedgerSequence: ledgerIdxTL + 500,
  };
  const preparedTL = await client.autofill(tlTx);
  preparedTL.LastLedgerSequence = ledgerIdxTL + 500;
  const signedTL = payout.sign(preparedTL);
  const tlResult = await client.submitAndWait(signedTL.tx_blob);
  if (tlResult.result.meta.TransactionResult !== 'tesSUCCESS') {
    throw new Error(`Trustline failed: ${tlResult.result.meta.TransactionResult}`);
  }
  console.log('Payout trustline set');

  // Mint to payout
  const mintTx = {
    TransactionType: 'Payment',
    Account: issuer.classicAddress,
    Destination: payout.classicAddress,
    Amount: {
      currency: CURRENCY,
      issuer: issuer.classicAddress,
      value: '1000',
    },
  };
  const ledgerIdxMint = (await client.request({ command: 'ledger_current' })).result.ledger_current_index;
  const preparedMint = await client.autofill(mintTx);
  preparedMint.LastLedgerSequence = ledgerIdxMint + 500;
  const signedMint = issuer.sign(preparedMint);
  const mintResult = await client.submitAndWait(signedMint.tx_blob);
  const mintOutcome = mintResult.result.meta.TransactionResult;
  if (mintOutcome !== 'tesSUCCESS') {
    throw new Error(`Mint failed: ${mintOutcome}`);
  }
  console.log(`Minted 1000 ${CURRENCY} to payout`);

  // Write PAYOUT_WALLET_SEED to .env if not present
  const envPath = path.join(process.cwd(), '.env');
  let env = '';
  try {
    env = fs.readFileSync(envPath, 'utf8');
  } catch (_) {
    // ignore missing
  }
  const line = `PAYOUT_WALLET_SEED=${payout.seed}`;
  if (!env.includes('PAYOUT_WALLET_SEED')) {
    fs.appendFileSync(envPath, `${env.endsWith('\n') || env.length === 0 ? '' : '\n'}${line}\n`);
    console.log('Appended PAYOUT_WALLET_SEED to .env');
  } else {
    // Replace existing line
    const newEnv = env.replace(/PAYOUT_WALLET_SEED=.*/g, line);
    fs.writeFileSync(envPath, newEnv);
    console.log('Updated PAYOUT_WALLET_SEED in .env');
  }

  await client.disconnect();
  console.log('Setup complete. Restart backend to pick up PAYOUT_WALLET_SEED.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
