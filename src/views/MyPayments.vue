<template>
  <div class="my-payments">
    <h2>My Payments</h2>
    <div class="actions">
      <button @click="loadTransactions" :disabled="loading">Refresh</button>
    </div>
    <table v-if="transactions.length">
      <thead>
        <tr>
          <th>Date</th>
          <th>Amount</th>
          <th>Status</th>
          <th>Wallet</th>
          <th>TX ID</th>
          <th>Trace</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="tx in transactions" :key="tx.id || tx.tx_id">
          <td>{{ formatDate(tx.date) }}</td>
          <td>{{ tx.amount }}</td>
          <td>{{ tx.status }}</td>
          <td>{{ tx.wallet_address }}</td>
          <td>{{ tx.tx_id || 'N/A' }}</td>
          <td>
            <button :disabled="tracing || !tx.tx_id" @click="traceTx(tx.tx_id)">Trace</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else>No transactions yet.</p>

    <section class="trace" v-if="traceResult">
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
  name: 'MyPayments',
  data() {
    return {
      transactions: [],
      traceResult: '',
      message: '',
      messageType: 'info',
      loading: false,
      tracing: false,
    };
  },
  methods: {
    setMessage(msg, type = 'info') {
      this.message = msg;
      this.messageType = type;
    },
    formatDate(d) {
      if (!d) return 'N/A';
      return new Date(d).toLocaleString();
    },
    async loadTransactions() {
      this.loading = true;
      this.setMessage('');
      try {
        const token = localStorage.getItem('token');
        const resp = await axios.get('/api/transactions/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        this.transactions = resp.data.transactions || [];
      } catch (err) {
        this.setMessage(err.response?.data?.message || err.message, 'error');
      } finally {
        this.loading = false;
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
  },
  mounted() {
    this.loadTransactions();
  },
};
</script>

<style scoped>
.my-payments {
  padding: 20px;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
}
th, td {
  border: 1px solid #ddd;
  padding: 8px;
}
.messages .error { color: #c00; }
.messages .success { color: #090; }
</style>
