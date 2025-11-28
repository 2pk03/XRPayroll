<template>
    <div class="container">
      <header>
        <h1>Manage Trust Lines</h1>
      </header>
  
      <!-- Trust Line Table -->
      <section>
        <table v-if="trustLines.length">
          <thead>
            <tr>
              <th>Employee Name</th>
              <th>Wallet</th>
              <th>Trusted Wallets</th>
              <th>Trusts Issuer</th>
              <th>Limit</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="line in trustLines" :key="line.wallet_address">
              <td>{{ line.employee_name }}</td>
              <td>{{ line.wallet_address }}</td>
              <td>{{ line.trusted_wallets }}</td>
              <td>{{ line.trusts_issuer }}</td>
              <td>{{ line.limit }}</td>
              <td>
                <button @click="recheck(line)">Recheck</button>
                <button v-if="!line.trusts_issuer_bool" @click="createTrust(line)">Create Trust</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else>No trust lines found.</p>
      </section>

      <section class="info">
        <h4>Why “N/A” or “No”?</h4>
        <ul>
          <li>If Trusted Wallets shows “None”, the wallet has no trust lines yet.</li>
          <li>Trusts Issuer = No means no trust line to the issuer address; payments will fail until set.</li>
          <li>Next steps: ensure the employee wallet is activated/funded, then create a TrustSet from the employee wallet to the issuer.</li>
        </ul>
      </section>

    </div>
  </template>
  
  <script setup>
  import { ref, onMounted } from 'vue';
  import axios from 'axios';
  
  const trustLines = ref([]);
  
  // Load trust lines from the backend
  const loadTrustLines = async () => {
    try {
      const token = localStorage.getItem('token');
  
      console.log('Fetching employee trust lines with issuer wallet.');
  
      const response = await axios.get('/api/testnet/employees/trustlines', {
        headers: { Authorization: `Bearer ${token}` },
      });
  
      console.log('Trust lines response:', response.data);
  
      if (response.data.trustLines) {
        trustLines.value = response.data.trustLines.map((line) => ({
          employee_name: line.employee_name || 'Unknown',
          employee_id: line.employee_id,
          wallet_address: line.wallet_address || 'N/A',
          trusted_wallets: line.trusted_wallets && line.trusted_wallets.length
            ? line.trusted_wallets.map((wallet) => `${wallet.account}`).join(', ')
            : 'None (no trust lines)',
          trusts_issuer: line.trusts_issuer ? 'Yes' : 'No',
          trusts_issuer_bool: !!line.trusts_issuer,
          limit: line.trusts_issuer
            ? (line.trusted_wallets?.find(w => w.account === line.trusted_wallets?.issuer)?.limit || line.trusted_wallets?.[0]?.limit || 'N/A')
            : 'N/A (no issuer trust line)',
        }));
  
        console.log('Mapped trustLines:', trustLines.value);
      } else {
        console.warn('Unexpected API response:', response.data);
        alert('Unexpected response while loading trust lines. Please try again.');
      }
    } catch (error) {
      console.error('Error loading trust lines:', error.response?.data || error.message);
      alert('Failed to load trust lines. Please check the console for details.');
    }
  };
  
  // Recheck trust lines without mutation
  const recheck = () => {
    loadTrustLines().then(() => alert('Trust lines refreshed.'));
  };

  const createTrust = async (line) => {
    if (!line || !line.employee_id || !line.wallet_address) {
      alert('Employee record is missing ID or wallet.');
      return;
    }
    const confirmCreate = window.confirm(`Create trust line to issuer for ${line.employee_name}?`);
    if (!confirmCreate) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/testnet/trustlines/create/employee', {
        employeeID: line.employee_id,
        limit: '1000000',
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      alert('Trust line created. Rechecking status.');
      await loadTrustLines();
    } catch (error) {
      console.error('Error creating trust line:', error.response?.data || error.message);
      alert(error.response?.data?.message || 'Failed to create trust line.');
    }
  };
  
  onMounted(() => {
    loadTrustLines();
  });
  </script>
  
  <style scoped>
  .container {
    max-width: 80%;
    margin: 0 auto;
    font-family: Arial, sans-serif;
  }
  
  header {
    text-align: center;
    margin-bottom: 20px;
  }
  
  section {
    margin-bottom: 30px;
  }
  
  h2 {
    margin-bottom: 10px;
  }
  
  form div {
    margin-bottom: 10px;
  }
  
  button {
    margin-right: 10px;
    padding: 5px 10px;
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  
  button.danger {
    background-color: #dc3545;
  }
  
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 10px;
  }
  
  table th,
  table td {
    border: 1px solid #ddd;
    padding: 8px;
  }
  
table th {
  background-color: #f2f2f2;
}

.modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  justify-content: center;
  align-items: center;
}
.modal-content {
  background: #fff;
  padding: 16px;
  border-radius: 6px;
  max-width: 400px;
  width: 100%;
}
.modal-actions {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}
.hint {
  color: #666;
  font-size: 12px;
  margin-top: 8px;
}
.info {
  margin-top: 16px;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #f9fafc;
}
.info ul {
  margin: 6px 0 0 16px;
}
  </style>
  
