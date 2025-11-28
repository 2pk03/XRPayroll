/*
 * src/routes/testnetRoutes.js
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

const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { Client, Wallet } = require('xrpl');
const router = express.Router();
const db = require('../../database');
const { getXRPLSettings, getIssuerWalletByAddress, getDefaultIssuerWallet, getXRPLCurrency, getPayoutWallet } = require('../config/xrpl');

//
// generic logging
//
router.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack || err.message || err);
  res.status(500).json({ message: 'An unexpected error occurred.', error: err.message });
});

// ----------------------------------------------------------------------------
// Middleware for Authentication and Authorization
// ----------------------------------------------------------------------------

// Authenticate JWT Token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer TOKEN"

  if (!token) return res.status(401).json({ message: 'No token provided.' });

  jwt.verify(token, req.app.get('jwtSecret'), (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token.' });
    req.user = user; // { id, username, role, iat, exp }
    next();
  });
}

// Authorize Admins Only
function authorizeAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admins only.' });
  }
  next();
}

// ----------------------------------------------------------------------------
// XRPL Client Singleton
// ----------------------------------------------------------------------------

let xrplClientInstance = null;
let demoTreasury = null;
let demoPayout = null;

function ensureNotMainnet(res) {
  const { network } = getXRPLSettings();
  if (network === 'mainnet') {
    res.status(400).json({ message: 'Faucet funding and sponsorship are disabled on mainnet.' });
    return false;
  }
  return true;
}

function getEffectivePayoutWallet() {
  const configured = getPayoutWallet();
  if (configured) {
    return Wallet.fromSeed(configured.seed);
  }
  return null;
}

// Function to Get or Create XRPL Client
function getXRPLClient() {
  if (!xrplClientInstance) {
    const { endpoint } = getXRPLSettings();
    xrplClientInstance = new Client(endpoint);
  }
  return xrplClientInstance;
}

// ----------------------------------------------------------------------------
// Routes
// ----------------------------------------------------------------------------

/**
 * POST /api/testnet/connect
 * 
 * Connect to the XRPL Testnet and initialize the issuer wallet.
 * Admins only.
 */
router.post('/connect', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const xrplClient = getXRPLClient();

    if (!xrplClient.isConnected()) {
      await xrplClient.connect();
      console.log('Connected to XRPL Testnet');
    }

    if (!xrplClient.issuerWallet) {
      const issuerSeed = process.env.ISSUER_WALLET_SEED;
      if (!issuerSeed) {
        throw new Error(
          'Issuer wallet seed not set in environment variables. Please check your .env file or environment configuration.'
        );
      }

      const issuerWallet = Wallet.fromSeed(issuerSeed);
      xrplClient.issuerWallet = issuerWallet;
      xrplClient.issuerAddress = issuerWallet.address;

      console.log(`Issuer Wallet Address: ${issuerWallet.address}`);
    }

    res.status(200).json({
      message: 'Connected to XRPL Testnet successfully.',
      address: xrplClient.issuerAddress,
    });
  } catch (error) {
    console.error('Error connecting to XRPL Testnet:', error);
    res.status(500).json({ message: 'Failed to connect to XRPL Testnet.', error: error.message });
  }
});

/**
 * GET /api/testnet/demo/status
 * Report treasury and payout addresses, balances, trustlines (demo only).
 */
router.get('/demo/status', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    if (!ensureNotMainnet(res)) return;
    const xrplClient = getXRPLClient();
    if (!xrplClient.isConnected()) {
      await xrplClient.connect();
    }
    // Ensure issuer
    if (!xrplClient.issuerWallet) {
      const issuerSeed = process.env.ISSUER_WALLET_SEED;
      if (!issuerSeed) {
        return res.status(500).json({ message: 'Issuer wallet seed not set in environment variables.' });
      }
      xrplClient.issuerWallet = Wallet.fromSeed(issuerSeed);
      xrplClient.issuerAddress = xrplClient.issuerWallet.address;
    }

    const currency = getXRPLCurrency();

    async function describeWallet(w) {
      if (!w) return null;
      const address = w.address || w.classicAddress;
      const acct = await xrplClient.request({ command: 'account_info', account: address });
      const lines = await xrplClient.request({ command: 'account_lines', account: address });
      const tl = (lines.result.lines || []).find(
        (line) => line.account === xrplClient.issuerAddress && line.currency === currency
      );
      return {
        address,
        xrpBalance: parseFloat(acct.result.account_data.Balance || '0') / 1_000_000,
        payoutBalance: tl ? parseFloat(tl.balance || '0') : 0,
        hasTrustline: !!tl,
      };
    }

    const treasuryInfo = await describeWallet(demoTreasury);
    const payoutInfo = await describeWallet(getPayoutWallet() || demoPayout);

    res.status(200).json({
      currency,
      issuer: xrplClient.issuerAddress,
      treasury: treasuryInfo,
      payout: payoutInfo,
    });
  } catch (error) {
    console.error('Error fetching demo status:', error);
    res.status(500).json({ message: 'Failed to fetch demo status.', error: error.message });
  }
});

/**
 * POST /api/testnet/demo/transfer
 * Move RLUSD from Treasury to Payout (demo only).
 */
router.post('/demo/transfer', authenticateToken, authorizeAdmin, async (req, res) => {
  const { amount = '100' } = req.body;
  if (!ensureNotMainnet(res)) return;
  try {
    const xrplClient = getXRPLClient();
    if (!xrplClient.isConnected()) {
      await xrplClient.connect();
    }
    if (!xrplClient.issuerWallet) {
      const issuerSeed = process.env.ISSUER_WALLET_SEED;
      if (!issuerSeed) {
        return res.status(500).json({ message: 'Issuer wallet seed not set in environment variables.' });
      }
      xrplClient.issuerWallet = Wallet.fromSeed(issuerSeed);
      xrplClient.issuerAddress = xrplClient.issuerWallet.address;
    }
    const currency = getXRPLCurrency();

    if (!demoTreasury || !demoPayout) {
      return res.status(400).json({ message: 'Demo treasury/payout not initialized. Run mint-demo first.' });
    }

    // Ensure payout trustline exists
    const tlCheck = await xrplClient.request({
      command: 'account_lines',
      account: demoPayout.classicAddress,
    });
    const hasTl = (tlCheck.result.lines || []).some(
      (line) => line.account === xrplClient.issuerAddress && line.currency === currency
    );
    if (!hasTl) {
      const tlTx = {
        TransactionType: 'TrustSet',
        Account: demoPayout.classicAddress,
        LimitAmount: {
          currency,
          issuer: xrplClient.issuerAddress,
          value: '1000000',
        },
      };
      const preparedPayoutTL = await xrplClient.autofill(tlTx);
      const signedPayoutTL = demoPayout.sign(preparedPayoutTL);
      const resultPayoutTL = await xrplClient.submitAndWait(signedPayoutTL.tx_blob);
      if (resultPayoutTL.result.meta.TransactionResult !== 'tesSUCCESS') {
        return res.status(500).json({ message: `Failed to set trustline for payout: ${resultPayoutTL.result.meta.TransactionResult}` });
      }
    }

    const treasuryWallet = Wallet.fromSeed(demoTreasury.seed);
    const payoutWallet = Wallet.fromSeed(demoPayout.seed);

    const ledgerInfo = await xrplClient.request({ command: 'ledger_current' });
    const lastLedgerSequence = (ledgerInfo.result?.ledger_current_index || 0) + 500;

    const paymentTx = {
      TransactionType: 'Payment',
      Account: treasuryWallet.classicAddress,
      Destination: payoutWallet.classicAddress,
      LastLedgerSequence: lastLedgerSequence,
      Amount: {
        currency,
        issuer: xrplClient.issuerWallet.address,
        value: amount.toString(),
      },
    };
    const prepared = await xrplClient.autofill(paymentTx);
    prepared.LastLedgerSequence = lastLedgerSequence;
    const signed = treasuryWallet.sign(prepared);
    const result = await xrplClient.submit(signed.tx_blob);
    const prelim = result.result?.engine_result || result.result?.meta?.TransactionResult;
    if (prelim && prelim !== 'tesSUCCESS') {
      return res.status(500).json({ message: `Transfer failed: ${prelim}` });
    }
    res.status(200).json({
      message: `Transferred ${amount} ${currency} from Treasury to Payout.`,
      txHash: signed.hash,
    });
  } catch (error) {
    console.error('Error transferring demo funds:', error);
    res.status(500).json({ message: 'Failed to transfer demo funds.', error: error.message });
  }
});
// Helper: Initialize Issuer Wallet
async function initializeIssuerWallet() {
  const xrplClient = getXRPLClient();

  if (!xrplClient.issuerWallet) {
    const issuerSeed = process.env.ISSUER_WALLET_SEED;
    if (!issuerSeed) {
      throw new Error('Issuer wallet seed not set in environment variables.');
    }

    const issuerWallet = Wallet.fromSeed(issuerSeed);
    xrplClient.issuerWallet = issuerWallet;
    xrplClient.issuerAddress = issuerWallet.address;

    console.log(`Issuer Wallet Address: ${issuerWallet.address}`);
  }

  return xrplClient;
}

