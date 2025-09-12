import { Elysia, t } from "elysia";
import { serviceNowAuthClient } from "../services/ServiceNowAuthClient";

// const authService = new AuthService();

export const authRoutes = new Elysia({ prefix: "/auth" })
  .post(
    "/login",
    async ({ body }) => {
      const { username, password } = body;
  return await serviceNowAuthClient.authenticate(username, password);
    },
    {
      body: t.Object({ username: t.String(), password: t.String() })
    }
  )
  .post(
    "/logout",
    async ({ headers }) => {
      const token = headers["authorization"] || "";
  return await serviceNowAuthClient.logout();
    }
  );
