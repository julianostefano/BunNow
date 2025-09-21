/**
 * Login Page - Authentication Route
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from "elysia";
import { html } from "@elysiajs/html";
import { jwt } from "@elysiajs/jwt";
import { Layout } from "../../components/Layout";

// Login page component
const LoginPage = ({ error }: { error?: string }) => (
  <Layout title="Login - ServiceNow Analytics" showNavigation={false}>
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="mx-auto h-12 w-12 flex items-center justify-center bg-blue-600 rounded-lg">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              ></path>
            </svg>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to ServiceNow Analytics
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Monitor and analyze your ServiceNow data in real-time
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-red-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clip-rule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  Authentication Error
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{error}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <form
          className="mt-8 space-y-6"
          hx-post="/auth/login"
          hx-target="body"
          hx-indicator="#login-spinner"
        >
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="username" className="sr-only">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                className="relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="ServiceNow Username"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Password"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                type="checkbox"
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label
                htmlFor="remember-me"
                className="ml-2 block text-sm text-gray-900"
              >
                Remember me
              </label>
            </div>

            <div className="text-sm">
              <a
                href="#"
                className="font-medium text-blue-600 hover:text-blue-500"
              >
                Forgot your password?
              </a>
            </div>
          </div>

          <div>
            <button
              type="submit"
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                <svg
                  className="h-5 w-5 text-blue-500 group-hover:text-blue-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                    clip-rule="evenodd"
                  />
                </svg>
              </span>
              Sign in
            </button>
          </div>

          <div id="login-spinner" className="htmx-indicator">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-sm text-gray-600">
                Authenticating...
              </span>
            </div>
          </div>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-50 text-gray-500">
                Development Mode
              </span>
            </div>
          </div>

          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              Use any username/password combination for development
            </p>
          </div>
        </div>
      </div>
    </div>
  </Layout>
);

// Authentication service
class AuthService {
  private jwtSecret: string;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || "bunsnc-secret-key-2025";
  }

  async authenticate(
    username: string,
    password: string,
  ): Promise<{ success: boolean; error?: string; user?: any }> {
    // Development mode - accept any credentials
    if (process.env.NODE_ENV === "development" || true) {
      if (!username || !password) {
        return {
          success: false,
          error: "Username and password are required",
        };
      }

      // Simulate user data
      const user = {
        id: "user_" + Date.now(),
        username: username.toLowerCase(),
        name: username.charAt(0).toUpperCase() + username.slice(1),
        email: `${username.toLowerCase()}@company.com`,
        role: username.toLowerCase().includes("admin") ? "admin" : "user",
        permissions: ["read:incidents", "read:problems", "read:changes"],
        loginAt: new Date().toISOString(),
      };

      return {
        success: true,
        user,
      };
    }

    // Production ServiceNow authentication would go here
    return {
      success: false,
      error: "Authentication service not configured for production",
    };
  }

  generateToken(user: any): string {
    // In a real implementation, use a proper JWT library
    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
    };

    // Simple base64 encoding for development (use proper JWT in production)
    return btoa(JSON.stringify(payload));
  }

  validateToken(token: string): { valid: boolean; user?: any; error?: string } {
    try {
      const payload = JSON.parse(atob(token));

      if (payload.exp < Math.floor(Date.now() / 1000)) {
        return {
          valid: false,
          error: "Token expired",
        };
      }

      return {
        valid: true,
        user: payload,
      };
    } catch (error) {
      return {
        valid: false,
        error: "Invalid token format",
      };
    }
  }
}

const authService = new AuthService();

// Elysia route handlers
export default new Elysia({ prefix: "/auth" })
  .use(html())
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET || "bunsnc-secret-key-2025",
    }),
  )

  // Login page
  .get("/login", ({ query, cookie }) => {
    // Check if already logged in
    if (
      cookie.auth_token &&
      authService.validateToken(cookie.auth_token.value).valid
    ) {
      return new Response(null, {
        status: 302,
        headers: { Location: "/" },
      });
    }

    const error = query.error as string;
    return LoginPage({ error });
  })

  // Login handler
  .post("/login", async ({ body, cookie, set }) => {
    const { username, password } = body as {
      username: string;
      password: string;
    };

    const authResult = await authService.authenticate(username, password);

    if (!authResult.success) {
      set.status = 401;
      return LoginPage({ error: authResult.error });
    }

    // Generate and set authentication token
    const token = authService.generateToken(authResult.user);

    cookie.auth_token.set({
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    // Store user info for session
    cookie.user_info.set({
      value: btoa(JSON.stringify(authResult.user)),
      httpOnly: false, // Allow client-side access for UI
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60,
    });

    // Redirect to dashboard
    set.headers.location = "/";
    set.status = 302;

    return null;
  })

  // Logout handler
  .post("/logout", ({ cookie, set }) => {
    cookie.auth_token.remove();
    cookie.user_info.remove();

    set.headers.location = "/auth/login";
    set.status = 302;

    return null;
  })

  // Current user info
  .get("/me", ({ cookie, set }) => {
    const token = cookie.auth_token?.value;

    if (!token) {
      set.status = 401;
      return { error: "Not authenticated" };
    }

    const validation = authService.validateToken(token);

    if (!validation.valid) {
      set.status = 401;
      return { error: validation.error || "Invalid token" };
    }

    return {
      user: validation.user,
      authenticated: true,
    };
  })

  // Validate token endpoint
  .get("/validate", ({ cookie }) => {
    const token = cookie.auth_token?.value;

    if (!token) {
      return { valid: false, error: "No token provided" };
    }

    return authService.validateToken(token);
  });
