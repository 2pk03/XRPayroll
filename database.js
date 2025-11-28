/*
 * database.js
 * 
 * Sets up the SQLite database, initializes tables, and ensures data integrity through foreign key constraints.
 * 
 * Copyright (c) 2024 Alexander Alten
 * GitHub Handle: 2pk03
 * 
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at
 * http://mozilla.org/MPL/2.0/.
 *
 * Under the MPL, you must preserve this notice. You must also disclose your source 
 * code if you distribute a modified version of this program.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, 'XRPayroll.db');

// Initialize SQLite database
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  } else {
    console.log('Connected to SQLite database.');
    db.run('PRAGMA foreign_keys = ON;', (err) => {
      if (err) {
        console.error('Failed to enable foreign keys:', err.message);
        process.exit(1);
      }
    });
  }
});

// Initialize the database tables
db.serialize(() => {
  // Users Table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'employee'))
    )
  `, (err) => {
    if (err) {
      console.error('Failed to create users table:', err.message);
      process.exit(1);
    }
    console.log('Users table is ready.');
  });

  // Employers Table
  db.run(`
    CREATE TABLE IF NOT EXISTS employers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    )
  `, (err) => {
    if (err) {
      console.error('Failed to create employers table:', err.message);
      process.exit(1);
    }
    console.log('Employers table is ready.');
  });

  // Employees Table
  db.run(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userID INTEGER UNIQUE,
      employerID INTEGER,
      employee_id TEXT UNIQUE,
      name TEXT,
      salary REAL,
      salary_currency TEXT DEFAULT 'USD',
      wallet_address TEXT UNIQUE,
      wallet_seed TEXT,
      FOREIGN KEY (userID) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (employerID) REFERENCES employers(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) {
      console.error('Failed to create employees table:', err.message);
      process.exit(1);
    }
    console.log('Employees table is ready.');
  });

  // Transactions Table
  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      wallet_address TEXT NOT NULL,
      date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL CHECK(status IN ('Success', 'Failure')),
      tx_id TEXT UNIQUE, -- Ensures transaction hash is unique
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
    )
  `, (err) => {
    if (err) {
      console.error('Failed to create transactions table:', err.message);
      process.exit(1);
    }
    console.log('Transactions table is ready.');
  });

  // Add indexes for performance
  db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_employee_id ON transactions(employee_id)`, (err) => {
    if (err) {
      console.error('Failed to create index on transactions.employee_id:', err.message);
    } else {
      console.log('Index on transactions.employee_id is ready.');
    }
  });

  db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)`, (err) => {
    if (err) {
      console.error('Failed to create index on transactions.date:', err.message);
    } else {
      console.log('Index on transactions.date is ready.');
    }
  });

  db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_tx_id ON transactions(tx_id)`, (err) => {
    if (err) {
      console.error('Failed to create index on transactions.tx_id:', err.message);
    } else {
      console.log('Index on transactions.tx_id is ready.');
    }
  });

  // Backfill missing columns for existing databases (idempotent)
  const ensureColumns = (table, columns) => {
    db.all(`PRAGMA table_info(${table});`, (err, rows) => {
      if (err) {
        console.error(`Failed to inspect ${table} schema:`, err.message);
        return;
      }
      const existing = rows.map(r => r.name);
      columns.forEach(({ name, ddl }) => {
        if (!existing.includes(name)) {
          db.run(`ALTER TABLE ${table} ADD COLUMN ${ddl};`, (alterErr) => {
            if (alterErr) {
              console.error(`Failed to add column ${name} to ${table}:`, alterErr.message);
            } else {
              console.log(`Added column ${name} to ${table}.`);
            }
          });
        }
      });
    });
  };

  ensureColumns('employees', [
    { name: 'employee_id', ddl: 'employee_id TEXT UNIQUE' },
    { name: 'name', ddl: 'name TEXT' },
    { name: 'salary', ddl: 'salary REAL' },
    { name: 'salary_currency', ddl: "salary_currency TEXT DEFAULT 'USD'" },
  ]);

  // Insert default employer
  db.get('SELECT * FROM employers WHERE name = ?', ['Default Employer'], (err, row) => {
    if (err) {
      console.error('Error querying employers:', err.message);
      return;
    }

    if (!row) {
      db.run('INSERT INTO employers (name) VALUES (?)', ['Default Employer'], function(err) {
        if (err) {
          console.error('Error inserting default employer:', err.message);
        } else {
          console.log('Default employer added with ID:', this.lastID);
        }
      });
    } else {
      console.log('Default employer already exists with ID:', row.id);
    }
  });

  // Insert default admin user
  db.get('SELECT * FROM users WHERE username = ?', ['admin'], async (err, user) => {
    if (err) {
      console.error('Error querying users:', err.message);
      return;
    }

    if (!user) {
      try {
        const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'adminpassword';
        const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10); // Securely hash the password
        db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', ['admin', hashedPassword, 'admin'], function(err) {
          if (err) {
            console.error('Error inserting admin user:', err.message);
          } else {
            console.log('Admin user created with ID:', this.lastID);
          }
        });
      } catch (hashError) {
        console.error('Error hashing admin password:', hashError.message);
      }
    } else {
      console.log('Admin user already exists with ID:', user.id);
    }
  });
});

module.exports = db;
