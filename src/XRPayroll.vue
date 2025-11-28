/*
 * RLUSD Cross-Border Employee Demo
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
 
<template>
  <div class="container">
    <!-- Header Section -->
    <header class="header">
      <h1>XRPayroll Dashboard</h1>
      <span v-if="user.username" class="badge-network">Network: {{ network }}</span>
      <div class="user-info" v-if="user.username">
        <div class="user-dropdown">
          <button class="user-button" @click="toggleMenu">
            Welcome, {{ user.username }} ({{ user.role }}) ▾
          </button>
          <div v-if="menuOpen" class="menu">
            <router-link to="/account" @click="toggleMenu(false)">Account Settings</router-link>
            <router-link v-if="isAdmin" to="/settings" @click="toggleMenu(false)">Admin Settings</router-link>
            <router-link v-if="isEmployee" to="/my-payments" @click="toggleMenu(false)">My Payments</router-link>
            <button class="menu-logout" @click="handleLogout">Logout</button>
          </div>
        </div>
      </div>
    </header>

    <!-- Navigation Links -->
    <nav class="navigation">
     <!-- Role-Based Additional Navigation Links -->
      <div class="additional-links">
        <!-- Admin-Only Links -->
        <div v-if="isAdmin">
          <router-link to="/">
            <button :class="{ active: isActive('/') }">Main</button>
          </router-link>
          <router-link to="/user-management">
            <button :class="{ active: isActive('/user-management') }">Manage User</button>
          </router-link>
          <router-link to="/trustlines">
            <button :class="{ active: isActive('/trustlines') }">Manage Trust Lines</button>
          </router-link>
          <router-link to="/payments">
            <button :class="{ active: isActive('/payments') }">Handle Payments</button>
          </router-link>          
        </div>

        <!-- Employee-Only Links -->
        <div v-if="isEmployee">
          <router-link to="/profile">
            <button :class="{ active: isActive('/profile') }">My Profile</button>
          </router-link>
          <router-link to="/my-payments">
            <button :class="{ active: isActive('/my-payments') }">My Payments</button>
          </router-link>
        </div>
      </div>
    </nav>

    <div v-if="isHome && isAdmin">
      <!-- Buttons Section -->
      <div class="buttons">
        <!-- Admin-Only Buttons -->
        <div v-if="isAdmin" class="buttons-row">
          <button @click="connectXRPL" :disabled="connecting || connected">
            {{ connected ? 'Connected' : 'Connect to XRPL' }}
          </button>
                  </div>
        <div v-if="isAdmin">
          <button @click="disconnectXRPL" :disabled="!connected">
            Disconnect
          </button>
        </div>
      </div>

      <!-- Issuer (Sender) Info -->
      <div class="wallet-info">
        <h3>Issuer (Sender) Wallet</h3>
        <p><strong>XRP Address:</strong> {{ issuerWallet || 'N/A' }}</p>
        <p><strong>RLUSD Issuer Address:</strong> {{ issuerWallet || 'N/A' }}</p>
        <p class="hint">XRP is for fees/reserve; RLUSD payouts spend from the payout wallet below.</p>
      </div>

      <div class="wallet-info">
        <h3>Payout Wallet</h3>
        <p><strong>Address:</strong> {{ payoutAddress || 'Not set' }}</p>
        <p><strong>RLUSD Balance (spendable):</strong> {{ payoutRlsBalance || 'N/A' }}</p>
        <p><strong>XRP Balance:</strong> {{ payoutXrpBalance || 'N/A' }}</p>
        <p class="hint">Payroll transactions use this wallet.</p>
      </div>

      <!-- Employee Records -->
      <section class="employee-records">  
        <h2>Employee Records</h2>
        <button @click="loadEmployees" :disabled="!connected">Refresh Employees</button>      
        <table v-if="employeeRecords.length">
          <thead>
            <tr>
              <th>Name</th>
              <th>Employee ID</th>
              <th>Salary (RLUSD)</th>
              <th>Wallet Address</th>
              <th>Latest TX</th>
              <th>Dispute</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="emp in employeeRecords" :key="emp.employee_id">
              <td>{{ emp.name }}</td>
              <td>{{ emp.employee_id }}</td>
              <td>{{ emp.salary }}</td>
              <td>{{ emp.wallet_address || 'No Wallet' }}</td>
              <td>{{ emp.latest_transaction || 'No TX (yet)' }}</td>
              <td>
                <button @click="traceTransactions" :disabled="traceInProgress || !connected">Trace</button>
              </td>
              <td>
                <button 
                  @click="executeSalary(emp)" 
                  :disabled="salaryExecutionInProgress || !connected">
                  Execute Salary
                </button>              
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else>No employee records available.</p>
      </section>

      <!-- Trace Results -->
      <section class="trace-results" v-if="traceResults.length">
        <h2>Trace Results</h2>
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>TX ID</th>
              <th>Amount</th>
              <th>Wallet</th>
              <th>Received</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="result in traceResults" :key="result.tx_id">
              <td>{{ result.employee_name }}</td>
              <td>{{ result.tx_id }}</td>
              <td>{{ result.amount }}</td>
              <td>{{ result.wallet_address }}</td>
              <td>{{ result.ledger_close_time }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- CSV Import/Export -->
      <section class="csv-section">
        <h2>Employee CSV Import/Export</h2>

        <div class="import-csv">
          <h3>Import Employees via CSV</h3>
          <form @submit.prevent="importCsv">
            <input type="file" accept=".csv" ref="fileInput" />
            <button type="submit">Import CSV</button>
          </form>
        </div>

        <div class="export-csv">
          <h3>Export Employees to CSV</h3>
          <button @click="exportCsv">Download Employees CSV</button>
        </div>
      </section>

      <!-- Log Level Selector -->
      <div class="log-level">
        <label for="logLevelSelect">Log Level:</label>
        <select id="logLevelSelect" v-model="selectedLogLevel">
          <option v-for="level in logLevels" :key="level.value" :value="level.value">
            {{ level.label }}
          </option>
        </select>
      </div>

      <!-- Logs Display -->
      <div class="logs">
        <h3>Logs</h3>
        <div v-for="(log, index) in filteredLogs" :key="index" class="log-line">
          <span :class="log.level">
            {{ log.timestamp }} [{{ log.level }}]: {{ log.message }}
          </span>
        </div>
      </div>
    </div>

    <!-- Router View for Child Routes -->
    <router-view />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import jwtDecode from 'jwt-decode';
import { useRouter, useRoute } from 'vue-router';

// ----------------------------------------------------------------------------
// LOGGING
// ----------------------------------------------------------------------------
const LOG_PRIORITY = {
  DEBUG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4
};

const logLevels = [
  { label: 'DEBUG', value: 'DEBUG' },
  { label: 'INFO',  value: 'INFO'  },
  { label: 'WARN',  value: 'WARN'  },
  { label: 'ERROR', value: 'ERROR' }
];

const selectedLogLevel = ref('DEBUG');
const logs = ref([]);
const requestWalletInProgress = ref(false);

function addLog(level, message) {
  logs.value.push({
    level,
    message,
    timestamp: new Date().toLocaleTimeString()
  });
}

const filteredLogs = computed(() => {
  return logs.value.filter(log => {
    return LOG_PRIORITY[log.level] >= LOG_PRIORITY[selectedLogLevel.value];
  });
});

// ----------------------------------------------------------------------------
// USER AUTHENTICATION
// ----------------------------------------------------------------------------
const user = ref({
  username: '',
  role: 'employee' // default role
});

function decodeToken() {
  const token = localStorage.getItem('token');
  if (token) {
    try {
      const decoded = jwtDecode(token); // Ensure jwtDecode is correctly imported
      user.value.username = decoded.username;
      user.value.role = decoded.role;
      addLog('INFO', `Logged in as ${decoded.username} with role ${decoded.role}`);
    } catch (error) {
      console.error('Error decoding token:', error);
      addLog('ERROR', 'Invalid token. Please log in again.');
      alert('Invalid token. Please log in again.');
    }
  } else {
    addLog('WARN', 'No token found. Please log in.');
    alert('No token found. Please log in.');
  }
}

const isAdmin = computed(() => user.value.role === 'admin');
const isEmployee = computed(() => user.value.role === 'employee');

const router = useRouter();
const route = useRoute();

// Function to check if a path is active for styling
const isActive = (path) => {
  return route.path === path;
};

const isHome = computed(() => route.name === 'Home' || route.path === '/');

const menuOpen = ref(false);
const toggleMenu = (force) => {
  if (typeof force === 'boolean') {
    menuOpen.value = force;
  } else {
    menuOpen.value = !menuOpen.value;
  }
};

// Logout Handler
function handleLogout() {
  // Clear token and user info from localStorage
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  user.value = { username: '', role: '' };
  addLog('INFO', 'User logged out.');
  // Redirect to Login page
  router.push({ name: 'Login' });
}

// connect defaults
const status = ref('Disconnected from XRPL');
const connected = ref(false);
const connecting = ref(false);
const network = ref('unknown');

// Issuer & Selected Employee Wallets
const issuerWallet = ref('');
const selectedEmployeeWallet = ref('');

// Store the issuer's RLS balance
const issuerXrpBalance = ref('');
const issuerIssuedSupply = ref('');
const payoutAddress = ref('');
const payoutRlsBalance = ref('');
const payoutXrpBalance = ref('');

// Store the user's latest transaction
const userLatestTx = ref(null);

// Trace transactions
const traceResults = ref([]);
const traceInProgress = ref(false);

async function loadConfig() {
  try {
    const resp = await axios.get('/api/config');
    network.value = resp.data.network || 'unknown';
  } catch (e) {
    addLog('WARN', `Failed to load config: ${e.message}`);
  }
}

// connect to XRPL
async function connectXRPL() {
    status.value = 'Connecting to XRPL...';
    addLog('INFO', 'Initiating connection to XRPL...');
  
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('Authentication token not found. Please log in.');
        }

        // Connect to XRPL Testnet
        const connectResp = await axios.post('/api/testnet/connect', {}, {
            headers: { Authorization: `Bearer ${token}` },
        });

        if (connectResp.data && connectResp.data.address) {
            issuerWallet.value = connectResp.data.address;
            connected.value = true;
            status.value = 'Connected to XRPL';
            addLog('INFO', `Connected to XRPL with issuer ${issuerWallet.value}`);
            
            // Fetch updated RLUSD balance after connecting
            await getIssuerRlsBalance();
        } else {
            throw new Error('Unexpected response from the server during connection.');
        }
    } catch (error) {
        status.value = 'Connection failed!';
        const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
        addLog('ERROR', `Failed to connect to XRPL Testnet: ${errorMessage}`);
        console.error(error);
        alert(`Connection Error: ${errorMessage}`);
    }
}

// Track salary execution progress
const salaryExecutionInProgress = ref(false);

/// Execute Salary Workflow: Create Wallet, Trust Line, and Send Salary
async function executeSalary(employee) {
    if (!employee || !employee.employee_id) {
        alert('Invalid employee information.');
        return;
    }

    salaryExecutionInProgress.value = true;
    status.value = `Executing salary for employee: ${employee.name}...`;
    addLog('INFO', `Initiating salary execution for employee: ${employee.name}`);

    try {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('Authentication token not found. Please log in.');
        }

        // Step 1: Ensure Wallet Exists and Is Active
        if (!employee.wallet_address) {
            await createWalletForEmployee(employee, token);
        } else {
            const isActive = await checkWalletActivation(employee.wallet_address, token);
            if (!isActive) {
                await fundWalletForActivation(employee.wallet_address, token);
            }
        }

        // Step 2: Send Salary (assumes trustline already in place)
        const salaryAmount = parseFloat(employee.salary) || 0;
        if (salaryAmount <= 0) {
            throw new Error('Invalid salary amount.');
        }

        await axios.post(
            '/api/testnet/payments/send',
            { employeeWallet: employee.wallet_address, amount: salaryAmount },
            { headers: { Authorization: `Bearer ${token}` } }
        );
        addLog('INFO', `Salary of ${salaryAmount} RLUSD sent to ${employee.wallet_address}`);

        // Step 3: Refresh Issuer Balance
        await getIssuerRlsBalance();

        alert(`Salary executed successfully for ${employee.name}`);
    } catch (error) {
        status.value = 'Salary execution failed!';
        const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
        addLog('ERROR', `Failed to execute salary for ${employee.name}: ${errorMessage}`);
        alert(`Error: ${errorMessage}`);
    } finally {
        salaryExecutionInProgress.value = false;
        await loadEmployees(); // Refresh the employee list
    }
}

// Helper Function: Create Wallet for Employee
async function createWalletForEmployee(employee, token) {
    requestWalletInProgress.value = true;
    status.value = `Creating wallet for ${employee.name}...`;
    addLog('INFO', `Creating wallet for employee ID: ${employee.employee_id}`);

    try {
        const walletResponse = await axios.post(
            '/api/testnet/employees/request-wallet',
            { employeeID: employee.employee_id },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        employee.wallet_address = walletResponse.data.walletAddress;
        addLog('INFO', `Wallet created: ${employee.wallet_address}`);
        status.value = `Wallet created successfully for ${employee.name}`;

        await fundWalletForActivation(employee.wallet_address, token);
    } catch (error) {
        throw new Error(`Failed to create wallet: ${error.response?.data?.message || error.message}`);
    } finally {
        requestWalletInProgress.value = false;
    }
}

// Helper Function: Check Wallet Activation
async function checkWalletActivation(walletAddress, token) {
    status.value = `Checking activation for wallet: ${walletAddress}...`;
    addLog('INFO', `Checking activation status for wallet: ${walletAddress}`);

    try {
        const response = await axios.post(
            '/api/testnet/wallet/verify',
            { walletAddress },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        if (response.data.activated) {
            addLog('INFO', `Wallet is active: ${walletAddress}`);
            return true;
        }
    } catch (error) {
        if (error.response?.data?.error === 'actNotFound') {
            addLog('WARN', `Wallet not active: ${walletAddress}`);
            return false;
        }
        throw new Error(`Error verifying wallet activation: ${error.response?.data?.message || error.message}`);
    }
    return false;
}

// Helper Function: Fund Wallet for Activation
async function fundWalletForActivation(walletAddress, token) {
    status.value = `Funding wallet for activation: ${walletAddress}...`;
    addLog('INFO', `Funding wallet: ${walletAddress}`);

    try {
        await axios.post(
            '/api/testnet/fund-wallet',
            { walletAddress },
            { headers: { Authorization: `Bearer ${token}` } }
        );
        addLog('INFO', `Wallet funded: ${walletAddress}`);
    } catch (error) {
        throw new Error(`Failed to fund wallet: ${error.response?.data?.message || error.message}`);
    }
}

// get issuer RLS balance
async function getIssuerRlsBalance() {
    if (!connected.value) {
        return;
    }
    status.value = 'Fetching issuer RLS balance...';
    addLog('INFO', 'Requesting issuer RLS balance from backend...');
  
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('Authentication token not found. Please log in.');
        }

        const resp = await axios.get('/api/testnet/issuer/balance', {
            headers: { Authorization: `Bearer ${token}` },
        });

        const xrpBalance = resp.data.xrpBalance || `${(parseFloat(resp.data.xrpBalanceDrops || 0) / 1_000_000).toFixed(6)} XRP`;
        issuerXrpBalance.value = xrpBalance;
        issuerIssuedSupply.value = `${resp.data.issuedSupply || 0} ${resp.data.issuedCurrency || 'USD'}`;
        payoutAddress.value = resp.data.payoutAddress || '';
        payoutRlsBalance.value = resp.data.payoutBalance !== null && resp.data.payoutBalance !== undefined
          ? `${resp.data.payoutBalance} ${resp.data.issuedCurrency || 'USD'}`
          : '';
        payoutXrpBalance.value = resp.data.payoutXrp ? `${resp.data.payoutXrp} XRP` : '';
        status.value = `Issuer XRP balance: ${issuerXrpBalance.value}`;
        addLog('INFO', `Issuer XRP Balance: ${issuerXrpBalance.value}, Issued: ${issuerIssuedSupply.value}`);
    } catch (error) {
        status.value = 'Failed to fetch issuer balance!';
        const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
        addLog('ERROR', `Failed to get issuer balance: ${errorMessage}`);
        console.error(error);
        alert(`Balance Fetch Error: ${errorMessage}`);
    }
}

// load employee records
const employeeRecords = ref([]);

async function loadEmployees() {
  if (!connected.value) {
    addLog('WARN', 'XRPL not connected. Connect first to load employees.');
    return;
  }

  status.value = 'Loading employee records...';
  addLog('INFO', 'Fetching employee records from backend...');

  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Authentication token not found. Please log in.');
    }

    const resp = await axios.get('/api/testnet/employees', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const employees = resp.data.employees;

    // Fetch the latest transaction for each employee
    for (const employee of employees) {
      const latestTransaction = await fetchLatestTransaction(employee.employee_id);
      if (latestTransaction) {
        employee.latest_transaction = `${latestTransaction.status} on ${latestTransaction.date}`;
        employee.tx_id = latestTransaction.tx_id; // Ensure tx_id is set
      } else {
        employee.latest_transaction = 'No transaction available';
        employee.tx_id = null; // Set to null if no transaction exists
      }

      // Initialize dispute property
      employee.dispute = false;
    }

    employeeRecords.value = employees;
    status.value = 'Employee records loaded.';
    addLog('INFO', `Loaded ${employeeRecords.value.length} employees.`);
  } catch (error) {
    status.value = 'Failed to load employees.';
    const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
    addLog('ERROR', `Error fetching employees: ${errorMessage}`);
    console.error('Error fetching employees:', error);
    alert(`Load Employees Error: ${errorMessage}`);
  }
}

// fetch latest transaction for an employee
async function fetchLatestTransaction(employeeID) {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Authentication token not found. Please log in.');
    }

    const resp = await axios.get(`/api/testnet/employee/${employeeID}/latest-transaction`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return resp.data.transaction;
  } catch (error) {
    addLog('ERROR', `Error fetching latest transaction for employee ${employeeID}: ${error.message}`);
    console.error(error);
    return null;
  }
}

// Trace Transactions
async function traceTransactions() {
  const token = localStorage.getItem('token');
  if (!token) {
    alert('Please log in.');
    return;
  }

  traceInProgress.value = true;
  traceResults.value = [];

  const employeesToTrace = employeeRecords.value.filter((emp) => emp.tx_id);
  if (employeesToTrace.length === 0) {
    addLog('WARN', 'No transactions available to trace yet.');
    traceInProgress.value = false;
    return;
  }

  addLog('INFO', `Starting trace for ${employeesToTrace.length} selected employees...`);

  try {
    for (const emp of employeesToTrace) {
      addLog('DEBUG', `Tracing transaction for employee: ${emp.name}, TX ID: ${emp.tx_id}`);

      const response = await axios.get(`/api/testnet/transactions/trace/${emp.tx_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Format the ledger_close_time
      const rawCloseTime = response.data.ledger_close_time || 'N/A';
      const formattedCloseTime =
        rawCloseTime !== 'N/A'
          ? new Date(rawCloseTime).toLocaleString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: 'numeric',
              minute: 'numeric',
              second: 'numeric',
              hour12: true,
            })
          : 'N/A';

      traceResults.value.push({
        employee_name: emp.name,
        tx_id: response.data.tx_id,
        amount: response.data.amount || 'N/A',
        wallet_address: emp.wallet_address || 'N/A',
        ledger_close_time: formattedCloseTime,
      });

      addLog(
        'INFO',
        `Successfully traced transaction for employee: ${emp.name}. TX ID: ${response.data.tx_id}, Amount: ${response.data.amount || 'N/A'}, Ledger Close Time: ${formattedCloseTime}`
      );
    }
    addLog('SUCCESS', `Traced ${traceResults.value.length} transactions successfully.`);
  } catch (error) {
    console.error('Error tracing transactions:', error.message);
    addLog('ERROR', `Error tracing transactions: ${error.message}`);
    alert('Failed to trace transactions.');
  } finally {
    traceInProgress.value = false;
    addLog('INFO', 'Trace process completed.');
  }
}

// load transaction history
const transactions = ref([]);

async function loadTransactions() {
  if (!connected.value) {
    addLog('WARN', 'XRPL not connected. Connect first to load transactions.');
    return;
  }

  status.value = 'Loading transaction history...';
  addLog('INFO', 'Fetching all transaction history from backend...');

  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Authentication token not found. Please log in.');
    }

    const resp = await axios.get('/api/testnet/transactions', {
      headers: { Authorization: `Bearer ${token}` },
    });

    transactions.value = resp.data.transactions;
    status.value = 'Transaction history loaded.';
    addLog('INFO', `Loaded ${transactions.value.length} transactions.`);
  } catch (error) {
    status.value = 'Failed to load transaction history.';
    const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
    addLog('ERROR', `Error fetching transactions: ${errorMessage}`);
    console.error(error);
    alert(`Load Transactions Error: ${errorMessage}`);
  }
}

// disconnect from XRPL
function disconnectXRPL() {
  if (connected.value) {
    addLog('INFO', 'Disconnected from XRPL Testnet.');
    connected.value = false;
    issuerWallet.value = '';
    issuerXrpBalance.value = '0';
    issuerIssuedSupply.value = '0 USD';
    payoutAddress.value = '';
    selectedEmployeeWallet.value = '';
    userLatestTx.value = null;
    status.value = 'Disconnected from XRPL';
  }
}

// import/export CSV
const fileInput = ref(null);

async function importCsv() {
  const file = fileInput.value.files[0];
  if (!file) {
    alert('Please select a CSV file to import.');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  try {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Authentication token not found. Please log in.');
      return;
    }

    const response = await axios.post('/api/csv/import', formData, { // Ensure the endpoint matches
      headers: {
        'Content-Type': 'multipart/form-data',
        'Authorization': `Bearer ${token}`
      }
    });

    alert(response.data.message);
    addLog('INFO', response.data.message);

    // Refresh employee records
    loadEmployees();
    loadTransactions();
  } catch (error) {
    if (error.response && error.response.data && error.response.data.message) {
      alert(error.response.data.message);
      addLog('ERROR', error.response.data.message);
    } else {
      alert('Failed to import CSV.');
      addLog('ERROR', `Failed to import CSV: ${error.message}`);
    }
    console.error(error);
  }
}

async function exportCsv() {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Authentication token not found. Please log in.');
      return;
    }

    const response = await axios.get('/api/csv/export', { // Ensure this endpoint exists
      headers: {
        'Authorization': `Bearer ${token}`
      },
      responseType: 'blob' // Important for file downloads
    });

    // Create a URL for the blob and trigger a download
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'employees.csv');
    document.body.appendChild(link);
    link.click();
    link.parentNode.removeChild(link);

    addLog('INFO', 'Employees CSV exported successfully.');
  } catch (error) {
    if (error.response && error.response.data && error.response.data.message) {
      alert(error.response.data.message);
      addLog('ERROR', error.response.data.message);
    } else {
      alert('Failed to export CSV.');
      addLog('ERROR', `Failed to export CSV: ${error.message}`);
    }
    console.error(error);
  }
}

// lifecycle hooks
onMounted(() => {
  decodeToken();
  loadConfig();
  loadEmployees();
  loadTransactions();
});
</script>


<style scoped>
.container {
  max-width: 80%;
  margin: 40px auto;
  font-family: Arial, sans-serif;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
}
.badge-network {
  display: inline-block;
  background: #4a5568;
  color: #fff;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  text-transform: uppercase;
}
.user-dropdown {
  position: relative;
}
.user-button {
  padding: 8px 10px;
  background: #f0f0f0;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
  min-width: 200px;
  text-align: left;
}
.menu {
  position: absolute;
  right: 0;
  top: 40px;
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
  display: flex;
  flex-direction: column;
  min-width: 220px;
  z-index: 10;
}
.menu a,
.menu button {
  padding: 8px 12px;
  text-align: left;
  border: none;
  background: none;
  width: 100%;
  cursor: pointer;
  font-size: 14px;
  display: block;
  text-decoration: none;
  color: #333;
}
.menu a:hover,
.menu button:hover {
  background: #f5f5f5;
}
.menu-logout {
  color: #c00;
}

.logout-button {
  padding: 5px 10px;
  background-color: #cc0000;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.logout-button:hover {
  background-color: #990000;
}

.navigation {
  margin: 20px 0;
}

.navigation button {
  margin-right: 10px;
  padding: 10px 15px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.navigation button.active,
.navigation button:hover {
  background-color: #0056b3;
}

.admin-navigation {
  margin-top: 20px;
}

.admin-navigation button {
  padding: 10px 20px;
  background-color: #f0ad4e;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.admin-navigation button:hover {
  background-color: #ec971f;
}

.additional-links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.additional-links button {
  padding: 10px 15px;
  background-color: #28a745;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.additional-links button.active,
.additional-links button:hover {
  background-color: #218838;
}

.buttons button {
  margin: 0 10px 10px 0;
  min-width: 180px;
}

.buttons-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.badge {
  background: #eef2f7;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
}

.wallet-info {
  margin-top: 20px;
  padding: 10px;
  border: 1px solid #ccc;
}

.csv-section {
  margin-top: 30px;
  padding: 10px;
  border: 1px solid #ccc;
}

.csv-section h2 {
  margin-bottom: 10px;
}

.import-csv, .export-csv {
  margin-bottom: 20px;
}

.employee-records, .transaction-history {
  margin-top: 30px;
  padding: 10px;
  border: 1px solid #ccc;
}

.employee-records h2, .transaction-history h2 {
  margin-bottom: 10px;
}

.employee-records table, .transaction-history table {
  width: 100%;
  border-collapse: collapse;
}

.employee-records th, .employee-records td,
.transaction-history th, .transaction-history td {
  border: 1px solid #ddd;
  padding: 8px;
}

.employee-records th, .transaction-history th {
  background-color: #f2f2f2;
  text-align: left;
}

.log-level {
  margin: 20px 0 10px;
}

.logs {
  border: 1px solid #ccc;
  padding: 10px;
  max-height: 200px;
  overflow-y: auto;
}

.log-line {
  font-family: monospace;
  margin: 2px 0;
}

.log-line .DEBUG {
  color: #999;
}

.log-line .INFO {
  color: #0066cc;
}

.log-line .WARN {
  color: #ffa500;
}

.log-line .ERROR {
  color: #cc0000;
}

.success {
  color: green;
  font-weight: bold;
}

.failure {
  color: red;
  font-weight: bold;
}

.trace-results {
  margin-top: 20px;
  border: 1px solid #ccc;
  padding: 10px;
}
.trace-results h2 {
  margin-bottom: 10px;
}
.trace-results table {
  width: 100%;
  border-collapse: collapse;
}
.trace-results th, .trace-results td {
  border: 1px solid #ddd;
  padding: 8px;
}
.trace-results th {
  background-color: #f2f2f2;
}

</style>
