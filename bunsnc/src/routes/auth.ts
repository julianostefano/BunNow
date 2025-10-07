import { Elysia, t } from "elysia";
import { serviceNowAuthClient } from "../services";
import { serviceNowSAMLAuth } from "../services/auth/ServiceNowSAMLAuth";
import { SAMLConfig } from "../types/saml";
import { LoginRequest } from "../guards/shared.guards";

// const authService = new AuthService();

export const authRoutes = new Elysia({ prefix: "/auth" })
  // === Legacy Authentication Endpoints ===
  .use(LoginRequest)
  .post("/login", async ({ body }) => {
    const { username, password } = body;
    return await serviceNowAuthClient.authenticate(username, password);
  })
  .post("/logout", async ({ headers }) => {
    const token = headers["authorization"] || "";
    return await serviceNowAuthClient.logout();
  })

  // === SAML Authentication Endpoints ===
  .post(
    "/saml/login",
    async ({ body }) => {
      try {
        console.log("🔐 SAML login request received");

        const samlConfig: SAMLConfig = {
          username: body.username,
          password: body.password,
          baseUrl:
            body.baseUrl ||
            process.env.SERVICENOW_INSTANCE_URL ||
            "https://iberdrola.service-now.com",
          instance: body.instance || "iberdrola",
          proxy: body.proxy || process.env.SERVICENOW_PROXY,
        };

        const authData = await serviceNowSAMLAuth.authenticate(samlConfig);

        return {
          success: true,
          message: "SAML authentication successful",
          data: {
            sessionId: authData.sessionId,
            userToken: authData.userToken,
            createdAt: authData.createdAt,
            expiresAt: authData.expiresAt,
            validationStatus: authData.validationStatus,
            cookiesCount: authData.cookies.length,
            userAgent: authData.userAgent,
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        console.error("❌ SAML authentication failed:", error.message);

        return {
          success: false,
          error: "SAML authentication failed",
          message: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      body: t.Object({
        username: t.String({ description: "ServiceNow username" }),
        password: t.String({ description: "ServiceNow password" }),
        baseUrl: t.Optional(t.String({ description: "ServiceNow base URL" })),
        instance: t.Optional(
          t.String({ description: "ServiceNow instance name" }),
        ),
        proxy: t.Optional(t.String({ description: "Proxy URL" })),
      }),
      detail: {
        summary: "SAML Authentication",
        description: "Authenticate with ServiceNow using SAML/ADFS flow",
        tags: ["Authentication", "SAML"],
      },
    },
  )

  .post(
    "/saml/validate",
    async ({ body }) => {
      try {
        console.log("🔍 SAML validation request received");

        const samlConfig: SAMLConfig = {
          username: body.username,
          password: body.password,
          baseUrl:
            body.baseUrl ||
            process.env.SERVICENOW_INSTANCE_URL ||
            "https://iberdrola.service-now.com",
          instance: body.instance || "iberdrola",
          proxy: body.proxy || process.env.SERVICENOW_PROXY,
        };

        // Mock validation data - in production, this would come from storage
        const mockAuthData = {
          cookies: body.cookies || [],
          headers: body.headers || {},
          userToken: body.userToken,
          userAgent: body.userAgent,
          sessionId: body.sessionId,
          createdAt: new Date(body.createdAt || Date.now()),
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
          lastValidated: new Date(),
          validationStatus: "pending" as const,
        };

        const validationResult = await serviceNowSAMLAuth.validateAuth(
          samlConfig,
          mockAuthData,
        );

        return {
          success: true,
          isValid: validationResult.isValid,
          statusCode: validationResult.statusCode,
          responseUrl: validationResult.responseUrl,
          error: validationResult.error,
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        console.error("❌ SAML validation failed:", error.message);

        return {
          success: false,
          isValid: false,
          error: "SAML validation failed",
          message: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      body: t.Object({
        username: t.String({ description: "ServiceNow username" }),
        password: t.String({ description: "ServiceNow password" }),
        baseUrl: t.Optional(t.String({ description: "ServiceNow base URL" })),
        instance: t.Optional(
          t.String({ description: "ServiceNow instance name" }),
        ),
        proxy: t.Optional(t.String({ description: "Proxy URL" })),
        cookies: t.Optional(
          t.Array(
            t.Object({
              name: t.String(),
              value: t.String(),
              domain: t.Optional(t.String()),
              path: t.Optional(t.String()),
            }),
          ),
        ),
        headers: t.Optional(t.Record(t.String(), t.String())),
        userToken: t.Optional(t.String()),
        userAgent: t.Optional(t.String()),
        sessionId: t.Optional(t.String()),
        createdAt: t.Optional(t.String()),
        expiresAt: t.Optional(t.String()),
      }),
      detail: {
        summary: "SAML Validation",
        description: "Validate existing SAML authentication data",
        tags: ["Authentication", "SAML", "Validation"],
      },
    },
  )

  .get(
    "/saml/status",
    async () => {
      try {
        // Get auth core status
        const authType = serviceNowAuthClient.getAuthType?.() || "unknown";
        const isValid = serviceNowAuthClient.isAuthValid();

        let samlStatus = {};
        if (authType === "saml") {
          const samlAuthData = serviceNowAuthClient.getSAMLAuthData?.();
          samlStatus = {
            hasSAMLData: !!samlAuthData,
            sessionId: samlAuthData?.sessionId,
            userToken: samlAuthData?.userToken ? "present" : "missing",
            createdAt: samlAuthData?.createdAt,
            expiresAt: samlAuthData?.expiresAt,
            validationStatus: samlAuthData?.validationStatus,
            cookiesCount: samlAuthData?.cookies?.length || 0,
          };
        }

        return {
          success: true,
          authType,
          isAuthenticated: isValid,
          baseUrl: serviceNowAuthClient.getBaseUrl(),
          saml: samlStatus,
          environment: {
            authTypeConfig: process.env.SERVICENOW_AUTH_TYPE,
            instanceUrl: process.env.SERVICENOW_INSTANCE_URL,
            hasProxy: !!process.env.SERVICENOW_PROXY,
            hasCredentials: !!(
              process.env.SERVICENOW_USERNAME && process.env.SERVICENOW_PASSWORD
            ),
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        console.error("❌ Error getting SAML status:", error.message);

        return {
          success: false,
          error: "Failed to get SAML status",
          message: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      detail: {
        summary: "SAML Status",
        description: "Get current SAML authentication status and configuration",
        tags: ["Authentication", "SAML", "Status"],
      },
    },
  )

  .post(
    "/saml/test",
    async () => {
      try {
        console.log("🧪 SAML test authentication request received");

        // Use environment credentials for test
        const samlConfig: SAMLConfig = {
          username: process.env.SERVICENOW_USERNAME || "",
          password: process.env.SERVICENOW_PASSWORD || "",
          baseUrl:
            process.env.SERVICENOW_INSTANCE_URL ||
            "https://iberdrola.service-now.com",
          instance: "iberdrola",
          proxy: process.env.SERVICENOW_PROXY,
        };

        if (!samlConfig.username || !samlConfig.password) {
          return {
            success: false,
            error: "Test credentials not configured",
            message:
              "Set SERVICENOW_USERNAME and SERVICENOW_PASSWORD environment variables",
            timestamp: new Date().toISOString(),
          };
        }

        const startTime = Date.now();
        const authData = await serviceNowSAMLAuth.authenticate(samlConfig);
        const duration = Date.now() - startTime;

        return {
          success: true,
          message: "SAML test authentication successful",
          duration: `${duration}ms`,
          data: {
            sessionId: authData.sessionId,
            userToken: authData.userToken ? "present" : "missing",
            cookiesCount: authData.cookies.length,
            validationStatus: authData.validationStatus,
            userAgent: authData.userAgent,
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error: any) {
        console.error("❌ SAML test authentication failed:", error.message);

        return {
          success: false,
          error: "SAML test authentication failed",
          message: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      detail: {
        summary: "SAML Test",
        description: "Test SAML authentication with environment credentials",
        tags: ["Authentication", "SAML", "Test"],
      },
    },
  );
