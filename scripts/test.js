/*
 * Lightweight smoke tests
 * - Uses in-memory SQLite to verify schema alignment
 */

const assert = require('assert');

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

  console.log('All schema tests passed.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