// POST /api/testnet/fund-issuer - Fund Issuer Wallet (Admin Only)
router.post('/fund-issuer', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    if (!ensureNotMainnet(res)) return;
    const xrplClient = getXRPLClient();
    const { mintAmount = '1000' } = req.body || {};

    if (!xrplClient.issuerWallet) {
      const issuerSeed = process.env.ISSUER_WALLET_SEED;
      if (!issuerSeed) {
        throw new Error(
          'Issuer wallet seed not set in environment variables. Please check your .env file or environment configuration.'
        );
      }

      const issuerWallet = Wallet.fromSeed(issuerSeed);
      xrplClient.issuerWallet = issuerWallet;
      xrplClient.issuerAddress = issuerWallet.address;

      console.log(`Issuer Wallet Address: ${issuerWallet.address}`);
    }

    const faucetResponse = await axios.post('https://faucet.altnet.rippletest.net/accounts', {
      destination: xrplClient.issuerAddress,
    });

    if (faucetResponse.status === 200 && faucetResponse.data.account) {
      console.log(`Funded issuer wallet with address: ${xrplClient.issuerAddress}`);
      return res.status(200).json({
        message: 'Issuer wallet funded successfully.',
        address: xrplClient.issuerAddress,
      });
    }
    throw new Error('Faucet funding failed.');
  } catch (error) {
    console.error('Error funding issuer wallet:', error);
    res.status(500).json({
      message: 'Failed to fund issuer wallet.',
      error: error.message,
    });
  }
}); 

/**
 * POST /api/testnet/enable-ripple
 * 
 * Enable the Default Ripple flag on the issuer wallet.
 * Admins only.
 */
router.post('/enable-ripple', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
      const xrplClient = getXRPLClient();

      if (!xrplClient.isConnected()) {
          console.log('XRPL Client is not connected.');
          return res.status(400).json({ message: 'XRPL Client is not connected. Please connect first.' });
      }

      if (!xrplClient.issuerWallet) {
          const issuerSeed = process.env.ISSUER_WALLET_SEED;
          if (!issuerSeed) {
              return res.status(500).json({ message: 'Issuer wallet seed not set in environment variables.' });
          }
          xrplClient.issuerWallet = Wallet.fromSeed(issuerSeed);
      }

      // Fetch account info using XRPL `account_info` request
      const accountInfoResponse = await xrplClient.request({
          command: 'account_info',
          account: xrplClient.issuerWallet.address,
      });

      const accountInfo = accountInfoResponse.result.account_data;
      const DEFAULT_RIPPLE_FLAG = 8;

      // Check if Default Ripple is already enabled
      const isDefaultRippleEnabled = (accountInfo.Flags & DEFAULT_RIPPLE_FLAG) === DEFAULT_RIPPLE_FLAG;
      if (isDefaultRippleEnabled) {
          console.log('Default Ripple is already enabled.');
          return res.status(200).json({ message: 'Default Ripple is already enabled.' });
      }

      // Enable Default Ripple
      const setAccountFlagsTx = {
          TransactionType: 'AccountSet',
          Account: xrplClient.issuerWallet.address,
          SetFlag: DEFAULT_RIPPLE_FLAG,
      };

      const prepared = await xrplClient.autofill(setAccountFlagsTx);
      const signed = xrplClient.issuerWallet.sign(prepared);
      const result = await xrplClient.submitAndWait(signed.tx_blob);

      if (result.result.meta.TransactionResult === 'tesSUCCESS') {
          console.log('Default Ripple flag enabled successfully.');
          res.status(200).json({ message: 'Default Ripple enabled successfully.' });
      } else {
          throw new Error(`Failed to enable Default Ripple: ${result.result.meta.TransactionResult}`);
      }
  } catch (error) {
      console.error('Error enabling Default Ripple:', error);
      res.status(500).json({ message: 'Failed to enable Default Ripple.', error: error.message });
  }
});

/**
 * POST /api/testnet/mint-demo
 * Mint demo issued currency (USD IOU) by sending from issuer to a target (defaults to issuer).
 * Testnet only.
 */
