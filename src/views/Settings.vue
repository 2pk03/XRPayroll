<template>
  <div class="settings">
    <h2>Admin Settings</h2>
    <section class="employers">
      <header class="section-header">
        <div>
          <h3>Employers</h3>
          <p>Manage employer records used by user management.</p>
        </div>
        <button @click="loadEmployers" :disabled="loading">Refresh</button>
      </header>

      <form class="employer-form" @submit.prevent="saveEmployer">
        <div>
          <label>Name</label>
          <input v-model="form.name" required />
        </div>
        <div class="actions">
          <button type="submit" :disabled="saving">{{ form.id ? 'Update' : 'Add' }} Employer</button>
          <button type="button" @click="resetForm" :disabled="saving">Clear</button>
        </div>
      </form>

      <table v-if="employers.length">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="emp in employers" :key="emp.id">
            <td>{{ emp.id }}</td>
            <td>{{ emp.name }}</td>
            <td class="table-actions">
              <button @click="editEmployer(emp)">Edit</button>
              <button @click="deleteEmployer(emp.id)" :disabled="saving">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else>No employers found.</p>
    </section>

    <section class="messages" v-if="message">
      <p :class="messageType">{{ message }}</p>
    </section>
  </div>
</template>

<script>
import axios from 'axios';

export default {
  name: 'AdminSettings',
  data() {
    return {
      employers: [],
      loading: false,
      saving: false,
      message: '',
      messageType: 'info',
      form: {
        id: null,
        name: '',
      },
    };
  },
  methods: {
    setMessage(msg, type = 'info') {
      this.message = msg;
      this.messageType = type;
    },
    tokenHeader() {
      const token = localStorage.getItem('token');
      return { Authorization: `Bearer ${token}` };
    },
    async loadEmployers() {
      this.loading = true;
      this.setMessage('');
      try {
        const resp = await axios.get('/api/employers', {
          headers: this.tokenHeader(),
        });
        this.employers = resp.data.employers || [];
      } catch (err) {
        this.setMessage(err.response?.data?.message || err.message, 'error');
      } finally {
        this.loading = false;
      }
    },
    resetForm() {
      this.form = { id: null, name: '' };
    },
    editEmployer(emp) {
      this.form = { id: emp.id, name: emp.name };
    },
    async saveEmployer() {
      this.saving = true;
      this.setMessage('');
      const payload = { name: this.form.name };
      const headers = { headers: this.tokenHeader() };
      try {
        if (this.form.id) {
          await axios.put(`/api/employers/${this.form.id}`, payload, headers);
          this.setMessage('Employer updated.', 'success');
        } else {
          await axios.post('/api/employers', payload, headers);
          this.setMessage('Employer created.', 'success');
        }
        this.resetForm();
        await this.loadEmployers();
      } catch (err) {
        this.setMessage(err.response?.data?.message || err.message, 'error');
      } finally {
        this.saving = false;
      }
    },
    async deleteEmployer(id) {
      if (!confirm('Delete employer?')) return;
      this.saving = true;
      this.setMessage('');
      try {
        await axios.delete(`/api/employers/${id}`, { headers: this.tokenHeader() });
        this.setMessage('Employer deleted.', 'success');
        await this.loadEmployers();
      } catch (err) {
        this.setMessage(err.response?.data?.message || err.message, 'error');
      } finally {
        this.saving = false;
      }
    },
  },
  mounted() {
    this.loadEmployers();
  },
};
</script>

<style scoped>
.settings {
  padding: 20px;
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.employer-form {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  margin: 12px 0;
}
.employer-form input {
  padding: 6px;
}
.actions {
  display: flex;
  gap: 8px;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th, td {
  border: 1px solid #ddd;
  padding: 8px;
}
.table-actions button {
  margin-right: 6px;
}
.messages .error { color: #c00; }
.messages .success { color: #090; }
</style>
