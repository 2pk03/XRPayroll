// router/index.js

import { createRouter, createWebHistory } from 'vue-router';
import jwtDecode from "jwt-decode";
import HomePage from '../views/HomePage.vue';
import UserManagement from '../components/UserManagement.vue';
import LoginPage from '../components/LoginPage.vue';
import NotFound from '../views/NotFound.vue';
import XRPayroll from '../XRPayroll.vue';
import EmployeeProfile from '../views/EmployeeProfile.vue';
import ManageTrustLines from '../components/ManageTrustLines.vue';
import Payments from '../views/Payments.vue';
import MyPayments from '../views/MyPayments.vue';
import Settings from '../views/Settings.vue';
import AccountSettings from '../views/AccountSettings.vue';

// Log the jwtDecode to verify it's correctly imported

const routes = [
  {
    path: '/',
    component: XRPayroll,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Home',
        component: HomePage,
        meta: { requiresAuth: true }
      },
      {
        path: 'account',
        name: 'AccountSettings',
        component: AccountSettings,
        meta: { requiresAuth: true },
      },
      {
        path: 'profile',
        name: 'EmployeeProfile',
        component: EmployeeProfile,
        meta: { requiresAuth: true, role: 'employee' }
      },      
      {
        path: 'user-management',
        name: 'UserManagement',
        component: UserManagement,
        meta: { requiresAuth: true, role: 'admin' },
      },
      {
        path: 'trustlines',
        name: 'ManageTrustLines',
        component: ManageTrustLines,
        meta: { requiresAuth: true, adminOnly: true },
      },
      {
        path: 'payments',
        name: 'Payments',
        component: Payments,
        meta: { requiresAuth: true, role: 'admin' },
      },     
      {
        path: 'settings',
        name: 'Settings',
        component: Settings,
        meta: { requiresAuth: true, role: 'admin' },
      },
      {
        path: 'my-payments',
        name: 'MyPayments',
        component: MyPayments,
        meta: { requiresAuth: true, role: 'employee' },
      },
    ],
  },
  {
    path: '/login',
    name: 'Login',
    component: LoginPage,
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: NotFound,
  },
];

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes,
});

// Navigation Guard to Protect Routes
router.beforeEach((to, from, next) => {
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth);
  const requiredRole = to.meta.role;
  const token = localStorage.getItem('token');

  if (requiresAuth) {
    if (!token) {
      next({ name: 'Login' });
    } else {
      try {
        // Decode the token to get user info
        const decoded = jwtDecode(token);

        // Check token expiration
        const currentTime = Date.now() / 1000;
        if (decoded.exp && decoded.exp < currentTime) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          next({ name: 'Login' });
          return;
        }

        if (requiredRole && decoded.role !== requiredRole) {
          next({ name: 'Home' });
        } else {
          next(); // User is authorized
        }
      } catch (err) {
        console.error('Error decoding token:', err.message);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        next({ name: 'Login' });
      }
    }
  } else {
    next(); // Route does not require authentication
  }
});

export default router;
