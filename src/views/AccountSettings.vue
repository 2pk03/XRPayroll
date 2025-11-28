<template>
  <div class="account-settings">
    <h2>Account Settings</h2>
    <p>Manage your account and wallet.</p>

    <section class="card">
      <h3>Profile</h3>
      <p><strong>Username:</strong> {{ profile.username }}</p>
      <p><strong>Role:</strong> {{ profile.role }}</p>
      <p v-if="profile.wallet_address"><strong>Wallet:</strong> {{ profile.wallet_address }}</p>
    </section>

    <section class="card">
      <h3>Change Password</h3>
      <form @submit.prevent="changePassword">
        <label>Current Password</label>
        <input type="password" v-model="passwordForm.currentPassword" required />
        <label>New Password</label>
        <input type="password" v-model="passwordForm.newPassword" required minlength="6" />
        <button type="submit" :disabled="savingPassword">Update Password</button>
      </form>
    </section>

    <section v-if="profile.role === 'employee'" class="card">
      <h3>Wallet</h3>
      <form @submit.prevent="updateWallet">
        <label>Wallet Address</label>
        <input
          type="text"
          v-model="walletForm.wallet_address"
          required
          minlength="25"
          :placeholder="'Enter XRPL classic address (r...)'"
          :disabled="profile.wallet_address"
        />
        <p class="hint">XRPL classic address required. Contact admin to reset once set.</p>
        <button type="submit" :disabled="savingWallet || profile.wallet_address">Update Wallet</button>
      </form>
    </section>

    <section class="messages" v-if="message">
      <p :class="messageType">{{ message }}</p>
    </section>
  </div>
</template>

<script>
import axios from 'axios';
import jwtDecode from 'jwt-decode';

export default {
  name: 'AccountSettings',
  data() {
    return {
      profile: {
        username: '',
        role: '',
        wallet_address: '',
      },
      passwordForm: {
        currentPassword: '',
        newPassword: '',
      },
      walletForm: {
        wallet_address: '',
      },
      message: '',
      messageType: 'info',
      savingPassword: false,
      savingWallet: false,
    };
  },
  methods: {
    setMessage(msg, type = 'info') {
      this.message = msg;
      this.messageType = type;
    },
    async loadProfile() {
      try {
        const token = localStorage.getItem('token');
        const resp = await axios.get('/api/users/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        this.profile = resp.data.user || this.profile;
        if (this.profile.wallet_address) {
          this.walletForm.wallet_address = this.profile.wallet_address;
        }
      } catch (err) {
        this.setMessage(err.response?.data?.message || err.message, 'error');
      }
    },
    async changePassword() {
      this.savingPassword = true;
      this.setMessage('');
      try {
        const token = localStorage.getItem('token');
        await axios.post(
          '/api/users/me/password',
          { currentPassword: this.passwordForm.currentPassword, newPassword: this.passwordForm.newPassword },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        this.setMessage('Password updated.', 'success');
        this.passwordForm.currentPassword = '';
        this.passwordForm.newPassword = '';
      } catch (err) {
        this.setMessage(err.response?.data?.message || err.message, 'error');
      } finally {
        this.savingPassword = false;
      }
    },
    async updateWallet() {
      this.savingWallet = true;
      this.setMessage('');
      try {
        const token = localStorage.getItem('token');
        const resp = await axios.put(
          '/api/users/me/wallet',
          { wallet_address: this.walletForm.wallet_address },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        this.setMessage(resp.data.message || 'Wallet updated.', 'success');
        await this.loadProfile();
      } catch (err) {
        this.setMessage(err.response?.data?.message || err.message, 'error');
      } finally {
        this.savingWallet = false;
      }
    },
    decodedRole() {
      const token = localStorage.getItem('token');
      if (!token) return '';
      try {
        const decoded = jwtDecode(token);
        return decoded.role || '';
      } catch (e) {
        console.error('Failed to decode token in AccountSettings:', e);
        return '';
      }
    },
  },
  computed: {
    isEmployee() {
      return this.decodedRole() === 'employee';
    },
  },
  mounted() {
    this.loadProfile();
  },
};
</script>

<style scoped>
.account-settings {
  padding: 20px;
  max-width: 600px;
}
.card {
  border: 1px solid #ddd;
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 16px;
}
form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
label {
  font-weight: bold;
}
input {
  padding: 8px;
}
button {
  padding: 10px 12px;
}
.messages .error { color: #c00; }
.messages .success { color: #090; }
</style>
