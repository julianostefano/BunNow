import { Elysia, t } from "elysia";
import { AuthService } from "../services/AuthService.pure";

// const authService = new AuthService();

export const authRoutes = new Elysia({ prefix: "/auth" })
  .post(
    "/login",
    async ({ body }) => {
      const { username, password } = body;
  return AuthService.login(username, password);
    },
    {
      body: t.Object({ username: t.String(), password: t.String() })
    }
  )
  .post(
    "/logout",
    async ({ headers }) => {
      const token = headers["authorization"] || "";
  return AuthService.logout(token);
    }
  );
