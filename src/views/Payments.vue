<template>
  <div class="payments">
    <header class="payments-header">
      <div>
        <h2>Payments</h2>
        <p>Send payroll to employee wallets (USD demo IOU on testnet).</p>
      </div>
      <div class="status">
        <span class="badge">Network: {{ network }}</span>
        <span class="badge">Issuer: {{ issuerAddress || 'N/A' }}</span>
        <span v-if="maxPerTx > 0" class="badge">Cap: {{ maxPerTx }}</span>
      </div>
    </header>

    <section class="issuer">
      <label for="issuerSelect">Issuer Account</label>
      <select id="issuerSelect" v-model="selectedIssuer">
        <option v-for="addr in issuerAddresses" :key="addr" :value="addr">{{ addr }}</option>
      </select>
      <button @click="refreshConfig">Refresh Config</button>
    </section>

    <section class="employees">
      <div class="actions">
        <button @click="loadEmployees" :disabled="loadingEmployees">Load Employees</button>
        <button @click="loadTransactions" :disabled="loadingTx">Load Transactions</button>
      </div>

      <div v-if="employees.length">
        <h3>Employees</h3>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Salary</th>
              <th>Wallet</th>
              <th>Last TX</th>
              <th>Status</th>
              <th>Send</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="emp in employees" :key="emp.employee_id">
              <td>{{ emp.name }}</td>
              <td>{{ emp.salary }} {{ emp.salary_currency || 'USD' }}</td>
              <td>
                {{ emp.wallet_address || 'N/A' }}
                <span v-if="!isReady(emp.wallet_address)" class="warn">No trustline</span>
              </td>
              <td>
                <div v-if="lastTx(emp).status || lastTx(emp).date">
                  {{ lastTx(emp).status || 'Success' }}
                  <span v-if="lastTx(emp).date"> on {{ formatDate(lastTx(emp).date) }}</span>
                </div>
                <div v-else>No transaction available</div>
              </td>
              <td>
                <span v-if="isReady(emp.wallet_address)" class="ok">Ready</span>
                <span v-else class="warn">Not ready</span>
              </td>
              <td>
                <button
                  :disabled="paying || !emp.wallet_address || !isReady(emp.wallet_address)"
                  @click="sendPayment(emp)"
                >
                  Send Salary
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else>No employees loaded.</p>
    </section>

    <section class="transactions" v-if="transactions.length">
      <h3>Recent Transactions</h3>
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Amount</th>
            <th>Wallet</th>
            <th>Status</th>
            <th>Date</th>
            <th>TX ID</th>
            <th>Trace</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tx in transactions" :key="tx.transaction_id || tx.tx_id">
            <td>{{ tx.employee_name || tx.employee_id }}</td>
            <td>{{ tx.amount }} {{ tx.currency || tx.salary_currency || 'USD' }}</td>
            <td>{{ tx.wallet_address }}</td>
            <td>{{ tx.status }}</td>
            <td>{{ formatDate(tx.date || tx.latest_date || tx.tx_date) }}</td>
            <td>{{ tx.tx_id || 'N/A' }}</td>
            <td>
              <button :disabled="tracing || !tx.tx_id" @click="traceTx(tx.tx_id)">
                {{ tx.tx_id ? 'Trace' : 'No hash' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="trace-results" v-if="traceResult">
      <h3>Trace Result</h3>
      <pre>{{ traceResult }}</pre>
    </section>

    <section class="messages" v-if="message">
      <p :class="messageType">{{ message }}</p>
    </section>

  </div>
</template>

<script>
import axios from 'axios';

export default {
  name: 'PaymentsView',
  data() {
    return {
      network: 'testnet',
      issuerAddresses: [],
      issuerAddress: '',
      selectedIssuer: '',
      maxPerTx: 0,
            employees: [],
      transactions: [],
      traceResult: '',
      message: '',
      messageType: 'info',
      readiness: {},
      loadingEmployees: false,
      loadingTx: false,
            tracing: false,
      paying: false,
                            };
  },
  methods: {
    setMessage(msg, type = 'info') {
      this.message = msg;
      this.messageType = type;
    },
    async refreshConfig() {
      try {
        const resp = await axios.get('/api/config');
        this.network = resp.data.network || 'testnet';
        this.issuerAddresses = resp.data.issuerAddresses || [];
        this.issuerAddress = this.issuerAddresses[0] || '';
        this.selectedIssuer = this.issuerAddress;
        this.maxPerTx = parseFloat(process.env.VUE_APP_MAX_PAYMENT_PER_TX || '0');
        await this.loadDemoStatus();
      } catch (err) {
        this.setMessage(err.response?.data?.message || err.message, 'error');
      }
    },
    async loadEmployees() {
      this.loadingEmployees = true;
      this.setMessage('');
      try {
        const token = localStorage.getItem('token');
        const resp = await axios.get('/api/testnet/employees', {
          headers: { Authorization: `Bearer ${token}` },
        });
        this.employees = (resp.data.employees || []).map((e) => ({
          ...e,
          latest_date: e.latest_date || 'N/A',
          latest_status: e.latest_status || 'N/A',
          tx_id: e.tx_id || null,
        }));
        await this.checkReadiness();
      } catch (err) {
        this.setMessage(err.response?.data?.message || err.message, 'error');
      } finally {
        this.loadingEmployees = false;
      }
    },
    formatDate(val) {
      if (!val) return 'N/A';
      const raw = (typeof val === 'string' ? val : String(val)).trim();
      if (!raw || raw.toLowerCase() === 'invalid date') return 'N/A';
      // Handle common SQLite datetime "YYYY-MM-DD HH:mm:ss"
      const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
      if (match) {
        const [, y, mo, d, h, mi, s] = match;
        const utcDate = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
        if (!Number.isNaN(utcDate.getTime())) return utcDate.toLocaleString();
      }
      const dflt = new Date(raw);
      if (!Number.isNaN(dflt.getTime())) return dflt.toLocaleString();
      return raw || 'N/A';
    },
    async loadTransactions() {
      this.loadingTx = true;
      this.setMessage('');
      try {
        const token = localStorage.getItem('token');
        const resp = await axios.get('/api/testnet/transactions', {
          headers: { Authorization: `Bearer ${token}` },
        });
        this.transactions = (resp.data.transactions || [])
          .map((t) => ({
            ...t,
            date: t.date || t.tx_date || t.latest_date || null,
          }))
          .sort((a, b) => {
            const da = a.date ? new Date(a.date).getTime() : 0;
            const db = b.date ? new Date(b.date).getTime() : 0;
            return db - da;
          });
      } catch (err) {
        this.setMessage(err.response?.data?.message || err.message, 'error');
      } finally {
        this.loadingTx = false;
      }
    },
    async sendPayment(emp) {
      if (!emp || !emp.wallet_address) {
        this.setMessage('Employee has no wallet.', 'error');
        return;
      }
      const currency = emp.salary_currency || 'USD';
      const proceed = window.confirm(`You are about to send ${emp.salary} ${currency} from issuer ${this.selectedIssuer || this.issuerAddress || 'N/A'} to ${emp.wallet_address}. Continue?`);
      if (!proceed) return;
      this.paying = true;
      this.setMessage('');
      try {
        const token = localStorage.getItem('token');
        const payload = {
          employeeWallet: emp.wallet_address,
          amount: emp.salary,
          currency,
        };
        if (this.selectedIssuer) {
          payload.issuerAddress = this.selectedIssuer;
        }
        const resp = await axios.post('/api/testnet/payments/send', payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        this.setMessage(resp.data.message || 'Payment sent', 'success');
        await this.loadTransactions();
        await this.checkReadiness();
      } catch (err) {
        const msg = err.response?.data?.message || err.message || 'Payment failed.';
        this.setMessage(`Failed to send payment: ${msg}`, 'error');
      } finally {
        this.paying = false;
      }
    },
    async traceTx(txId) {
      if (!txId) {
        this.setMessage('No transaction ID to trace.', 'error');
        return;
      }
      this.tracing = true;
      this.traceResult = '';
      try {
        const token = localStorage.getItem('token');
        const resp = await axios.get(`/api/testnet/transactions/trace/${txId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        this.traceResult = JSON.stringify(resp.data, null, 2);
      } catch (err) {
        this.setMessage(err.response?.data?.message || err.message, 'error');
      } finally {
        this.tracing = false;
      }
    },
    async mintDemo() {
      this.minting = true;
      this.setMessage('');
      try {
        const token = localStorage.getItem('token');
        await axios.post('/api/testnet/mint-demo', { amount: this.mintAmount }, {
          headers: { Authorization: `Bearer ${token}` },
        });
        this.setMessage(`Minted ${this.mintAmount} demo USD.`, 'success');
        await this.loadDemoStatus();
      } catch (err) {
        const msg = err.response?.data?.message || err.message || 'Mint failed.';
        this.setMessage(`Mint failed: ${msg}`, 'error');
      } finally {
        this.minting = false;
      }
    },
    async loadDemoStatus() {
      this.loadingDemoStatus = true;
      try {
        const token = localStorage.getItem('token');
        const resp = await axios.get('/api/testnet/demo/status', {
          headers: { Authorization: `Bearer ${token}` },
        });
        this.demoStatus = resp.data;
      } catch (err) {
        this.setMessage(err.response?.data?.message || err.message, 'error');
      } finally {
        this.loadingDemoStatus = false;
      }
    },
    async transferToPayout() {
      this.transferring = true;
      this.setMessage('');
      try {
        const token = localStorage.getItem('token');
        await axios.post('/api/testnet/demo/transfer', { amount: this.transferAmount }, {
          headers: { Authorization: `Bearer ${token}` },
        });
        this.setMessage(`Transferred ${this.transferAmount} demo USD to payout.`, 'success');
        await this.loadDemoStatus();
      } catch (err) {
        const msg = err.response?.data?.message || err.message || 'Transfer failed.';
        this.setMessage(msg, 'error');
      } finally {
        this.transferring = false;
      }
    },
    async checkReadiness() {
      try {
        const token = localStorage.getItem('token');
        const resp = await axios.get('/api/testnet/employees/trustlines', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const readinessMap = {};
        (resp.data.trustLines || []).forEach((line) => {
          readinessMap[line.wallet_address] = {
            trustsIssuer: !!line.trusts_issuer,
          };
        });
        this.readiness = readinessMap;
      } catch (err) {
        console.error('Readiness check failed:', err.response?.data || err.message);
      }
    },
    latestTx(wallet) {
      if (!wallet) return null;
      return this.transactions.find((t) => t.wallet_address === wallet) || null;
    },
    lastTx(emp) {
      const tx = emp && emp.wallet_address ? this.latestTx(emp.wallet_address) : null;
      const combinedDate = tx?.date || tx?.latest_date || tx?.tx_date || emp?.latest_date || null;
      return {
        tx_id: tx?.tx_id || emp?.tx_id || null,
        date: combinedDate,
        status: tx?.status || emp?.latest_status || null,
      };
    },
    isReady(wallet) {
      return wallet && this.readiness[wallet]?.trustsIssuer;
    },
  },
  mounted() {
    this.checkReadiness();

    this.refreshConfig();
    this.loadEmployees();
    this.loadTransactions();
  },
};
</script>

<style scoped>
.payments {
  padding: 20px;
}
.payments-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.status {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.badge {
  background: #eef2f7;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
}
.issuer {
  margin: 16px 0;
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.employees table,
.transactions table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
}
th, td {
  border: 1px solid #ddd;
  padding: 8px;
}
.actions {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}
.warn {
  color: #c00;
  font-size: 12px;
  margin-left: 6px;
}
.ok {
  color: #090;
  font-size: 12px;
  margin-left: 6px;
}
.mint {
  display: flex;
  gap: 6px;
  align-items: center;
}
.messages .error { color: #c00; }
.messages .success { color: #090; }
.demo {
  margin-top: 20px;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
}
.demo-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
}
.demo-status {
  display: flex;
  gap: 12px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.card {
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 10px;
  min-width: 240px;
  background: #fafbfc;
}
</style>
