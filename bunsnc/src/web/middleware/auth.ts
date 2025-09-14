/**
 * Authentication Middleware - JWT and Session Management
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from "elysia";

interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  loginAt: string;
}

// Authentication middleware
export const authMiddleware = new Elysia({ name: 'auth-middleware' })
  .derive(({ cookie }) => {
    return {
      // Helper to get current user from cookie
      getCurrentUser(): User | null {
        try {
          const userInfo = cookie.user_info?.value;
          if (!userInfo) return null;

          return JSON.parse(atob(userInfo)) as User;
        } catch {
          return null;
        }
      },

      // Helper to check if user is authenticated
      isAuthenticated(): boolean {
        const token = cookie.auth_token?.value;
        const user = this.getCurrentUser();
        return !!(token && user);
      },

      // Helper to check user permissions
      hasPermission(permission: string): boolean {
        const user = this.getCurrentUser();
        return user?.permissions?.includes(permission) || user?.role === 'admin' || false;
      }
    };
  })

  .macro(({ onBeforeHandle }) => ({
    // Macro to require authentication
    requireAuth(enabled: boolean = true) {
      if (!enabled) return;

      onBeforeHandle(({ getCurrentUser, set }) => {
        const user = getCurrentUser();

        if (!user) {
          set.status = 302;
          set.headers.location = "/auth/login?error=Authentication required";
          return null;
        }
      });
    },

    // Macro to require specific permissions
    requirePermission(permission: string) {
      onBeforeHandle(({ hasPermission, set }) => {
        if (!hasPermission(permission)) {
          set.status = 403;
          return {
            error: "Insufficient permissions",
            required: permission,
            timestamp: new Date().toISOString()
          };
        }
      });
    },

    // Macro to require admin role
    requireAdmin() {
      onBeforeHandle(({ getCurrentUser, set }) => {
        const user = getCurrentUser();

        if (!user || user.role !== 'admin') {
          set.status = 403;
          return {
            error: "Admin access required",
            timestamp: new Date().toISOString()
          };
        }
      });
    }
  }));

// Protected route wrapper
export const protectedRoute = new Elysia({ name: 'protected-route' })
  .use(authMiddleware)
  .requireAuth();

// Admin route wrapper
export const adminRoute = new Elysia({ name: 'admin-route' })
  .use(authMiddleware)
  .requireAuth()
  .requireAdmin();

// Permission-based route wrapper
export const permissionRoute = (permission: string) =>
  new Elysia({ name: `permission-route-${permission}` })
    .use(authMiddleware)
    .requireAuth()
    .requirePermission(permission);

export default authMiddleware;