router.post('/mint-demo', authenticateToken, authorizeAdmin, async (req, res) => {
  const { amount = '1000' } = req.body;

  if (!ensureNotMainnet(res)) return;

  try {
    const xrplClient = getXRPLClient();
    if (!xrplClient.isConnected()) {
      await xrplClient.connect();
    }

    // Ensure issuer wallet
    if (!xrplClient.issuerWallet) {
      const issuerSeed = process.env.ISSUER_WALLET_SEED;
      if (!issuerSeed) {
        return res.status(500).json({ message: 'Issuer wallet seed not set in environment variables.' });
      }
      xrplClient.issuerWallet = Wallet.fromSeed(issuerSeed);
      xrplClient.issuerAddress = xrplClient.issuerWallet.address;
    }

    const currency = getXRPLCurrency();

    async function ensureWalletWithTrustline(existingWalletRef) {
      let wallet = existingWalletRef;
      if (!wallet) {
        wallet = Wallet.generate();
        await axios.post('https://faucet.altnet.rippletest.net/accounts', { destination: wallet.address });
      }
      // Always (re)apply trustline to be sure
      const ledgerIdx = (await xrplClient.request({ command: 'ledger_current' })).result.ledger_current_index;
      const tlTx = {
        TransactionType: 'TrustSet',
        Account: wallet.classicAddress,
        LimitAmount: {
          currency,
          issuer: xrplClient.issuerWallet.address,
          value: '1000000',
        },
        LastLedgerSequence: ledgerIdx + 500,
      };
      const preparedTL = await xrplClient.autofill(tlTx);
      const signedTL = wallet.sign(preparedTL);
      const resultTL = await xrplClient.submitAndWait(signedTL.tx_blob);
      const tlResult = resultTL.result.meta.TransactionResult;
      if (tlResult !== 'tesSUCCESS') {
        throw new Error(`Trustline failed (${tlResult})`);
      }
      // Verify trustline exists
      const tlCheck = await xrplClient.request({ command: 'account_lines', account: wallet.classicAddress });
      const hasTL = (tlCheck.result.lines || []).some(
        (line) => line.account === xrplClient.issuerAddress && line.currency === currency
      );
      if (!hasTL) {
        throw new Error('Trustline missing after creation');
      }
      return wallet;
    }

    try {
      demoTreasury = await ensureWalletWithTrustline(demoTreasury);
    } catch (err) {
      demoTreasury = null;
      return res.status(500).json({ message: `Treasury setup failed: ${err.message}` });
    }

    try {
      demoPayout = await ensureWalletWithTrustline(demoPayout);
    } catch (err) {
      demoPayout = null;
      return res.status(500).json({ message: `Payout setup failed: ${err.message}` });
    }

    const ledgerInfo = await xrplClient.request({ command: 'ledger_current' });
    const lastLedgerSequence = (ledgerInfo.result?.ledger_current_index || 0) + 500;

    // Mint to treasury (not payout)
    const paymentTx = {
      TransactionType: 'Payment',
      Account: xrplClient.issuerWallet.address,
      Destination: demoTreasury.classicAddress,
      LastLedgerSequence: lastLedgerSequence,
      Amount: {
        currency,
        issuer: xrplClient.issuerWallet.address,
        value: amount.toString(),
      },
    };

    const prepared = await xrplClient.autofill(paymentTx);
    prepared.LastLedgerSequence = lastLedgerSequence;
    const signed = xrplClient.issuerWallet.sign(prepared);

    const result = await xrplClient.submitAndWait(signed.tx_blob);
    const txResult = result.result?.meta?.TransactionResult || result.result?.engine_result;
    const txHash = result.result?.hash || signed.hash;
    if (txResult && txResult !== 'tesSUCCESS') {
      return res.status(500).json({
        message: `Mint failed: ${txResult}`,
        txHash,
        engine_result: txResult,
        result: result.result,
      });
    }

    // Verify balance landed
    const lines = await xrplClient.request({
      command: 'account_lines',
      account: demoTreasury.classicAddress,
    });
    const tl = (lines.result.lines || []).find(
      (line) => line.account === xrplClient.issuerAddress && line.currency === currency
    );
    const credited = tl ? parseFloat(tl.balance || '0') : 0;

    // Transfer minted balance from treasury to payout so payout can spend
    const transferLedger = await xrplClient.request({ command: 'ledger_current' });
    const transferLLS = (transferLedger.result?.ledger_current_index || 0) + 500;
    const transferTx = {
      TransactionType: 'Payment',
      Account: demoTreasury.classicAddress,
      Destination: demoPayout.classicAddress,
      LastLedgerSequence: transferLLS,
      Amount: {
        currency,
        issuer: xrplClient.issuerWallet.address,
        value: credited.toString(),
      },
    };
    const preparedTransfer = await xrplClient.autofill(transferTx);
    preparedTransfer.LastLedgerSequence = transferLLS;
    const signedTransfer = Wallet.fromSeed(demoTreasury.seed).sign(preparedTransfer);
    const transferResult = await xrplClient.submitAndWait(signedTransfer.tx_blob);
    const transferOutcome = transferResult.result?.meta?.TransactionResult || transferResult.result?.engine_result;
    const transferHash = transferResult.result?.hash || signedTransfer.hash;
    if (transferOutcome && transferOutcome !== 'tesSUCCESS') {
      return res.status(500).json({
        message: `Transfer to payout failed: ${transferOutcome}`,
        txHash: transferHash,
        mintHash: txHash,
        credited,
      });
    }

    // Fetch payout balance
    const payoutLines = await xrplClient.request({
      command: 'account_lines',
      account: demoPayout.classicAddress,
    });
    const payoutLine = (payoutLines.result.lines || []).find(
      (line) => line.account === xrplClient.issuerAddress && line.currency === currency
    );
    const payoutBalance = payoutLine ? parseFloat(payoutLine.balance || '0') : 0;

    return res.status(200).json({
      message: `Demo setup complete. Minted ${credited} ${currency} to Treasury and transferred to Payout.`,
      mintTxHash: txHash,
      transferTxHash: transferHash,
      treasury_address: demoTreasury.address,
      treasury_seed: demoTreasury.seed, // demo-only
      payout_address: demoPayout.address,
      payout_seed: demoPayout.seed, // demo-only
      credited,
      payoutBalance,
      warning: payoutBalance >= credited
        ? 'Demo payout ready.'
        : 'Transfer submitted; refresh status in a few seconds.',
    });
  } catch (error) {
    const prelim = error?.data?.result?.engine_result || error?.data?.engine_result || error?.message;
    if (prelim === 'tesSUCCESS' || `${prelim}`.includes('LastLedgerSequence')) {
      return res.status(200).json({
        message: `Mint submitted (tesSUCCESS) to Treasury ${demoTreasury?.address || 'N/A'}. Ledger advanced; verify on-chain.`,
        txHash: demoTreasury ? 'unknown-check-ledger' : undefined,
        treasury_address: demoTreasury?.address,
        treasury_seed: demoTreasury?.seed, // demo-only
        payout_address: demoPayout?.address,
        payout_seed: demoPayout?.seed, // demo-only
        warning: 'Ledger advanced before validation; verify on-chain.',
        engine_result: prelim,
      });
    }
    console.error('Error minting demo currency:', error.message);
    res.status(500).json({
      message: 'Failed to mint demo currency.',
      error: error.message,
      engine_result: prelim,
      result: error?.data?.result,
    });
  }
});

/**
 * GET /api/testnet/issuer/balance
 * 
 * Fetch the issuer wallet balance from the XRPL ledger.
 * Admins only.
 */
