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
<!-- src/views/EmployeeProfile.vue -->
<template>
    <div class="employee-profile">
      <h2>My Profile</h2>
      
      <div class="profile-card">
        <p><strong>Username:</strong> {{ profile.username }}</p>
        <p><strong>Role:</strong> {{ profile.role }}</p>
      </div>

      <p class="hint">To update your wallet or password, use Account Settings in the header menu.</p>
      <div v-if="errorMessage" class="error-message">
        {{ errorMessage }}
      </div>
    </div>
  </template>

<script setup>
import { ref, onMounted } from 'vue';
import axios from 'axios';
import jwtDecode from 'jwt-decode';
import { useRouter } from 'vue-router';

// Reactive variables
const profile = ref({
  username: '',
  role: '',
  wallet_address: ''
});
const errorMessage = ref('');

const router = useRouter();

// Function to fetch current user profile
async function fetchProfile() {
  const token = localStorage.getItem('token');
  if (!token) {
    router.push({ name: 'Login' });
    return;
  }
  
  try {
    const decoded = jwtDecode(token);
    profile.value.username = decoded.username;
    profile.value.role = decoded.role;
    
    const response = await axios.get('/api/users/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (response.data.user) {
      profile.value.wallet_address = response.data.user.wallet_address || '';
    }
  } catch (error) {
    console.error('Error fetching profile:', error);
    errorMessage.value = 'Failed to load profile. Please try again.';
  }
}

// Fetch profile on component mount
onMounted(() => {
  fetchProfile();
});
</script>

<style scoped>
.employee-profile {
  max-width: 500px;
  margin: 0 auto;
  padding: 20px;
}

.employee-profile h2 {
  text-align: center;
  margin-bottom: 20px;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
}

.form-group input {
  width: 100%;
  padding: 8px;
  box-sizing: border-box;
}

button {
  padding: 10px 15px;
  background-color: #28a745;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
}

.success-message {
  margin-top: 20px;
  color: #28a745;
  text-align: center;
}

.error-message {
  margin-top: 20px;
  color: #dc3545;
  text-align: center;
}

.profile-card {
  border: 1px solid #ddd;
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 12px;
}

.hint {
  color: #666;
  margin-top: 10px;
  text-align: center;
}
</style>
