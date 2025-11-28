/*
 * src/models/index.js
 * 
 * XRPL XBorder Payroll Demo Backend
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

const { Sequelize } = require('sequelize');
const path = require('path');

// Initialize Sequelize to use SQLite
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '../../XRPayroll.db'),
  logging: false, // Disable logging; enable for debugging
});

// Test the connection
sequelize.authenticate()
  .then(() => console.log('Sequelize connected to SQLite'))
  .catch(err => console.error('Sequelize connection error:', err));

module.exports = sequelize;

// Import models
const User = require('./User');
const Employee = require('./Employee');
const Transaction = require('./Transaction');

// Establish associations if necessary
// For example, if you want to link Transactions to Employees
Employee.hasMany(Transaction, { foreignKey: 'employee_id', sourceKey: 'id' });
Transaction.belongsTo(Employee, { foreignKey: 'employee_id', targetKey: 'id' });

// Sync all models
sequelize.sync()
  .then(() => console.log('All models were synchronized successfully.'))
  .catch(err => console.error('Error syncing models:', err));

module.exports = sequelize;