router.get('/issuer/balance', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
      const xrplClient = getXRPLClient();

      if (!xrplClient.isConnected()) {
          console.log('XRPL Client is not connected.');
          return res.status(400).json({ message: 'XRPL Client is not connected. Please connect first.' });
      }

      if (!xrplClient.issuerWallet) {
          console.log('Issuer wallet is not initialized.');
          return res.status(500).json({ message: 'Issuer wallet not initialized. Please connect first.' });
      }

      // Fetch account info using XRPL `account_info` request
      const accountInfoResponse = await xrplClient.request({
          command: 'account_info',
          account: xrplClient.issuerAddress,
      });

      const accountData = accountInfoResponse.result.account_data;

      // Fetch issued balance for configured currency via account_lines
          const currency = getXRPLCurrency();
          const linesResp = await xrplClient.request({
            command: 'account_lines',
            account: xrplClient.issuerAddress,
          });
      const issuedTotal = (linesResp.result.lines || [])
        .filter((l) => l.currency === currency)
        .reduce((acc, line) => acc + (parseFloat(line.balance) || 0), 0);
      // Issuer balances are negative for issued supply
      const issuedSupply = Math.abs(issuedTotal);

      // Payout balances (if configured)
      const payoutWallet = getPayoutWallet();
      let payoutBalance = null;
      let payoutXrp = null;
      if (payoutWallet) {
        try {
          const payoutInfo = await xrplClient.request({
            command: 'account_info',
            account: payoutWallet.address,
          });
          payoutXrp = (parseFloat(payoutInfo.result.account_data.Balance || 0) / 1_000_000).toFixed(6);
          const payoutLines = await xrplClient.request({
            command: 'account_lines',
            account: payoutWallet.address,
          });
          const payoutLine = (payoutLines.result.lines || []).find(
            (l) => l.currency === currency && l.account === xrplClient.issuerAddress
          );
          payoutBalance = payoutLine ? parseFloat(payoutLine.balance || 0) : 0;
        } catch (e) {
          console.warn('Could not fetch payout balances:', e.message);
        }
      }

      res.status(200).json({
          message: 'Issuer wallet balance fetched successfully.',
          xrpBalanceDrops: accountData.Balance, // Balance in drops
          xrpBalance: (parseFloat(accountData.Balance) / 1_000_000).toFixed(6) + ' XRP',
          issuedCurrency: currency,
          issuedSupply,
          warning: 'XRP balance is for fees/reserve. Issued balance shown per trust lines.',
          address: xrplClient.issuerAddress,
          payoutAddress: payoutWallet ? payoutWallet.address : null,
          payoutBalance,
          payoutXrp,
  });
} catch (error) {
    console.error('Error fetching issuer wallet balance:', error);
    res.status(500).json({
        message: 'Failed to fetch issuer wallet balance.',
          error: error.message,
      });
  }
});

/**
 * GET /api/testnet/payout/status
 * Report payout/treasury wallet balances and trustline.
 */
router.get('/payout/status', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const payout = getPayoutWallet();
    if (!payout) {
      return res.status(400).json({ message: 'No payout wallet configured. Set PAYOUT_WALLET_SEED (or TREASURY_WALLET_SEED).' });
    }

    const xrplClient = getXRPLClient();
    if (!xrplClient.isConnected()) {
      await xrplClient.connect();
    }
    if (!xrplClient.issuerWallet) {
      // Initialize issuer wallet if not already
      const defaultIssuer = getDefaultIssuerWallet();
      if (!defaultIssuer) {
        return res.status(500).json({ message: 'Issuer wallet is not configured.' });
      }
      xrplClient.issuerWallet = Wallet.fromSeed(defaultIssuer.seed);
      xrplClient.issuerAddress = xrplClient.issuerWallet.address;
    }

    const currency = getXRPLCurrency();
    const accountInfo = await xrplClient.request({
      command: 'account_info',
      account: payout.address || payout.classicAddress,
    });
    const xrpBalance = parseFloat(accountInfo.result.account_data.Balance || '0') / 1_000_000;

    const linesResp = await xrplClient.request({
      command: 'account_lines',
      account: payout.address || payout.classicAddress,
    });
    const tl = (linesResp.result.lines || []).find(
      (line) => line.account === xrplClient.issuerAddress && line.currency === currency
    );
    const payoutBalance = tl ? parseFloat(tl.balance || '0') : 0;

    res.status(200).json({
      address: payout.address || payout.classicAddress,
      currency,
      hasTrustline: !!tl,
      payoutBalance,
      xrpBalance,
      issuer: xrplClient.issuerAddress,
    });
  } catch (error) {
    console.error('Error fetching payout status:', error);
    res.status(500).json({ message: 'Failed to fetch payout status.', error: error.message });
  }
});

/**
 * POST /api/testnet/employees/request-wallet
 */
router.post('/employees/request-wallet', authenticateToken, authorizeAdmin, async (req, res) => {
  const { employeeID } = req.body;

  if (!employeeID) {
    return res.status(400).json({ message: 'Employee ID is required.' });
  }

  try {
    const xrplClient = getXRPLClient();

    if (!xrplClient.isConnected()) {
      await xrplClient.connect();
    }

    // Generate a new wallet
    const newWallet = Wallet.generate();

    // Save the wallet seed and address in the database
    db.run(
      `UPDATE employees SET wallet_address = ?, wallet_seed = ? WHERE id = ?`,
      [newWallet.address, newWallet.seed, employeeID],
      function (err) {
        if (err) {
          console.error('Error saving wallet seed and address:', err.message);
          return res.status(500).json({ message: 'Database error.', error: err.message });
        }

        console.log(`Wallet address ${newWallet.address} and seed assigned to employee ${employeeID}`);
        res.status(200).json({ walletAddress: newWallet.address, walletSeed: newWallet.seed });
      }
    );
  } catch (error) {
    console.error('Error generating wallet:', error);
    res.status(500).json({ message: 'Failed to generate wallet.', error: error.message });
  }
});

/**
 * POST /api/testnet/employees/prepare
 * Create wallet (if missing), fund (testnet only), and create trustline to issuer.
 */
router.post('/employees/prepare', authenticateToken, authorizeAdmin, async (req, res) => {
  const { employeeID, trustLimit = '1000000' } = req.body;

  if (!employeeID) {
    return res.status(400).json({ message: 'Employee ID is required.' });
  }

  try {
    if (!ensureNotMainnet(res)) return;

    db.get('SELECT wallet_address, wallet_seed FROM employees WHERE id = ?', [employeeID], async (err, row) => {
      if (err) {
        console.error('Error fetching employee:', err.message);
        return res.status(500).json({ message: 'Database error.', error: err.message });
      }

      if (!row) {
        return res.status(404).json({ message: 'Employee not found.' });
      }

      let walletSeed = row.wallet_seed;
      let walletAddress = row.wallet_address;

      // Generate wallet if missing
      if (!walletSeed || !walletAddress) {
        const newWallet = Wallet.generate();
        walletSeed = newWallet.seed;
        walletAddress = newWallet.address;

        db.run(
          'UPDATE employees SET wallet_address = ?, wallet_seed = ? WHERE id = ?',
          [walletAddress, walletSeed, employeeID],
          function (updateErr) {
            if (updateErr) {
              console.error('Error saving wallet:', updateErr.message);
            }
          }
        );
      }

      const xrplClient = getXRPLClient();
      if (!xrplClient.isConnected()) {
        await xrplClient.connect();
      }

      const selectedIssuer = getDefaultIssuerWallet();
      if (!selectedIssuer) {
        return res.status(500).json({ message: 'Issuer wallet not configured.' });
      }

      // Fund wallet via testnet faucet
      await axios.post('https://faucet.altnet.rippletest.net/accounts', { destination: walletAddress });

      // Create trustline
      const employeeWallet = Wallet.fromSeed(walletSeed);
      const issuerWallet = Wallet.fromSeed(selectedIssuer.seed);
      const currency = getXRPLCurrency();

      const trustSetTx = {
        TransactionType: 'TrustSet',
        Account: employeeWallet.classicAddress,
        LimitAmount: {
          currency,
          issuer: issuerWallet.address,
          value: trustLimit,
        },
      };

      const prepared = await xrplClient.autofill(trustSetTx);
      const signed = employeeWallet.sign(prepared);
      const result = await xrplClient.submitAndWait(signed.tx_blob);

      if (result.result.meta.TransactionResult === 'tesSUCCESS') {
        return res.status(200).json({
          message: 'Wallet prepared (funded + trustline created).',
          wallet_address: walletAddress,
        });
      }

      return res.status(500).json({ message: `Failed to create trust line: ${result.result.meta.TransactionResult}` });
    });
  } catch (error) {
    console.error('Error preparing employee wallet:', error.message);
    res.status(500).json({ message: 'Failed to prepare employee wallet.', error: error.message });
  }
});

