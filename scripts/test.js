/*
 * Lightweight smoke tests
 * - Uses in-memory SQLite to verify schema alignment
 */

const assert = require('assert');
const xrpl = require('xrpl');
const { getXRPLSettings, parseIssuerWallets, getDefaultIssuerWallet } = require('../src/config/xrpl');

// Use in-memory DB for tests before importing database.js
process.env.DB_PATH = ':memory:';
process.env.DEFAULT_ADMIN_PASSWORD = 'test-admin';

let db;
try {
  db = require('../database');
} catch (err) {
  if (err.code === 'MODULE_NOT_FOUND' && err.message.includes('sqlite3')) {
    console.error('sqlite3 is not installed. Run `npm install` before running tests.');
    process.exit(1);
  }
  throw err;
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function run() {
  // Give the serialized setup a tick to finish
  await new Promise((resolve) => setTimeout(resolve, 25));

  const employeeCols = await all('PRAGMA table_info(employees);');
  const transactionCols = await all('PRAGMA table_info(transactions);');

  const employeeColNames = employeeCols.map((c) => c.name);
  const transactionColNames = transactionCols.map((c) => c.name);

  // Employees table should support user linkage and payroll fields used by routes
  ['userID', 'employerID', 'employee_id', 'name', 'salary', 'wallet_address', 'wallet_seed'].forEach((col) => {
    assert(employeeColNames.includes(col), `employees missing column: ${col}`);
  });

  // Transactions should reference employees by numeric id and track status/hash
  ['employee_id', 'amount', 'wallet_address', 'status', 'tx_id'].forEach((col) => {
    assert(transactionColNames.includes(col), `transactions missing column: ${col}`);
  });

  // salary_currency default should be USD (ledger code for RLUSD)
  const salaryCurrencyCol = employeeCols.find((c) => c.name === 'salary_currency');
  assert(salaryCurrencyCol, 'employees missing salary_currency column');
  assert(
    (salaryCurrencyCol.dflt_value || '').replace(/'/g, '') === 'USD',
    'salary_currency default should be USD'
  );

  // XRPL config tests
  process.env.XRPL_NETWORK = 'testnet';
  delete process.env.XRPL_ALLOW_MAINNET;
  let cfg = getXRPLSettings();
  assert.strictEqual(cfg.network, 'testnet', 'Expected testnet as default network');

  process.env.XRPL_NETWORK = 'mainnet';
  delete process.env.XRPL_ALLOW_MAINNET;
  let threw = false;
  try {
    getXRPLSettings();
  } catch (err) {
    threw = true;
  }
  assert(threw, 'Mainnet should throw unless explicitly allowed');

  process.env.XRPL_NETWORK = 'mainnet';
  process.env.XRPL_ALLOW_MAINNET = 'true';
  cfg = getXRPLSettings();
  assert.strictEqual(cfg.network, 'mainnet', 'Mainnet allowed when XRPL_ALLOW_MAINNET=true');

  // Issuer wallet parsing
  const w1 = xrpl.Wallet.generate();
  const w2 = xrpl.Wallet.generate();
  process.env.ISSUER_WALLET_SEED = w1.seed;
  process.env.ISSUER_WALLET_SEEDS = `${w2.seed}`;
  const wallets = parseIssuerWallets();
  assert(wallets.find((w) => w.address === w1.classicAddress), 'Seed1 missing in parsed wallets');
  assert(wallets.find((w) => w.address === w2.classicAddress), 'Seed2 missing in parsed wallets');
  const def = getDefaultIssuerWallet();
  assert(def && def.address === w1.classicAddress, 'Default issuer wallet should be first seed');

  console.log('All schema/config tests passed.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
