<!-- src/components/LoginPage.vue -->
<template>
  <div class="login-container">
    <h2>Login</h2>
    <form @submit.prevent="login">
      <div class="form-group">
        <label for="username">Username:</label>
        <input
          type="text"
          id="username"
          v-model="username"
          required
          placeholder="Enter your username"
        />
      </div>

      <div class="form-group">
        <label for="password">Password:</label>
        <input
          type="password"
          id="password"
          v-model="password"
          required
          placeholder="Enter your password"
        />
      </div>

      <button type="submit" :disabled="loading">
        {{ loading ? 'Logging in...' : 'Login' }}
      </button>
    </form>

    <div v-if="error" class="error-message">
      <p>{{ errorMessage }}</p>
      <pre v-if="errorDetails">{{ errorDetails }}</pre>
    </div>
  </div>
</template>

<script>
import axios from 'axios';

export default {
  name: 'LoginPage',
  data() {
    return {
      username: '',
      password: '',
      error: false,
      errorMessage: '',
      errorDetails: null,
      loading: false,
    };
  },
  methods: {
    async login() {
      this.error = false;
      this.errorMessage = '';
      this.errorDetails = null;
      this.loading = true;

      try {
        console.log('Attempting to log in with:', {
          username: this.username,
          password: this.password,
        });

        const response = await axios.post('/api/auth/login', {
          username: this.username,
          password: this.password,
        });

        // Assuming the backend returns a JWT token
        const token = response.data.token;
        if (token) {
          localStorage.setItem('token', token);

          // Decode token to store user info
          try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            localStorage.setItem(
              'user',
              JSON.stringify({
                username: payload.username,
                role: payload.role,
              })
            );
            console.log(
              'User info stored in localStorage:',
              payload.username,
              payload.role
            );
          } catch (decodeError) {
            console.error(
              'Error decoding token payload:',
              decodeError.message
            );
            this.error = true;
            this.errorMessage = 'Failed to decode authentication token.';
            return;
          }

          // Redirect to Home after successful login
          this.$router.replace({ name: 'Home' }).catch(() => {});
        } else {
          this.error = true;
          this.errorMessage = 'No token received from server.';
        }
      } catch (err) {
        this.error = true;
        if (err.response) {
          // Server responded with a status other than 2xx
          this.errorMessage =
            err.response.data.message || 'Login failed.';
          this.errorDetails = JSON.stringify(
            err.response.data,
            null,
            2
          );
          console.error('Login failed with response:', err.response);
        } else if (err.request) {
          // Request was made but no response received
          this.errorMessage = 'No response from server.';
          this.errorDetails = err.request;
          console.error('No response received:', err.request);
        } else {
          // Something happened in setting up the request
          this.errorMessage = 'Error setting up the request.';
          this.errorDetails = err.message;
          console.error('Error setting up request:', err.message);
        }
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.login-container {
  max-width: 400px;
  margin: 100px auto;
  padding: 20px;
  border: 1px solid #ccc;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.login-container h2 {
  text-align: center;
  color: #42b983;
}

.form-group {
  margin-bottom: 15px;
}

label {
  display: block;
  margin-bottom: 5px;
}

input {
  width: 100%;
  padding: 8px;
  box-sizing: border-box;
  border: 1px solid #ccc;
  border-radius: 4px;
}

button {
  width: 100%;
  padding: 10px;
  background-color: #42b983;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
}

button:hover {
  background-color: #369870;
}

.error-message {
  margin-top: 15px;
  color: #dc3545;
  text-align: center;
}

.error-message pre {
  background-color: #f8d7da;
  padding: 10px;
  border-radius: 4px;
  overflow-x: auto;
  text-align: left;
  margin-top: 10px;
}
</style>