/**
 * GET /api/testnet/employees
 * 
 * Fetch all employees and their details, including the latest transaction.
 * Admins only.
 */
router.get('/employees', authenticateToken, authorizeAdmin, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const query = `
    SELECT 
      e.id AS employee_id,
      u.username AS name,
      e.salary AS salary,
      e.salary_currency,
      e.wallet_address,
      t.status AS latest_status,
      t.tx_date AS latest_date,
      t.tx_id AS latest_tx_id
    FROM employees e
    JOIN users u ON e.userID = u.id
    LEFT JOIN (
      SELECT employee_id,
             status,
             tx_id,
             COALESCE(strftime('%Y-%m-%dT%H:%M:%SZ', date), date) AS tx_date
      FROM transactions
      WHERE id IN (
        SELECT MAX(id)
        FROM transactions
        GROUP BY employee_id
      )
    ) t ON e.id = t.employee_id;
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error querying employees:', err.message);
      return res.status(500).json({ message: 'Database error.', error: err.message });
    }

    // Format the latest transaction date to US format
    const employees = rows.map((row) => ({
      employee_id: row.employee_id,
      name: row.name,
      salary: row.salary,
      salary_currency: row.salary_currency || getXRPLCurrency(),
      wallet_address: row.wallet_address,
      latest_status: row.latest_status || 'N/A',
      tx_id: row.tx_id || null,
      latest_date: row.latest_date
        ? new Date(row.latest_date).toLocaleString('en-US')
        : 'N/A',
    }));

    res.status(200).json({ employees });
  });
});

/**
 * GET /api/testnet/employee/:id/latest-transaction
 * 
 * Fetch the latest transaction for a specific employee.
 * Admins only.
 */
router.get('/employee/:id/latest-transaction', authenticateToken, authorizeAdmin, (req, res) => {
  const { id } = req.params;

  const query = `
    SELECT 
      id AS transaction_id,
      amount,
      wallet_address,
      date,
      status,
      tx_id
    FROM transactions
    WHERE employee_id = ?
    ORDER BY date DESC
    LIMIT 1;
  `;

  db.get(query, [id], (err, row) => {
    if (err) {
      console.error('Error fetching latest transaction:', err.message);
      return res.status(500).json({ message: 'Database error.', error: err.message });
    }

    if (!row) {
      return res.status(404).json({ message: 'No transactions found for the employee.' });
    }

    res.status(200).json({
      transaction: {
        transaction_id: row.transaction_id,
        amount: row.amount,
        wallet_address: row.wallet_address,
        date: new Date(row.date).toLocaleString('en-US'),
        status: row.status,
        tx_id: row.tx_id,
      },
    });
  });
});

/**
 * POST /api/testnet/trustlines/create
 * 
 * Create a trust line between the issuer and the employee wallet.
 * Admins only.
 */
router.post('/trustlines/create', authenticateToken, authorizeAdmin, async (req, res) => {
  const { employeeWalletSeed, issuerAddress, trustLimit = '1000000' } = req.body;

  if (!employeeWalletSeed || !issuerAddress) {
    return res.status(400).json({ message: 'Employee wallet seed and issuer address are required.' });
  }

  try {
    const xrplClient = getXRPLClient();

    if (!xrplClient.isConnected()) {
      await xrplClient.connect();
    }

    const employeeWallet = Wallet.fromSeed(employeeWalletSeed);

    console.log('Employee Wallet Address:', employeeWallet.classicAddress);
    console.log('Issuer Wallet Address:', issuerAddress);

    const currency = getXRPLCurrency();
    // Prepare the TrustSet transaction
    const trustSetTx = {
      TransactionType: 'TrustSet',
      Account: employeeWallet.classicAddress, // Employee's wallet
      LimitAmount: {
        currency, // Token currency
        issuer: issuerAddress, // Issuer's wallet
        value: trustLimit, // Max trust limit
      },
    };

    console.log('TrustSet Transaction Before Autofill:', trustSetTx);

    // Autofill to calculate LastLedgerSequence and Fees
    const prepared = await xrplClient.autofill(trustSetTx);

    console.log('Prepared Transaction After Autofill:', prepared);

    const signed = employeeWallet.sign(prepared);
    console.log('Signed Transaction:', signed);

    // Submit the signed transaction and wait for the result
    const result = await xrplClient.submitAndWait(signed.tx_blob);

    if (result.result.meta.TransactionResult === 'tesSUCCESS') {
      console.log(`Trustline created successfully for wallet: ${employeeWallet.classicAddress}`);
      res.status(200).json({ message: 'Trust line created successfully.' });
    } else {
      throw new Error(`Transaction failed: ${result.result.meta.TransactionResult}`);
    }
  } catch (error) {
    console.error('Error creating trust line:', error.message);
    res.status(500).json({ message: 'Failed to create trust line.', error: error.message });
  }
});


/**
 * POST /api/testnet/payments/send
 * 
 * Send RLUSD tokens to the employee wallet.
 * Admins only.
 */

router.post('/payments/send', authenticateToken, authorizeAdmin, async (req, res) => {
  const { employeeWallet, amount, issuerAddress } = req.body;

  if (!employeeWallet || !amount) {
    return res.status(400).json({ message: 'Employee wallet address and amount are required.' });
  }

  const maxPerTx = parseFloat(process.env.MAX_PAYMENT_PER_TX || '0');
  if (maxPerTx > 0 && parseFloat(amount) > maxPerTx) {
    return res.status(400).json({ message: `Requested amount exceeds max per transaction limit (${maxPerTx}).` });
  }

  try {
    const xrplClient = getXRPLClient();

    if (!xrplClient.isConnected()) {
      await xrplClient.connect();
    }

    const selectedIssuer = issuerAddress
      ? getIssuerWalletByAddress(issuerAddress)
      : getIssuerWalletByAddress(xrplClient.issuerAddress) || getDefaultIssuerWallet();

    if (!selectedIssuer) {
      return res.status(500).json({ message: 'No issuer wallet available. Configure ISSUER_WALLET_SEED or ISSUER_WALLET_SEEDS.' });
    }

    xrplClient.issuerWallet = Wallet.fromSeed(selectedIssuer.seed);
    xrplClient.issuerAddress = xrplClient.issuerWallet.address;

    // Prefer a payout/treasury wallet to avoid minting new supply on every payment.
    const payoutWallet = getEffectivePayoutWallet() || xrplClient.issuerWallet;
    const payerLabel = payoutWallet.classicAddress === xrplClient.issuerWallet.classicAddress
      ? 'issuer wallet (minting)'
      : 'payout wallet';

    // Preflight: ensure destination has trustline to issuer
    const currency = getXRPLCurrency();
    const trustResp = await xrplClient.request({
      command: 'account_lines',
      account: employeeWallet,
    });
    const hasTrust = trustResp.result.lines.some(
      (line) => line.account === xrplClient.issuerAddress && line.currency === currency
    );
    if (!hasTrust) {
      return res.status(400).json({ message: 'Destination wallet has no trust line to the issuer. Create trust line before sending.' });
    }

    // Ensure payer has balance and trustline to issuer (skip when payer IS issuer, which mints)
    if (payoutWallet.classicAddress !== xrplClient.issuerAddress) {
      const payerLines = await xrplClient.request({
        command: 'account_lines',
        account: payoutWallet.classicAddress,
      });
      const payerLine = payerLines.result.lines.find(
        (line) => line.account === xrplClient.issuerAddress && line.currency === currency
      );
      if (!payerLine) {
        return res.status(400).json({ message: `Payer ${payerLabel} has no trustline to issuer ${xrplClient.issuerAddress}.` });
      }
      const payerBalance = parseFloat(payerLine.balance || '0');
      if (payerBalance < parseFloat(amount)) {
        return res.status(400).json({ message: `Insufficient ${currency} balance in ${payerLabel}. Current balance: ${payerBalance}.` });
      }
    }

    const paymentTx = {
      TransactionType: 'Payment',
      Account: payoutWallet.address,
      Destination: employeeWallet,
      Amount: {
        currency,
        issuer: xrplClient.issuerWallet.address,
        value: amount.toString(), // The salary to be sent
      },
    };

    console.log('Payment Transaction Before Autofill:', paymentTx);

    // Autofill to calculate LastLedgerSequence and Fees
    const prepared = await xrplClient.autofill(paymentTx);
    console.log('Prepared Payment Transaction:', prepared);

    const signed = payoutWallet.sign(prepared);
    console.log('Signed Payment Transaction:', signed);

    // Submit the signed transaction and wait for the result
    const result = await xrplClient.submitAndWait(signed.tx_blob);

    if (result.result.meta.TransactionResult === 'tesSUCCESS') {
      console.log(`Payment of ${amount} USD sent successfully to ${employeeWallet}`);

      // Log successful transaction in the database
      const insertQuery = `
        INSERT INTO transactions (employee_id, amount, wallet_address, status, tx_id, date)
        VALUES (
          (SELECT id FROM employees WHERE wallet_address = ?),
          ?,
          ?,
          'Success',
          ?,
          CURRENT_TIMESTAMP
        )
      `;
      db.run(
        insertQuery,
        [employeeWallet, amount, employeeWallet, signed.hash],
        (err) => {
          if (err) {
            console.error('Error inserting successful transaction:', err.message);
          } else {
            console.log('Transaction logged successfully in the database.');
          }
        }
      );

      return res.status(200).json({ message: `Payment of ${amount} RLUSD sent successfully to ${employeeWallet}.` });
    } else {
      throw new Error(`Transaction failed: ${result.result.meta.TransactionResult}`);
    }
  } catch (error) {
    console.error('Error sending payment:', error.message);

    // Log failed transaction in the database
    const insertQuery = `
      INSERT INTO transactions (employee_id, amount, wallet_address, status, tx_id, date)
      VALUES (
        (SELECT id FROM employees WHERE wallet_address = ?),
        ?,
        ?,
        'Failure',
        NULL,
        CURRENT_TIMESTAMP
      )
    `;
    db.run(
      insertQuery,
      [employeeWallet, amount, employeeWallet],
      (err) => {
        if (err) {
          console.error('Error logging failed transaction:', err.message);
        } else {
          console.log('Failed transaction logged in the database.');
        }
      }
    );

    res.status(500).json({ message: error.message || 'Failed to send payment.', error: error.message });
  }
});

/**
 * POST /api/testnet/wallet/verify
 * 
 * Check if a wallet is active on the XRPL Testnet.
 * Admins only.
 */
router.post('/wallet/verify', authenticateToken, authorizeAdmin, async (req, res) => {
  const { walletAddress } = req.body;

  if (!walletAddress) {
    return res.status(400).json({ message: 'Wallet address is required.' });
  }

  try {
    const xrplClient = getXRPLClient();

    if (!xrplClient.isConnected()) {
      await xrplClient.connect();
    }

    // Fetch account info
    const accountInfoResponse = await xrplClient.request({
      command: 'account_info',
      account: walletAddress,
      ledger_index: 'current',
    });

    res.status(200).json({
      activated: true,
      message: `Wallet ${walletAddress} is active.`,
    });
  } catch (error) {
    // If error is actNotFound, the wallet is not active
    if (error.data?.error === 'actNotFound') {
      res.status(200).json({
        activated: false,
        message: `Wallet ${walletAddress} is not active.`,
      });
    } else {
      console.error('Error verifying wallet activation:', error);
      res.status(500).json({
        message: 'Failed to verify wallet activation.',
        error: error.message,
      });
    }
  }
});

/**
 * POST /api/testnet/fund-wallet
 * 
 * Fund a wallet on the XRPL Testnet using the Testnet Faucet.
 * Admins only.
 */
router.post('/fund-wallet', authenticateToken, authorizeAdmin, async (req, res) => {
  const { walletAddress } = req.body;

  if (!walletAddress) {
    console.error('Wallet funding: Missing wallet address.');
    return res.status(400).json({ message: 'Wallet address is required.' });
  }

  try {
    if (!ensureNotMainnet(res)) return;
    console.log(`Initiating funding for wallet: ${walletAddress}`);
    const faucetResponse = await axios.post('https://faucet.altnet.rippletest.net/accounts', {
      destination: walletAddress,
    });

    if (faucetResponse.status === 200 && faucetResponse.data.account) {
      console.log(`Wallet ${walletAddress} funded successfully.`);
      res.status(200).json({
        message: `Wallet ${walletAddress} funded successfully.`,
        details: faucetResponse.data,
      });
    } else {
      throw new Error('Faucet funding failed.');
    }
  } catch (error) {
    console.error('Error funding wallet:', error.message);
    res.status(500).json({ message: 'Failed to fund wallet.', error: error.message });
  }
});

/**
 * POST /api/testnet/wallets/sponsor
 * Fund a wallet (dev/test only) and create a trustline to the issuer.
 */
router.post('/wallets/sponsor', authenticateToken, authorizeAdmin, async (req, res) => {
  const { walletAddress, walletSeed, trustLimit = '1000000', issuerAddress } = req.body;

  if (!walletAddress || !walletSeed) {
    return res.status(400).json({ message: 'walletAddress and walletSeed are required for sponsorship.' });
  }

  try {
    if (!ensureNotMainnet(res)) return;

    const xrplClient = getXRPLClient();
    if (!xrplClient.isConnected()) {
      await xrplClient.connect();
    }

    const selectedIssuer = issuerAddress
      ? getIssuerWalletByAddress(issuerAddress)
      : getDefaultIssuerWallet();

    if (!selectedIssuer) {
      return res.status(500).json({ message: 'Issuer wallet not configured.' });
    }

    // Fund the wallet via faucet
    await axios.post('https://faucet.altnet.rippletest.net/accounts', { destination: walletAddress });

    // Create trustline
    const employeeWallet = Wallet.fromSeed(walletSeed);
    const trustSetTx = {
      TransactionType: 'TrustSet',
      Account: employeeWallet.classicAddress,
      LimitAmount: {
        currency: 'USD',
        issuer: selectedIssuer.address,
        value: trustLimit,
      },
    };

    const prepared = await xrplClient.autofill(trustSetTx);
    const signed = employeeWallet.sign(prepared);
    const result = await xrplClient.submitAndWait(signed.tx_blob);

    if (result.result.meta.TransactionResult !== 'tesSUCCESS') {
      throw new Error(`Trustline failed: ${result.result.meta.TransactionResult}`);
    }

    res.status(200).json({ message: 'Wallet funded and trustline created.' });
  } catch (error) {
    console.error('Error sponsoring wallet:', error.message);
    res.status(500).json({ message: 'Failed to sponsor wallet.', error: error.message });
  }
});

/**
 * POST /api/testnet/employees/get-wallet-seed
 * 
 * Retrieve the wallet seed for an employee.
 * Admins only.
 */
router.post('/employees/get-wallet-seed', authenticateToken, authorizeAdmin, async (req, res) => {
  const { employeeID } = req.body;

  if (!employeeID) {
    return res.status(400).json({ message: 'Employee ID is required.' });
  }

  // For security, do not return seeds over the API. Encourage regulated key handling instead.
  return res.status(410).json({
    message: 'Retrieving wallet seeds via API is disabled. Use a secure key management workflow.',
  });
});

/**
 * GET /api/testnet/transactions
 * 
 * Fetch all transactions from the database.
 * Admins only.
 */
router.get('/transactions', authenticateToken, authorizeAdmin, async (req, res) => {
  const query = `
    SELECT 
  t.id AS transaction_id,
  t.employee_id,
  e.wallet_address,
  t.amount,
  t.status,
  COALESCE(strftime('%Y-%m-%dT%H:%M:%SZ', t.date), t.date) AS date,
  t.tx_id,
  u.username AS employee_name
  FROM transactions t
  JOIN employees e ON t.employee_id = e.id
  JOIN users u ON e.userID = u.id
  ORDER BY t.date DESC;
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching transactions:', err.message);
      return res.status(500).json({ message: 'Database error.', error: err.message });
    }

    const transactions = rows.map((row) => ({
      transaction_id: row.transaction_id,
      employee_id: row.employee_id,
      employee_name: row.employee_name,
      amount: row.amount,
      wallet_address: row.wallet_address,
      date: row.date,
      status: row.status,
      tx_id: row.tx_id,
    }));

    res.status(200).json({ transactions });
  });
});

