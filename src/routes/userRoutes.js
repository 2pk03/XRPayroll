/*
 * userRoutes.js
 * 
 * Defines API routes for user management, including fetching, updating, and deleting user records.
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
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const db = require('../../database'); 
const { loginUser } = require('../controllers/userController');
const { loginLimiter } = require('../middleware/rateLimiter');

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
    console.error('JWT secret is not configured.');
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
 * @route POST /api/users/login
 * @desc Authenticate user and return JWT token
 * @access Public
 */
// User Login with Rate Limiting
router.post(
  '/login',
  loginLimiter,
  [
    body('username')
      .isString()
      .isLength({ min: 3 })
      .withMessage('Username must be at least 3 characters long.')
      .trim()
      .escape(),
    body('password')
      .isString()
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long.')
      .trim(),
  ],
  loginUser // Handler imported from userController.js
);

/**
 * @route GET /api/users
 * @desc Get all users with employee details (Admin only)
 * @access Protected
 */
router.get('/', authenticate, authorizeAdmin, (req, res) => {
  console.log(`Admin ${req.user.username} requested all users`);

  const query = `
    SELECT 
      users.id, 
      users.username, 
      users.role, 
      employers.name AS employerName, 
      employees.salary AS payrollAmount
    FROM users
    LEFT JOIN employees ON users.id = employees.userID
    LEFT JOIN employers ON employees.employerID = employers.id
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Database error fetching users:', err.message);
      return res.status(500).json({ message: 'Database error.' });
    }
    res.status(200).json({ users: rows });
  });
});

/**
 * @route GET /api/users/:id
 * @desc Get user by ID with employee details (Admin and the user themselves)
 * @access Protected
 */
router.get('/:id', authenticate, (req, res) => {
  const userId = req.params.id;

  // Allow access if admin or the user themselves
  if (req.user.role !== 'admin' && req.user.id !== parseInt(userId)) {
    console.warn(`User ${req.user.username} attempted to access user ID ${userId}`);
    return res.status(403).json({ message: 'Forbidden.' });
  }

  console.log(`User ${req.user.username} requested user ID ${userId}`);

  const query = `
    SELECT 
      users.id, 
      users.username, 
      users.role, 
      employers.name AS employerName, 
      employees.salary AS payrollAmount
    FROM users
    LEFT JOIN employees ON users.id = employees.userID
    LEFT JOIN employers ON employees.employerID = employers.id
    WHERE users.id = ?
  `;

  db.get(query, [userId], (err, user) => {
    if (err) {
      console.error(`Database error fetching user ID ${userId}:`, err.message);
      return res.status(500).json({ message: 'Database error.' });
    }

    if (!user) {
      console.warn(`User ID ${userId} not found`);
      return res.status(404).json({ message: 'User not found.' });
    }

    res.status(200).json({ user });
  });
});

/**
 * @route POST /api/users
 * @desc Create a new user (Admin only)
 * @access Protected (Admin)
 */
router.post(
  '/',
  authenticate,
  authorizeAdmin,
  [
    body('username')
      .isString()
      .isLength({ min: 3 })
      .withMessage('Username must be at least 3 characters long.')
      .trim()
      .escape(),
    body('password')
      .isString()
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long.')
      .trim(),
    body('role')
      .isIn(['admin', 'employee'])
      .withMessage("Role must be either 'admin' or 'employee'.")
      .trim()
      .escape(),
    // Conditional validation for employees
    body('employerID')
      .if(body('role').equals('employee'))
      .isInt({ min: 1 })
      .withMessage('Employer ID must be a positive integer.'),
    body('payrollAmount')
      .if(body('role').equals('employee'))
      .isFloat({ min: 0 })
      .withMessage('Payroll amount must be a non-negative number.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.warn('User creation failed: Validation errors');
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, password, role, employerID, payrollAmount } = req.body;

    try {
      // Check if username already exists
      db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err) {
          console.error('Database error fetching user:', err.message);
          return res.status(500).json({ message: 'Database error.' });
        }

        if (user) {
          console.warn(`Username ${username} already exists`);
          return res.status(409).json({ message: 'Username already exists.' });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert into users table
        db.run(
          'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
          [username, hashedPassword, role],
          function (err) {
            if (err) {
              console.error('Database error inserting user:', err.message);
              return res.status(500).json({ message: 'Database error.' });
            }

            const newUserId = this.lastID;
            console.log(`User ${username} created with ID ${newUserId}`);

            if (role === 'employee') {
              // Insert into employees table
              db.run(
                'INSERT INTO employees (userID, employerID, salary, employee_id, name) VALUES (?, ?, ?, ?, ?)',
                [newUserId, employerID, payrollAmount, `EMP-${newUserId}`, username],
                function (err) {
                  if (err) {
                    console.error('Database error inserting employee:', err.message);
                    // Optionally, delete the user if employee insertion fails
                    db.run('DELETE FROM users WHERE id = ?', [newUserId], (delErr) => {
                      if (delErr) {
                        console.error('Failed to delete user after employee insertion failure:', delErr.message);
                      }
                    });
                    return res.status(500).json({ message: 'Database error.' });
                  }

                  console.log(`Employee record created for user ID ${newUserId}`);
                  res.status(201).json({ message: 'Employee user created successfully.', userID: newUserId });
                }
              );
            } else {
              res.status(201).json({ message: 'Admin user created successfully.', userID: newUserId });
            }
          }
        );
      });
    } catch (error) {
      console.error('Error creating user:', error.message);
      res.status(500).json({ message: 'Internal server error.' });
    }
  }
);

/**
 * @route PUT /api/users/:id
 * @desc Update user by ID with employee details (Admin and the user themselves)
 * @access Protected
 */
router.put(
  '/:id',
  authenticate,
  [
    body('username')
      .optional()
      .isString()
      .isLength({ min: 3 })
      .withMessage('Username must be at least 3 characters long.')
      .trim()
      .escape(),
    body('password')
      .optional()
      .isString()
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long.')
      .trim(),
    body('role')
      .optional()
      .isIn(['admin', 'employee'])
      .withMessage("Role must be either 'admin' or 'employee'.")
      .trim()
      .escape(),
    // Additional fields for employees
    body('employerID')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Employer ID must be a positive integer.'),
    body('payrollAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Payroll amount must be a non-negative number.'),
  ],
  async (req, res) => {
    const userId = req.params.id;
    const { username, password, role, employerID, payrollAmount } = req.body;

    // Allow updates if admin or the user themselves
    if (req.user.role !== 'admin' && req.user.id !== parseInt(userId)) {
      console.warn(`User ${req.user.username} attempted to update user ID ${userId}`);
      return res.status(403).json({ message: 'Forbidden.' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.warn('Update failed: Validation errors');
      return res.status(400).json({ errors: errors.array() });
    }

    // Fetch current user data
    db.get('SELECT * FROM users WHERE id = ?', [userId], async (err, user) => {
      if (err) {
        console.error(`Database error fetching user ID ${userId}:`, err.message);
        return res.status(500).json({ message: 'Database error.' });
      }

      if (!user) {
        console.warn(`User ID ${userId} not found`);
        return res.status(404).json({ message: 'User not found.' });
      }

      const newRole = role || user.role;
      const wasEmployee = user.role === 'employee';

      // Begin transaction
      db.run('BEGIN TRANSACTION;', async (err) => {
        if (err) {
          console.error('Failed to begin transaction:', err.message);
          return res.status(500).json({ message: 'Database error.' });
        }

        try {
          // Prepare fields to update
          let updateQuery = 'UPDATE users SET ';
          const params = [];
          if (username) {
            updateQuery += 'username = ?, ';
            params.push(username);
          }
          if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            updateQuery += 'password = ?, ';
            params.push(hashedPassword);
          }
          if (role && req.user.role === 'admin') { // Only admins can update roles
            updateQuery += 'role = ?, ';
            params.push(role);
          }

          // Remove trailing comma and space
          if (updateQuery.endsWith(', ')) {
            updateQuery = updateQuery.slice(0, -2);
          }

          updateQuery += ' WHERE id = ?';
          params.push(userId);

          console.log(`User ${req.user.username} is updating user ID ${userId}`);

          db.run(updateQuery, params, function (err) {
            if (err) {
              console.error(`Database error updating user ID ${userId}:`, err.message);
              // Rollback transaction
              db.run('ROLLBACK;', (rollbackErr) => {
                if (rollbackErr) {
                  console.error('Failed to rollback transaction:', rollbackErr.message);
                }
                return res.status(500).json({ message: 'Database error.' });
              });
            }

            if (this.changes === 0) {
              console.warn(`User ID ${userId} not found for update`);
              // Rollback transaction
              db.run('ROLLBACK;', (rollbackErr) => {
                if (rollbackErr) {
                  console.error('Failed to rollback transaction:', rollbackErr.message);
                }
                return res.status(404).json({ message: 'User not found.' });
              });
            }

            // After updating user, handle employee data if necessary
            handleEmployeeData();
          });
        } catch (hashError) {
          console.error('Error hashing password:', hashError.message);
          // Rollback transaction
          db.run('ROLLBACK;', (rollbackErr) => {
            if (rollbackErr) {
              console.error('Failed to rollback transaction:', rollbackErr.message);
            }
            return res.status(500).json({ message: 'Error updating password.' });
          });
        }
      });
    });

    async function handleEmployeeData() {
      // Determine if role has changed to/from 'employee'
      const newRole = req.body.role || req.user.role; // Updated role
          const isEmployee = newRole === 'employee';
          const isAdmin = req.user.role === 'admin';

      if (isEmployee) {
        if (!isAdmin) {
          // Non-admin users should not update employee details
          if (employerID !== undefined || payrollAmount !== undefined) {
            console.warn(`Employee user ${req.user.username} attempted to update restricted fields`);
            // Rollback transaction
            db.run('ROLLBACK;', (rollbackErr) => {
              if (rollbackErr) {
                console.error('Failed to rollback transaction:', rollbackErr.message);
              }
              return res.status(403).json({ message: 'Forbidden. Cannot update employerID or payrollAmount.' });
            });
            return;
          }
        }

        // Check if employee record exists
          db.get('SELECT * FROM employees WHERE userID = ?', [userId], (err, employee) => {
            if (err) {
              console.error('Database error fetching employee:', err.message);
              // Rollback transaction
              db.run('ROLLBACK;', (rollbackErr) => {
                if (rollbackErr) {
                console.error('Failed to rollback transaction:', rollbackErr.message);
              }
              return res.status(500).json({ message: 'Database error.' });
            });
          }

              if (employee) {
                if (isAdmin) {
                  // Update existing employee record
                  const updateEmpQuery = 'UPDATE employees SET employerID = ?, salary = ? WHERE userID = ?';
                  const updateEmpParams = [
                    employerID !== undefined ? employerID : employee.employerID,
                    payrollAmount !== undefined ? payrollAmount : employee.salary,
                    userId,
                  ];

              db.run(updateEmpQuery, updateEmpParams, function (err) {
                if (err) {
                  console.error('Database error updating employee:', err.message);
                  // Rollback transaction
                  db.run('ROLLBACK;', (rollbackErr) => {
                    if (rollbackErr) {
                      console.error('Failed to rollback transaction:', rollbackErr.message);
                    }
                    return res.status(500).json({ message: 'Database error updating employee.' });
                  });
                }

                console.log(`Employee record updated for user ID ${userId}`);
                // Commit transaction
                db.run('COMMIT;', (commitErr) => {
                  if (commitErr) {
                    console.error('Failed to commit transaction:', commitErr.message);
                    return res.status(500).json({ message: 'Database error.' });
                  }
                  res.status(200).json({ message: 'User and employee updated successfully.' });
                });
              });
            } else {
              // Non-admin users should not update employee details
              console.log(`Employee user ${req.user.username} updated own information without changing employer details`);
              // Commit transaction
              db.run('COMMIT;', (commitErr) => {
                if (commitErr) {
                  console.error('Failed to commit transaction:', commitErr.message);
                  return res.status(500).json({ message: 'Database error.' });
                }
                res.status(200).json({ message: 'User updated successfully.' });
              });
            }
          } else {
              if (isAdmin) {
                // Create a new employee record
                if (!employerID || payrollAmount === undefined) {
                  console.warn('Missing employerID or payrollAmount for new employee');
                  // Rollback transaction
                  db.run('ROLLBACK;', (rollbackErr) => {
                    if (rollbackErr) {
                      console.error('Failed to rollback transaction:', rollbackErr.message);
                  }
                  return res.status(400).json({ message: 'employerID and payrollAmount are required for employees.' });
                });
              }

                db.run(
                  'INSERT INTO employees (userID, employerID, salary, employee_id, name) VALUES (?, ?, ?, ?, ?)',
                  [userId, employerID, payrollAmount, `EMP-${userId}`, req.body.username || user.username],
                function (err) {
                  if (err) {
                    console.error('Database error inserting employee:', err.message);
                    // Rollback transaction
                    db.run('ROLLBACK;', (rollbackErr) => {
                      if (rollbackErr) {
                        console.error('Failed to rollback transaction:', rollbackErr.message);
                      }
                      return res.status(500).json({ message: 'Database error inserting employee.' });
                    });
                  }

                  console.log(`Employee record created for user ID ${userId}`);
                  // Commit transaction
                  db.run('COMMIT;', (commitErr) => {
                    if (commitErr) {
                      console.error('Failed to commit transaction:', commitErr.message);
                      return res.status(500).json({ message: 'Database error.' });
                    }
                    res.status(200).json({ message: 'User and employee updated successfully.' });
                  });
                }
              );
            } else {
              // Non-admin users should not have employee records; nothing to do
              console.log(`Employee user ${req.user.username} updated their own information without employee record`);
              // Commit transaction
              db.run('COMMIT;', (commitErr) => {
                if (commitErr) {
                  console.error('Failed to commit transaction:', commitErr.message);
                  return res.status(500).json({ message: 'Database error.' });
                }
                res.status(200).json({ message: 'User updated successfully.' });
              });
            }
          }
        });
      }
    } 
  }
); 

/**
 * @route DELETE /api/users/:id
 * @desc Delete a user by ID (Admin only)
 * @access Protected (Admin)
 */
router.delete('/:id', authenticate, authorizeAdmin, (req, res) => {
  const userId = req.params.id;

  console.log(`Admin ${req.user.username} is attempting to delete user ID ${userId}`);

  // Delete from users table (cascades to employees and transactions due to foreign key constraints)
  db.run('DELETE FROM users WHERE id = ?', [userId], function (err) {
    if (err) {
      console.error(`Database error deleting user ID ${userId}:`, err.message);
      return res.status(500).json({ message: 'Database error.' });
    }

    if (this.changes === 0) {
      console.warn(`User ID ${userId} not found for deletion`);
      return res.status(404).json({ message: 'User not found.' });
    }

    console.log(`User ID ${userId} deleted successfully`);
    res.status(200).json({ message: 'User deleted successfully.' });
  });
});

module.exports = router;
