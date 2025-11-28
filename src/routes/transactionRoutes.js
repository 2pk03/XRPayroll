/*
 * transactionRoutes.js
 * 
 * Defines API routes for retrieving and logging transactions.
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

const express = require('express');
const { getIssuerWalletAndJwtSecret } = require('../../issuerWallet');
const db = require('../../database');
const xrpl = require('xrpl');
const { authenticateToken, authorizeRole } = require('../controllers/authMiddleware');
const router = express.Router();

/**
 * @route POST /api/send-rls
 * @desc Send RLUSD from issuer to user
 * @access Protected (Admin)
 */
router.post('/send-rls', authenticateToken, authorizeRole('admin'), async (req, res) => {
  const { employee_id, amount } = req.body;

  if (!employee_id || !amount) {
    return res.status(400).json({ message: 'Missing employee_id or amount.' });
  }

  try {
    // Fetch employee details
    db.get('SELECT * FROM employees WHERE employee_id = ? OR id = ?', [employee_id, employee_id], async (err, employee) => {
      if (err) {
        console.error('Database error:', err.message);
        return res.status(500).json({ message: 'Database error.' });
      }

      if (!employee) {
        return res.status(404).json({ message: 'Employee not found.' });
      }

      // Access the loaded issuerWallet from server.js
      const issuerWallet = req.app.get('issuerWallet');

      if (!issuerWallet) {
        console.error('Issuer Wallet not loaded.');
        return res.status(500).json({ message: 'Issuer Wallet not initialized.' });
      }

      // Initialize XRPL client
      const xrplClient = new xrpl.Client('wss://s.altnet.rippletest.net:51233');
      await xrplClient.connect();

      // Prepare payment transaction
      const paymentTx = {
        TransactionType: 'Payment',
        Account: issuerWallet.classicAddress,
        Destination: employee.wallet_address,
        Amount: {
          currency: 'RLS',
          issuer: issuerWallet.classicAddress,
          value: String(amount)
        }
      };

      try {
        const prepared = await xrplClient.autofill(paymentTx);
        const signed = issuerWallet.sign(prepared);
        const result = await xrplClient.submitAndWait(signed.tx_blob);
        const tr = result.result.meta.TransactionResult;

        if (tr === 'tesSUCCESS') {
          // Log transaction
          db.run(
            `
            INSERT INTO transactions (employee_id, amount, wallet_address, status, tx_id)
            VALUES (?, ?, ?, ?, ?)
          `,
            [employee.id, amount, employee.wallet_address, 'Completed', result.result.tx_json.hash],
            function (err) {
              if (err) {
                console.error('Error logging transaction:', err.message);
                // Continue even if logging fails
              }
            }
          );

          res.status(200).json({ message: `Sent ${amount} RLUSD to ${employee.name}.` });
        } else {
          res.status(400).json({ message: `Payment failed: ${tr}` });
        }
      } catch (error) {
        console.error('Payment error:', error.message);
        res.status(500).json({ message: 'Payment failed.' });
      } finally {
        xrplClient.disconnect();
      }
    });
  } catch (error) {
    console.error('Error sending RLS:', error.message);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

/**
 * @route GET /api/transactions
 * @desc Retrieve all transactions
 * @access Protected (Admin)
 */
router.get('/transactions', authenticateToken, authorizeRole('admin'), (req, res) => {
  console.log(`Admin ${req.user.username} requested all transactions.`);

  const query = `
    SELECT 
      t.id,
      t.employee_id,
      COALESCE(e.name, u.username) AS employee_name,
      t.amount,
      t.wallet_address,
      t.date,
      t.status,
      t.tx_id
    FROM transactions t
    INNER JOIN employees e ON t.employee_id = e.id
    LEFT JOIN users u ON e.userID = u.id
    ORDER BY t.date DESC
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Database error fetching transactions:', err.message);
      return res.status(500).json({ message: 'Database error.' });
    }

    res.status(200).json({ transactions: rows });
  });
});

module.exports = router;