/**
 * GET /api/testnet/transactions/trace/:tx_id
 * 
 * Trace a specific transaction on the XRPL ledger using its transaction ID.
 * Admins only.
 */
router.get('/transactions/trace/:tx_id', authenticateToken, authorizeAdmin, async (req, res) => {
  const { tx_id } = req.params;

  if (!tx_id) {
    return res.status(400).json({ message: 'Transaction ID is required.' });
  }

  try {
    const xrplClient = getXRPLClient();

    if (!xrplClient.isConnected()) {
      await xrplClient.connect();
    }

    // Fetch transaction details using `tx` command
    const txResponse = await xrplClient.request({
      command: 'tx',
      transaction: tx_id,
    });

    // Log the entire response for debugging
    console.log('Transaction Response:', JSON.stringify(txResponse.result, null, 2));

    const { meta, validated, ledger_index, tx_json, close_time_iso } = txResponse.result;

    if (!meta || !validated) {
      return res.status(404).json({ message: 'Transaction not found or not validated yet.' });
    }

    // Extract delivered amount
    const deliveredAmount =
      meta.delivered_amount?.value || (meta.delivered_amount && typeof meta.delivered_amount === 'string' 
      ? meta.delivered_amount 
      : 'N/A');

    // Determine ledger close time
    const ledgerCloseTime =
      close_time_iso ||
      (tx_json.date ? new Date((tx_json.date + 946684800) * 1000).toLocaleString('en-US') : 'N/A');

    res.status(200).json({
      message: 'Transaction traced successfully.',
      tx_id,
      status: meta.TransactionResult,
      ledger_close_time: ledgerCloseTime,
      ledger_index,
      amount: deliveredAmount,
    });
  } catch (error) {
    console.error(`Error tracing transaction with ID ${tx_id}:`, error.message);
    res.status(500).json({
      message: 'Failed to trace the transaction.',
      error: error.message,
    });
  }
});

