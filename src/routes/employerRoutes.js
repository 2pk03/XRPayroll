/*
 * employerRoutes.js
 * 
 * Defines API routes for employer management, including creating, fetching, updating, and deleting employer records.
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
const { body, validationResult, param } = require('express-validator');
const db = require('../../database');

// Middleware to authenticate JWT tokens
const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  
  if (!authHeader) {
    console.warn('No authorization header provided');
    return res.status(401).json({ message: 'No token provided.' });
  }

  const token = authHeader.split(' ')[1]; // Assuming "Bearer <token>"
  
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
    // Save user info for future middleware/routes
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
 * @route POST /api/employers
 * @desc Create a new employer (Admin only)
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
      .withMessage('Employer name must be at least 3 characters long.')
      .trim()
      .escape(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.warn('Employer creation failed: Validation errors');
      return res.status(400).json({ errors: errors.array() });
    }

    const { name } = req.body;

    console.log(`Admin ${req.user.username} is creating employer: ${name}`);

    // Check if employer already exists
    db.get('SELECT * FROM employers WHERE name = ?', [name], (err, row) => {
      if (err) {
        console.error('Database error during employer creation:', err.message);
        return res.status(500).json({ message: 'Database error.' });
      }

      if (row) {
        console.warn(`Employer creation failed: Employer ${name} already exists`);
        return res.status(400).json({ message: 'Employer already exists.' });
      }

      // Insert new employer
      db.run('INSERT INTO employers (name) VALUES (?)', [name], function (err) {
        if (err) {
          console.error('Database error inserting employer:', err.message);
          return res.status(500).json({ message: 'Database error.' });
        }

        console.log(`Employer ${name} created with ID ${this.lastID}`);
        res.status(201).json({ message: 'Employer created successfully.', employerID: this.lastID });
      });
    });
  }
);

/**
 * @route GET /api/employers
 * @desc Get all employers (Admin only)
 * @access Protected
 */
router.get('/', authenticate, authorizeAdmin, (req, res) => {
  console.log(`Admin ${req.user.username} requested all employers`);

  db.all('SELECT id, name FROM employers', [], (err, rows) => {
    if (err) {
      console.error('Database error fetching employers:', err.message);
      return res.status(500).json({ message: 'Database error.' });
    }
    res.status(200).json({ employers: rows });
  });
});

/**
 * @route GET /api/employers/:id
 * @desc Get employer by ID (Admin only)
 * @access Protected
 */
router.get(
  '/:id',
  authenticate,
  authorizeAdmin,
  [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Employer ID must be a positive integer.')
      .toInt(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.warn('Employer retrieval failed: Validation errors');
      return res.status(400).json({ errors: errors.array() });
    }

    const employerId = req.params.id;

    console.log(`Admin ${req.user.username} requested employer ID ${employerId}`);

    db.get('SELECT id, name FROM employers WHERE id = ?', [employerId], (err, employer) => {
      if (err) {
        console.error(`Database error fetching employer ID ${employerId}:`, err.message);
        return res.status(500).json({ message: 'Database error.' });
      }

      if (!employer) {
        console.warn(`Employer ID ${employerId} not found`);
        return res.status(404).json({ message: 'Employer not found.' });
      }

      res.status(200).json({ employer });
    });
  }
);

/**
 * @route PUT /api/employers/:id
 * @desc Update employer by ID (Admin only)
 * @access Protected
 */
router.put(
  '/:id',
  authenticate,
  authorizeAdmin,
  [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Employer ID must be a positive integer.')
      .toInt(),
    body('name')
      .optional()
      .isString()
      .isLength({ min: 3 })
      .withMessage('Employer name must be at least 3 characters long.')
      .trim()
      .escape(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.warn('Employer update failed: Validation errors');
      return res.status(400).json({ errors: errors.array() });
    }

    const employerId = req.params.id;
    const { name } = req.body;

    if (!name) {
      console.warn('Employer update failed: No fields to update');
      return res.status(400).json({ message: 'No fields to update.' });
    }

    console.log(`Admin ${req.user.username} is updating employer ID ${employerId} to name: ${name}`);

    // Check if employer exists
    db.get('SELECT * FROM employers WHERE id = ?', [employerId], (err, employer) => {
      if (err) {
        console.error(`Database error fetching employer ID ${employerId}:`, err.message);
        return res.status(500).json({ message: 'Database error.' });
      }

      if (!employer) {
        console.warn(`Employer ID ${employerId} not found`);
        return res.status(404).json({ message: 'Employer not found.' });
      }

      // Check if the new name already exists
      db.get('SELECT * FROM employers WHERE name = ? AND id != ?', [name, employerId], (err, row) => {
        if (err) {
          console.error('Database error during employer update:', err.message);
          return res.status(500).json({ message: 'Database error.' });
        }

        if (row) {
          console.warn(`Employer update failed: Employer name ${name} already exists`);
          return res.status(400).json({ message: 'Employer name already exists.' });
        }

        // Update employer name
        db.run('UPDATE employers SET name = ? WHERE id = ?', [name, employerId], function (err) {
          if (err) {
            console.error(`Database error updating employer ID ${employerId}:`, err.message);
            return res.status(500).json({ message: 'Database error.' });
          }

          console.log(`Employer ID ${employerId} updated to name ${name}`);
          res.status(200).json({ message: 'Employer updated successfully.' });
        });
      });
    });
  }
);

/**
 * @route DELETE /api/employers/:id
 * @desc Delete employer by ID (Admin only)
 * @access Protected
 */
router.delete(
  '/:id',
  authenticate,
  authorizeAdmin,
  [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Employer ID must be a positive integer.')
      .toInt(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.warn('Employer deletion failed: Validation errors');
      return res.status(400).json({ errors: errors.array() });
    }

    const employerId = req.params.id;

    console.log(`Admin ${req.user.username} is deleting employer ID ${employerId}`);

    // Check if employer exists
    db.get('SELECT * FROM employers WHERE id = ?', [employerId], (err, employer) => {
      if (err) {
        console.error(`Database error fetching employer ID ${employerId}:`, err.message);
        return res.status(500).json({ message: 'Database error.' });
      }

      if (!employer) {
        console.warn(`Employer ID ${employerId} not found`);
        return res.status(404).json({ message: 'Employer not found.' });
      }

      // Delete the employer
      db.run('DELETE FROM employers WHERE id = ?', [employerId], function (err) {
        if (err) {
          console.error(`Database error deleting employer ID ${employerId}:`, err.message);
          return res.status(500).json({ message: 'Database error.' });
        }

        console.log(`Employer ID ${employerId} deleted successfully`);
        res.status(200).json({ message: 'Employer deleted successfully.' });
      });
    });
  }
);

module.exports = router;
