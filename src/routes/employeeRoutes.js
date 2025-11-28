/*
 * employeeRoutes.js
 * 
 * Defines API routes for employee management, including creating, fetching, updating, and deleting employee records.
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

require('dotenv').config(); // Load environment variables
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { body, param, validationResult } = require('express-validator');
const db = require('../../database');

// Middleware to authenticate JWT tokens
const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  
  if (!authHeader) {
    console.warn('No authorization header provided');
    return res.status(401).json({ message: 'No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  
  if (!token) {
    console.warn('No token found in authorization header');
    return res.status(401).json({ message: 'No token provided.' });
  }

  const jwtSecret = req.app.get('jwtSecret') || process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error('JWT_SECRET is not configured.');
    return res.status(500).json({ message: 'Internal server error.' });
  }

  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err) {
      console.error('Token verification failed:', err.message);
      return res.status(403).json({ message: 'Failed to authenticate token.' });
    }
    req.user = decoded;
    next();
  });
};

// Authorization middleware to check for admin role
const authorizeAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    console.warn(`User ${req.user.username} attempted to access admin route`);
    return res.status(403).json({ message: 'Forbidden. Admins only.' });
  }
  next();
};

/**
 * @route POST /api/employees
 * @desc Create a new employee (Admin only)
 * @access Protected
 */
router.post(
  '/',
  authenticate,
  authorizeAdmin,
  [
    body('name')
      .isString()
      .isLength({ min: 3 })
      .withMessage('Employee name must be at least 3 characters long.')
      .trim()
      .escape(),
    body('salary')
      .isFloat({ min: 0 })
      .withMessage('Salary must be a positive number.'),
    body('wallet_address')
      .isString()
      .isLength({ min: 25 })
      .withMessage('Wallet address must be valid.')
      .trim()
      .escape(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.warn('Employee creation failed: Validation errors');
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, salary, wallet_address } = req.body;

    console.log(`Admin ${req.user.username} is creating employee: ${name}`);

    db.get('SELECT * FROM employees WHERE wallet_address = ?', [wallet_address], (err, row) => {
      if (err) {
        console.error('Database error during employee creation:', err.message);
        return res.status(500).json({ message: 'Database error.' });
      }

      if (row) {
        console.warn(`Employee creation failed: Wallet address ${wallet_address} already exists`);
        return res.status(400).json({ message: 'Wallet address already in use.' });
      }

      db.run(
        'INSERT INTO employees (name, salary, wallet_address) VALUES (?, ?, ?)',
        [name, salary, wallet_address],
        function (err) {
          if (err) {
            console.error('Database error inserting employee:', err.message);
            return res.status(500).json({ message: 'Database error.' });
          }

          console.log(`Employee ${name} created with ID ${this.lastID}`);
          res.status(201).json({ message: 'Employee created successfully.', employeeID: this.lastID });
        }
      );
    });
  }
);

/**
 * @route GET /api/employees
 * @desc Get all employees (Admin only)
 * @access Protected
 */
router.get('/', authenticate, authorizeAdmin, (req, res) => {
  console.log(`Admin ${req.user.username} requested all employees`);

  db.all('SELECT id AS employee_id, name, salary, wallet_address FROM employees', [], (err, rows) => {
    if (err) {
      console.error('Database error fetching employees:', err.message);
      return res.status(500).json({ message: 'Database error.' });
    }
    res.status(200).json(rows);
  });
});

/**
 * @route GET /api/employees/:id
 * @desc Get employee by ID (Admin only)
 * @access Protected
 */
