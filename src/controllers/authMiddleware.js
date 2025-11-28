/*
 * authMiddleware.js
 * 
 * Sets up and exports the SQLite database connection.
 * Ensures the `employees` and `transactions` tables exist.
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

const jwt = require('jsonwebtoken');

/**
 * Middleware to authenticate the token.
 * Verifies JWT tokens sent in the Authorization header.
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ message: 'No token provided. Unauthorized.' }); // Unauthorized

  const secret = req.app?.get('jwtSecret') || process.env.JWT_SECRET;
  if (!secret) {
    console.error('JWT secret is not configured.');
    return res.status(500).json({ message: 'Server configuration error.' });
  }

  jwt.verify(token, secret, (err, user) => {
    if (err) {
      console.error('JWT verification failed:', err.message);
      return res.status(403).json({ message: 'Invalid token. Forbidden.' }); // Forbidden
    }
    req.user = user;
    next();
  });
}

/**
 * Middleware to authorize based on user role.
 * @param {string} role - The required role to access the endpoint.
 */
function authorizeRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' }); // Forbidden
    }
    next();
  };
}

module.exports = { authenticateToken, authorizeRole };
