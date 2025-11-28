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
  <div class="user-management-container">
    <h2>Add New User</h2>
    <form @submit.prevent="addUser">
      <div class="form-group">
        <label for="username">Username:</label>
        <input
          type="text"
          id="username"
          v-model="username"
          required
          placeholder="Enter username"
        />
      </div>

      <div class="form-group">
        <label for="password">Password:</label>
        <input
          type="password"
          id="password"
          v-model="password"
          required
          placeholder="Enter password"
        />
      </div>

      <div class="form-group">
        <label for="role">Role:</label>
        <select id="role" v-model="role" required>
          <option disabled value="">Select role</option>
          <option value="admin">Admin</option>
          <option value="employee">Employee</option>
        </select>
      </div>

      <!-- Fields for employees -->
      <div v-if="role === 'employee'" class="form-group">
        <label for="employer">Employer:</label>
        <select id="employer" v-model="employerID" required>
          <option disabled value="">Select employer</option>
          <option v-for="employer in employers" :key="employer.id" :value="employer.id">
            {{ employer.name }}
          </option>
        </select>
      </div>

      <div v-if="role === 'employee'" class="form-group">
        <label for="payroll">Payroll Amount:</label>
        <input
          type="number"
          id="payroll"
          v-model.number="payrollAmount"
          min="0"
          step="0.01"
          required
          placeholder="Enter payroll amount"
        />
      </div>

      <button type="submit">Add User</button>
    </form>

    <h3>Existing Users</h3>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Username</th>
          <th>Role</th>
          <th>Employer</th>
          <th>Payroll Amount</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="user in users" :key="user.id">
          <td>{{ user.id }}</td>
          <td>{{ user.username }}</td>
          <td>{{ user.role }}</td>
          <td>{{ user.employerName || '-' }}</td>
          <td>{{ user.payrollAmount !== null ? user.payrollAmount.toFixed(2) : '-' }}</td>
          <td>
            <button @click="editUser(user)">Edit</button>
            <button @click="deleteUser(user.id)">Delete</button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Edit User Modal -->
    <div v-if="editingUser" class="modal">
      <div class="modal-content">
        <span class="close" @click="editingUser = null">&times;</span>
        <h3>Edit User</h3>
        <form @submit.prevent="updateUser">
          <div class="form-group">
            <label for="edit-username">Username:</label>
            <input
              type="text"
              id="edit-username"
              v-model="editingUser.username"
              required
            />
          </div>

          <div class="form-group">
            <label for="edit-password">Password:</label>
            <input
              type="password"
              id="edit-password"
              v-model="editingUser.password"
              placeholder="Leave blank to keep current password"
            />
          </div>

          <div class="form-group">
            <label for="edit-role">Role:</label>
            <select id="edit-role" v-model="editingUser.role" required>
              <option value="admin">Admin</option>
              <option value="employee">Employee</option>
            </select>
          </div>

          <!-- Employee-specific fields -->
          <div v-if="editingUser.role === 'employee'" class="form-group">
            <label for="edit-employer">Employer:</label>
            <select id="edit-employer" v-model="editingUser.employerID" required>
              <option v-for="employer in employers" :key="employer.id" :value="employer.id">
                {{ employer.name }}
              </option>
            </select>
          </div>

          <div v-if="editingUser.role === 'employee'" class="form-group">
            <label for="edit-payroll">Payroll Amount:</label>
            <input
              type="number"
              id="edit-payroll"
              v-model.number="editingUser.payrollAmount"
              min="0"
              step="0.01"
              required
            />
          </div>

          <button type="submit">Update User</button>
        </form>
      </div>
    </div>
  </div>
</template>

<script>
import axios from 'axios';

export default {
  name: 'UserManagement',
  data() {
    return {
      username: '',
      password: '',
      role: '',
      employerID: '',
      payrollAmount: null,
      users: [],
      employers: [],
      editingUser: null,
    };
  },
  created() {
    this.fetchUsers();
    this.fetchEmployers();
  },
  methods: {
    async fetchUsers() {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get('/api/users', {
          headers: { Authorization: `Bearer ${token}` },
        });

        this.users = response.data.users.map((user) => ({
          ...user,
          employerName: user.employerName || '-',
          payrollAmount: user.payrollAmount || 0,
          employerID: user.employerID || '',
        }));
      } catch (err) {
        console.error('Error fetching users:', err);
      }
    },
    async fetchEmployers() {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get('/api/employers', {
          headers: { Authorization: `Bearer ${token}` },
        });
        this.employers = response.data.employers;
      } catch (err) {
        console.error('Error fetching employers:', err);
      }
    },
    async addUser() {
      try {
        const token = localStorage.getItem('token');
        const payload = {
          username: this.username,
          password: this.password,
          role: this.role,
          employerID: this.role === 'employee' ? this.employerID : undefined,
          payrollAmount: this.role === 'employee' ? this.payrollAmount : undefined,
        };

        await axios.post('/api/users', payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        this.fetchUsers();
      } catch (err) {
        console.error('Error adding user:', err);
      }
    },
    async updateUser() {
      try {
        const token = localStorage.getItem('token');
        const payload = {
          username: this.editingUser.username,
          role: this.editingUser.role,
          employerID: this.editingUser.role === 'employee' ? this.editingUser.employerID : undefined,
          payrollAmount: this.editingUser.role === 'employee' ? this.editingUser.payrollAmount : undefined,
        };

        await axios.put(`/api/users/${this.editingUser.id}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        this.editingUser = null;
        this.fetchUsers();
      } catch (err) {
        console.error('Error updating user:', err);
      }
    },
    async deleteUser(userId) {
      try {
        const token = localStorage.getItem('token');
        await axios.delete(`/api/users/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        this.fetchUsers();
      } catch (err) {
        console.error('Error deleting user:', err);
      }
    },
    editUser(user) {
      this.editingUser = {
        ...user,
        employerID: user.employerID || '',
        payrollAmount: user.payrollAmount ?? null,
      };
    },
  },
};
</script>

<style scoped>
.user-management-container {
  max-width: 50%;
  margin: 50px auto;
  padding: 20px;
  border: 1px solid #ccc;
  border-radius: 8px;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 20px;
}

table th, table td {
  border: 1px solid #ccc;
  padding: 8px;
  text-align: left;
}

table th {
  background-color: #f9f9f9;
  font-weight: bold;
}

table td {
  word-wrap: break-word;
}

.user-management-container table {
  width: 100%;
}

.user-management-container h2,
.user-management-container h3 {
  text-align: center;
  color: #42b983;
}

.form-group {
  margin-bottom: 15px;
  max-width: 100%;
}

label {
  display: block;
  margin-bottom: 5px;
  font-weight: bold;
}

input,
select {
  width: 100%;
  padding: 8px;
  box-sizing: border-box;
  border: 1px solid #ccc;
  border-radius: 4px;
}

button {
  margin-right: 5px;
  padding: 8px 16px;
  background-color: #42b983;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

button:hover {
  background-color: #369870;
}

.success-message,
.error-message {
  margin-top: 15px;
  text-align: center;
}

.success-message {
  color: #28a745;
}

.error-message {
  color: #dc3545;
}

/* Modal Styles */
.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background-color: #fff;
  padding: 20px;
  border-radius: 8px;
  max-width: 100%;
  position: relative;
}

.close {
  position: absolute;
  top: 10px;
  right: 15px;
  font-size: 24px;
  font-weight: bold;
  cursor: pointer;
}

.modal-content h3 {
  margin-bottom: 20px;
}

.modal-content form .form-group {
  margin-bottom: 15px;
}

.modal-content form button {
  width: 100%;
}
</style>
