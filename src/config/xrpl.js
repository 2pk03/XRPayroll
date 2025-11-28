const xrpl = require('xrpl');

const NETWORKS = {
  devnet: 'wss://s.devnet.rippletest.net:51233',
  testnet: 'wss://s.altnet.rippletest.net:51233',
  mainnet: 'wss://xrplcluster.com',
};

function getXRPLSettings() {
  const network = (process.env.XRPL_NETWORK || 'testnet').toLowerCase();
  const allowMainnet = process.env.XRPL_ALLOW_MAINNET === 'true';
  if (network === 'mainnet' && !allowMainnet) {
    throw new Error('Mainnet is disabled. Set XRPL_ALLOW_MAINNET=true to enable (use with caution).');
  }
  const endpoint = NETWORKS[network] || NETWORKS.testnet;
  return { network, endpoint, allowMainnet };
}

function getXRPLCurrency() {
  // Ledger code is USD; represents RLUSD issued by the configured issuer.
  return (process.env.XRPL_CURRENCY || 'USD').toUpperCase();
}

function parseIssuerWallets() {
  const seeds = [];
  if (process.env.ISSUER_WALLET_SEED) seeds.push(process.env.ISSUER_WALLET_SEED);
  if (process.env.ISSUER_WALLET_SEEDS) {
    process.env.ISSUER_WALLET_SEEDS.split(',').forEach((s) => {
      const trimmed = s.trim();
      if (trimmed) seeds.push(trimmed);
    });
  }
  const wallets = seeds.map((seed) => {
    const w = xrpl.Wallet.fromSeed(seed);
    return { seed, address: w.classicAddress };
  });
  return wallets;
}

function getIssuerWalletByAddress(address) {
  const wallets = parseIssuerWallets();
  return wallets.find((w) => w.address === address);
}

function getPayoutWalletSeed() {
  return process.env.PAYOUT_WALLET_SEED || process.env.TREASURY_WALLET_SEED || '';
}

function getPayoutWallet() {
  const seed = getPayoutWalletSeed();
  if (!seed) return null;
  const w = xrpl.Wallet.fromSeed(seed);
  return { seed, address: w.classicAddress };
}

function getDefaultIssuerWallet() {
  const wallets = parseIssuerWallets();
  return wallets[0] || null;
}

module.exports = {
  getXRPLSettings,
  parseIssuerWallets,
  getIssuerWalletByAddress,
  getDefaultIssuerWallet,
  getPayoutWallet,
  getPayoutWalletSeed,
  getXRPLCurrency,
  NETWORKS,
};
