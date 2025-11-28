/*
 * server.js
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

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet'); // For security headers
const morgan = require('morgan'); // For logging
const rateLimit = require('express-rate-limit'); // For rate limiting
const enforce = require('express-sslify');
const sequelize = require('./src/models/index');
const csvRoutes = require('./src/routes/csvRoutes');
const transactionRoutes = require('./src/routes/transactionRoutes');
const authRoutes = require('./src/routes/authRoutes'); // Existing auth routes
const userRoutes = require('./src/routes/userRoutes'); // New user routes
const employerRoutes = require('./src/routes/employerRoutes');
const employeeRoutes = require('./src/routes/employeeRoutes');
const testnetRoutes = require('./src/routes/testnetRoutes'); // New Testnet routes
const { getIssuerWalletAndJwtSecret } = require('./issuerWallet');
const { getXRPLSettings, parseIssuerWallets, getDefaultIssuerWallet, getXRPLCurrency, getPayoutWallet } = require('./src/config/xrpl');
const xrpl = require('xrpl');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable trust proxy to handle X-Forwarded-For correctly
app.set('trust proxy', true);

// Middleware
app.use(helmet()); // Set security-related HTTP headers
app.use(cors()); // Enable CORS
app.use(express.json()); // Parse JSON bodies
app.use(morgan('combined')); // Log HTTP requests

// Enforce HTTPS in production
if (process.env.NODE_ENV === 'production') {
  app.use(enforce.HTTPS({ trustProtoHeader: true }));
}

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  keyGenerator: (req, res) => req.ip, // Explicitly use req.ip for client identification
});
app.use(limiter); // Apply rate limiting to all requests

// Initialize Variables to Hold Wallet and JWT Secret
let issuerWallet;
let jwtSecret;

// Initialize XRPL Client in app.locals
app.locals.xrplClient = null;
app.locals.xrplNetwork = null;
app.locals.issuerWallets = [];
app.locals.xrplCurrency = getXRPLCurrency();

// Routes
app.use('/api/auth', authRoutes); 
app.use('/api/users', userRoutes); 
app.use('/api/csv', csvRoutes); 
app.use('/api/transactions', transactionRoutes);
app.use('/api/employers', employerRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/testnet', testnetRoutes); // Mount the new Testnet routes
app.set('etag', false); // disable etag to avoid 304 caching on API responses

// Root Endpoint
app.get('/', (req, res) => {
  res.send('XRPayroll Backend is running.');
});

// Config Endpoint (safe subset)
app.get('/api/config', (req, res) => {
  res.json({
    network: app.locals.xrplNetwork || 'testnet',
    issuerAddresses: (app.locals.issuerWallets || []).map((w) => w.address),
    currency: app.locals.xrplCurrency,
    payoutAddress: app.locals.payoutAddress || null,
  });
});

// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'An unexpected error occurred.' });
});

// Function to start the server after ensuring issuer wallet and JWT secret are loaded
async function startServer() {
  try {
    const credentials = await getIssuerWalletAndJwtSecret();
    issuerWallet = credentials.wallet;
    jwtSecret = credentials.jwtSecret;

    // Make jwtSecret and issuerWallet available to other modules if needed
    app.set('jwtSecret', jwtSecret);
    app.set('issuerWallet', issuerWallet);
    app.locals.issuerWallets = parseIssuerWallets();
    const xrplSettings = getXRPLSettings();
    app.locals.xrplNetwork = xrplSettings.network;
    app.set('xrplEndpoint', xrplSettings.endpoint);
    if (!app.locals.issuerWallets.length && issuerWallet) {
      app.locals.issuerWallets = [{ seed: issuerWallet.seed, address: issuerWallet.classicAddress }];
    }
    const payout = getPayoutWallet();
    app.locals.payoutAddress = payout ? payout.address : null;

    // Start Server
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Issuer Wallet Address: ${issuerWallet.classicAddress}`);
    });
  } catch (error) {
    console.error('Failed to initialize issuer wallet and JWT secret:', error.message);
    process.exit(1);
  }
}

startServer();

// Graceful Shutdown
process.on('SIGINT', async () => {
  if (app.locals.xrplClient && app.locals.xrplClient.isConnected()) {
    await app.locals.xrplClient.disconnect();
    console.log('Disconnected from XRPL Testnet.');
  }
  process.exit();
});