router.get(
  '/:id',
  authenticate,
  authorizeAdmin,
  [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Employee ID must be a positive integer.')
      .toInt(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.warn('Employee retrieval failed: Validation errors');
      return res.status(400).json({ errors: errors.array() });
    }

    const employeeId = req.params.id;

    console.log(`Admin ${req.user.username} requested employee ID ${employeeId}`);

    db.get('SELECT id AS employee_id, name, salary, wallet_address FROM employees WHERE id = ?', [employeeId], (err, employee) => {
      if (err) {
        console.error(`Database error fetching employee ID ${employeeId}:`, err.message);
        return res.status(500).json({ message: 'Database error.' });
      }

      if (!employee) {
        console.warn(`Employee ID ${employeeId} not found`);
        return res.status(404).json({ message: 'Employee not found.' });
      }

      res.status(200).json(employee);
    });
  }
);

/**
 * @route PUT /api/employees/:id
 * @desc Update employee by ID (Admin only)
 * @access Protected
 */
router.put(
  '/:id',
  authenticate,
  authorizeAdmin,
  [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Employee ID must be a positive integer.')
      .toInt(),
    body('name')
      .optional()
      .isString()
      .isLength({ min: 3 })
      .withMessage('Employee name must be at least 3 characters long.')
      .trim()
      .escape(),
    body('salary')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Salary must be a positive number.'),
    body('wallet_address')
      .optional()
      .isString()
      .isLength({ min: 25 })
      .withMessage('Wallet address must be valid.')
      .trim()
      .escape(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.warn('Employee update failed: Validation errors');
      return res.status(400).json({ errors: errors.array() });
    }

    const employeeId = req.params.id;
    const { name, salary, wallet_address } = req.body;

    if (!name && !salary && !wallet_address) {
      console.warn('Employee update failed: No fields to update');
      return res.status(400).json({ message: 'No fields to update.' });
    }

    console.log(`Admin ${req.user.username} is updating employee ID ${employeeId}`);

    db.get('SELECT * FROM employees WHERE id = ?', [employeeId], (err, employee) => {
      if (err) {
        console.error(`Database error fetching employee ID ${employeeId}:`, err.message);
        return res.status(500).json({ message: 'Database error.' });
      }

      if (!employee) {
        console.warn(`Employee ID ${employeeId} not found`);
        return res.status(404).json({ message: 'Employee not found.' });
      }

      db.run(
        'UPDATE employees SET name = COALESCE(?, name), salary = COALESCE(?, salary), wallet_address = COALESCE(?, wallet_address) WHERE id = ?',
        [name, salary, wallet_address, employeeId],
        function (err) {
          if (err) {
            console.error(`Database error updating employee ID ${employeeId}:`, err.message);
            return res.status(500).json({ message: 'Database error.' });
          }

          console.log(`Employee ID ${employeeId} updated successfully`);
          res.status(200).json({ message: 'Employee updated successfully.' });
        }
      );
    });
  }
);

/**
 * @route DELETE /api/employees/:id
 * @desc Delete employee by ID (Admin only)
 * @access Protected
 */
router.delete(
  '/:id',
  authenticate,
  authorizeAdmin,
  [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Employee ID must be a positive integer.')
      .toInt(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.warn('Employee deletion failed: Validation errors');
      return res.status(400).json({ errors: errors.array() });
    }

    const employeeId = req.params.id;

    console.log(`Admin ${req.user.username} is deleting employee ID ${employeeId}`);

    db.get('SELECT * FROM employees WHERE id = ?', [employeeId], (err, employee) => {
      if (err) {
        console.error(`Database error fetching employee ID ${employeeId}:`, err.message);
        return res.status(500).json({ message: 'Database error.' });
      }

      if (!employee) {
        console.warn(`Employee ID ${employeeId} not found`);
        return res.status(404).json({ message: 'Employee not found.' });
      }

      db.run('DELETE FROM employees WHERE id = ?', [employeeId], function (err) {
        if (err) {
          console.error(`Database error deleting employee ID ${employeeId}:`, err.message);
          return res.status(500).json({ message: 'Database error.' });
        }

        console.log(`Employee ID ${employeeId} deleted successfully`);
        res.status(200).json({ message: 'Employee deleted successfully.' });
      });
    });
  }
);

module.exports = router;
