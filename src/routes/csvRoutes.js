/*
 * csvRoutes.js
 * 
 * Defines API routes for importing and exporting employee data via CSV.
 * Also includes a route to fetch employee records.
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

const express = require('express')
const multer = require('multer')
const csvParser = require('csv-parser')
const { Parser } = require('json2csv')
const db = require('../../database')
const { authenticateToken, authorizeRole } = require('../controllers/authMiddleware')
const router = express.Router()
const upload = multer({ storage: multer.memoryStorage() })

// Helper function to run a database statement as a Promise
function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        reject(err)
      } else {
        resolve(this)
      }
    })
  })
}

/**
 * @route POST /api/import-csv
 * @desc Import employees from a CSV file
 * @access Protected (Admin)
 */
router.post('/import-csv', authenticateToken, authorizeRole('admin'), upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded.' })
  }

  const results = []
  const bufferStream = require('stream').Readable.from(req.file.buffer)

  bufferStream
    .pipe(csvParser())
    .on('data', (row) => {
      // Expected CSV columns: name,employee_id,salary,wallet_address
      results.push(row)
    })
    .on('end', async () => {
      if (results.length === 0) {
        return res.status(400).json({ message: 'CSV file is empty.' })
      }

      try {
        await run(db, 'BEGIN TRANSACTION')

        const insertEmployeeStmt = db.prepare(`
          INSERT INTO employees (name, employee_id, salary, wallet_address)
          VALUES (?, ?, ?, ?)
        `)

        const insertTransactionStmt = db.prepare(`
          INSERT INTO transactions (employee_id, amount, wallet_address, status)
          VALUES (?, ?, ?, ?)
        `)

        let inserted = 0
        let errors = 0

        for (const emp of results) {
          try {
            // Validate required fields
            if (!emp.name || !emp.employee_id || !emp.salary || !emp.wallet_address) {
              throw new Error('Missing required employee fields.')
            }

            // Insert into employees table
            const employeeResult = await new Promise((resolve, reject) => {
              insertEmployeeStmt.run(
                emp.name.trim(),
                emp.employee_id.trim(),
                parseFloat(emp.salary),
                emp.wallet_address.trim(),
                function(err) {
                  if (err) {
                    reject(err)
                  } else {
                    resolve(this)
                  }
                }
              )
            })

            inserted += 1

            // Log transaction: Imported via CSV
            await new Promise((resolve, reject) => {
              insertTransactionStmt.run(
                employeeResult.lastID,
                0, // amount for import; adjust if needed
                emp.wallet_address.trim(),
                'Imported via CSV',
                function(err) {
                  if (err) {
                    reject(err)
                  } else {
                    resolve(this)
                  }
                }
              )
            })

          } catch (err) {
            console.error(`Error inserting employee ID ${emp.employee_id}:`, err.message)
            errors += 1
          }
        }

        insertEmployeeStmt.finalize()
        insertTransactionStmt.finalize()

        await run(db, 'COMMIT')

        res.json({
          message: `Imported ${inserted} employees with ${errors} errors.`,
        })

      } catch (err) {
        await run(db, 'ROLLBACK')
        console.error('Transaction failed:', err.message)
        res.status(500).json({ message: 'Error importing CSV.' })
      }
    })
    .on('error', (err) => {
      console.error('Error parsing CSV:', err.message)
      res.status(500).json({ message: 'Error parsing CSV file.' })
    })
})

/**
 * @route GET /api/export-csv
 * @desc Export all employees to a CSV file
 * @access Protected (Admin)
 */
router.get('/export-csv', authenticateToken, authorizeRole('admin'), (req, res) => {
  db.all('SELECT name, employee_id, salary, wallet_address FROM employees', (err, rows) => {
    if (err) {
      console.error('Error fetching employees:', err.message)
      return res.status(500).json({ message: 'Database error.' })
    }

    if (rows.length === 0) {
      return res.status(400).json({ message: 'No employee data to export.' })
    }

    try {
      const fields = ['name', 'employee_id', 'salary', 'wallet_address']
      const json2csvParser = new Parser({ fields })
      const csv = json2csvParser.parse(rows)

      res.header('Content-Type', 'text/csv')
      res.attachment('employees.csv')
      return res.send(csv)
    } catch (err) {
      console.error('Error converting JSON to CSV:', err.message)
      return res.status(500).json({ message: 'Error exporting CSV.' })
    }
  })
})

/**
 * @route GET /api/employees
 * @desc Get all employees or filter by wallet_address
 * @access Protected (Admin and Employee)
 */
router.get('/employees', authenticateToken, (req, res) => {
  const { wallet_address } = req.query
  let query = 'SELECT * FROM employees'
  let params = []

  // Allow admins to fetch all employees, employees can fetch only their own
  if (wallet_address) {
    query += ' WHERE wallet_address = ?'
    params.push(wallet_address)
  } else {
    // If the requester is an employee, restrict to their wallet_address
    if (req.user.role === 'employee') {
      query += ' WHERE wallet_address = ?'
      params.push(req.user.wallet_address)
    }
    // If admin and no wallet_address specified, fetch all
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Error fetching employees:', err.message)
      return res.status(500).json({ message: 'Database error.' })
    }
    res.json(rows)
  })
})

module.exports = router