/**
 * GET /api/testnet/trustlines/:walletAddress
 * 
 * Fetch all trust lines for a given wallet address.
 * Admins only.
 */
const { isValidClassicAddress } = require('xrpl'); // Import address validation utility

router.get('/trustlines/:walletAddress', authenticateToken, authorizeAdmin, async (req, res) => {
  const { walletAddress } = req.params;

  // Validate the wallet address
  if (!walletAddress || !isValidClassicAddress(walletAddress)) {
    console.error(`Invalid wallet address provided: ${walletAddress}`);
    return res.status(400).json({ message: 'Invalid or missing wallet address.' });
  }

  try {
    const xrplClient = getXRPLClient();

    // Connect to the XRPL Testnet if not already connected
    if (!xrplClient.isConnected()) {
      await xrplClient.connect();
      console.log('Connected to XRPL Testnet');
    }

    console.log(`Fetching trust lines for wallet address: ${walletAddress}`);

    // Fetch trust lines for the given wallet
    const accountLinesResponse = await xrplClient.request({
      command: 'account_lines',
      account: walletAddress,
    });

    // Log the response for debugging
    console.log(`Trust lines for ${walletAddress}:`, JSON.stringify(accountLinesResponse.result.lines, null, 2));

    res.status(200).json({
      message: 'Trust lines fetched successfully.',
      trustLines: accountLinesResponse.result.lines,
    });
  } catch (error) {
    // Log detailed error for debugging
    console.error(`Error fetching trust lines for wallet ${walletAddress}:`, error.message);
    console.error('Full error:', error);

    // Handle specific XRPL errors or default to generic error message
    const errorMessage = error.data?.error_message || error.message || 'Failed to fetch trust lines.';
    res.status(500).json({ message: 'Failed to fetch trust lines.', error: errorMessage });
  }
});

/**
 * POST /api/testnet/trustlines
 * 
 * Create a trust line between the issuer and the employee wallet.
 * Admins only.
 */
router.post('/trustlines', authenticateToken, authorizeAdmin, async (req, res) => {
  const { walletSeed, currency, limit } = req.body;

  if (!walletSeed || !currency || !limit) {
    return res.status(400).json({ message: 'Wallet seed, currency, and limit are required.' });
  }

  try {
    const xrplClient = getXRPLClient();

    if (!xrplClient.isConnected()) {
      await xrplClient.connect();
    }

    const wallet = Wallet.fromSeed(walletSeed);

    // Prepare TrustSet transaction
    const trustSetTx = {
      TransactionType: 'TrustSet',
      Account: wallet.classicAddress,
      LimitAmount: {
        currency,
        issuer: xrplClient.issuerWallet.address,
        value: limit,
      },
    };

    const prepared = await xrplClient.autofill(trustSetTx);
    const signed = wallet.sign(prepared);
    const result = await xrplClient.submitAndWait(signed.tx_blob);

    if (result.result.meta.TransactionResult === 'tesSUCCESS') {
      res.status(200).json({ message: 'Trust line created successfully.' });
    } else {
      throw new Error(`Failed to create trust line: ${result.result.meta.TransactionResult}`);
    }
  } catch (error) {
    console.error('Error creating trust line:', error.message);
    res.status(500).json({ message: 'Failed to create trust line.', error: error.message });
  }
});

/**
 * DELETE /api/testnet/trustlines
 * 
 * Remove a trust line between the issuer and the employee wallet.
 * Admins only.
 */
router.delete('/trustlines', authenticateToken, authorizeAdmin, async (req, res) => {
  const { walletSeed, currency } = req.body;

  if (!walletSeed || !currency) {
    return res.status(400).json({ message: 'Wallet seed and currency are required.' });
  }

  try {
    const xrplClient = getXRPLClient();

    if (!xrplClient.isConnected()) {
      await xrplClient.connect();
    }

    const wallet = Wallet.fromSeed(walletSeed);

    // Prepare TrustSet transaction to remove the trust line
    const trustSetTx = {
      TransactionType: 'TrustSet',
      Account: wallet.classicAddress,
      LimitAmount: {
        currency,
        issuer: xrplClient.issuerWallet.address,
        value: '0', // Setting the limit to 0 removes the trust line
      },
    };

    const prepared = await xrplClient.autofill(trustSetTx);
    const signed = wallet.sign(prepared);
    const result = await xrplClient.submitAndWait(signed.tx_blob);

    if (result.result.meta.TransactionResult === 'tesSUCCESS') {
      res.status(200).json({ message: 'Trust line removed successfully.' });
    } else {
      throw new Error(`Failed to remove trust line: ${result.result.meta.TransactionResult}`);
    }
  } catch (error) {
    console.error('Error removing trust line:', error.message);
    res.status(500).json({ message: 'Failed to remove trust line.', error: error.message });
  }
});

// Placeholder route for delete by address (requires employee seed to truly remove)
router.delete('/trustlines/:walletAddress', authenticateToken, authorizeAdmin, (req, res) => {
  return res.status(410).json({ message: 'Removing trust lines requires the employee wallet seed; operation not supported via this endpoint.' });
});

/**
 * POST /api/testnet/trustlines/create/employee
 * Create a trust line for an employee using the stored wallet_seed (admin only).
 */
router.post('/trustlines/create/employee', authenticateToken, authorizeAdmin, async (req, res) => {
  const { employeeID, limit = '1000000', issuerAddress } = req.body;

  if (!employeeID) {
    return res.status(400).json({ message: 'Employee ID is required.' });
  }

  try {
    if (!ensureNotMainnet(res)) return;

    // Fetch wallet seed from DB
    db.get('SELECT wallet_seed, wallet_address FROM employees WHERE id = ?', [employeeID], async (err, row) => {
      if (err) {
        console.error('Error fetching wallet seed:', err.message);
        return res.status(500).json({ message: 'Database error.', error: err.message });
      }
      if (!row || !row.wallet_seed) {
        return res.status(400).json({ message: 'No wallet seed stored for this employee. Generate a wallet first.' });
      }

      const xrplClient = getXRPLClient();
      if (!xrplClient.isConnected()) {
        await xrplClient.connect();
      }

      const selectedIssuer = issuerAddress
        ? getIssuerWalletByAddress(issuerAddress)
        : getDefaultIssuerWallet();

      if (!selectedIssuer) {
        return res.status(500).json({ message: 'Issuer wallet not configured.' });
      }

      const employeeWallet = Wallet.fromSeed(row.wallet_seed);
      const issuerWallet = Wallet.fromSeed(selectedIssuer.seed);
      const currency = getXRPLCurrency();

      const trustSetTx = {
        TransactionType: 'TrustSet',
        Account: employeeWallet.classicAddress,
        LimitAmount: {
          currency,
          issuer: issuerWallet.address,
          value: limit,
        },
      };

      const prepared = await xrplClient.autofill(trustSetTx);
      const signed = employeeWallet.sign(prepared);
      const result = await xrplClient.submitAndWait(signed.tx_blob);

      if (result.result.meta.TransactionResult === 'tesSUCCESS') {
        return res.status(200).json({ message: 'Trust line created successfully.' });
      }

      return res.status(500).json({ message: `Failed to create trust line: ${result.result.meta.TransactionResult}` });
    });
  } catch (error) {
    console.error('Error creating trust line for employee:', error.message);
    res.status(500).json({ message: 'Failed to create trust line.', error: error.message });
  }
});

/**
 * GET /api/testnet/employees/trustlines
 * 
 * Fetch employees and check if their wallets have trustlines with the issuer wallet.
 * Admins only.
 */
router.get('/employees/trustlines', authenticateToken, authorizeAdmin, async (req, res) => {
  console.log('Route hit: /employees/trustlines'); // Log when the route is accessed
  try {
    const xrplClient = getXRPLClient();

    if (!xrplClient.isConnected()) {
      console.log('Connecting to XRPL Testnet...');
      await xrplClient.connect();
    }

    console.log('Connected to XRPL Testnet.');

    if (!xrplClient.issuerWallet) {
      const defaultIssuer = getDefaultIssuerWallet();
      if (!defaultIssuer) {
        console.log('Issuer wallet is not initialized.');
        return res.status(500).json({ message: 'Issuer wallet is not initialized. Please connect first.' });
      }
      xrplClient.issuerWallet = Wallet.fromSeed(defaultIssuer.seed);
      xrplClient.issuerAddress = xrplClient.issuerWallet.address;
    }

    console.log('Issuer Wallet Address:', xrplClient.issuerWallet.address);

    // Fetch employee wallets from the database
    const query = `
      SELECT e.id AS employee_id, e.wallet_address, u.username AS name
      FROM employees e
      JOIN users u ON e.userID = u.id
      WHERE e.wallet_address IS NOT NULL
    `;
    console.log('Querying database for employee wallets...');
    db.all(query, [], async (err, rows) => {
      if (err) {
        console.error('Error querying database:', err.message);
        return res.status(500).json({ message: 'Database error.', error: err.message });
      }

      console.log('Employee wallets fetched from database:', rows);

      if (rows.length === 0) {
        console.warn('No employee wallets found in the database.');
        return res.status(200).json({ message: 'No employees with wallets found.', trustLines: [] });
      }

      const trustLines = [];
      for (const employee of rows) {
        try {
          console.log(`Fetching trust lines for wallet: ${employee.wallet_address}`);
          const accountLinesResponse = await xrplClient.request({
            command: 'account_lines',
            account: employee.wallet_address,
          });

          console.log(`Trust lines for ${employee.wallet_address}:`, accountLinesResponse.result.lines);

          const lines = accountLinesResponse.result.lines;
          const trustedWallets = lines.map((line) => ({
            account: line.account,
            limit: line.limit || 'N/A',
          }));

          const trustsIssuer = lines.some((line) => line.account === xrplClient.issuerWallet.address);

          trustLines.push({
            employee_name: employee.name,
            employee_id: employee.employee_id,
            wallet_address: employee.wallet_address,
            trusts_issuer: trustsIssuer,
            trusted_wallets: trustedWallets,
          });
        } catch (error) {
          console.error(`Error fetching trust lines for wallet ${employee.wallet_address}:`, error.message);
          trustLines.push({
            employee_name: employee.name,
            wallet_address: employee.wallet_address,
            trusts_issuer: false,
            trusted_wallets: [],
            error: error.message,
          });
        }
      }

      console.log('Trust lines fetched for all employees:', trustLines);

      res.status(200).json({ trustLines });
    });
  } catch (error) {
    console.error('Unhandled error in /employees/trustlines:', error.message);
    res.status(500).json({ message: 'Failed to fetch trust lines.', error: error.message });
  }
});

module.exports = router;
