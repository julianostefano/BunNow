/**
 * SAML Authentication Types
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

export interface SAMLConfig {
  username: string;
  password: string;
  baseUrl: string;
  instance: string;
  proxy?: string;
}

export interface CookieData {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: string;
}

export interface SAMLAuthenticationData {
  cookies: CookieData[];
  headers: Record<string, string>;
  userToken?: string;
  userAgent?: string;
  sessionId?: string;
  createdAt: Date;
  expiresAt?: Date;
  lastValidated?: Date;
  validationStatus: "valid" | "invalid" | "expired" | "pending";
}

export interface SAMLAuthenticationRecord {
  id?: string;
  config: SAMLConfig;
  authData?: SAMLAuthenticationData;
  status: "active" | "inactive" | "error" | "expired";
  errorCount: number;
  lastError?: string;
  lastErrorAt?: Date;
  lastAuthenticated?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SAMLAuthMetrics {
  totalAuthentications: number;
  successfulAuthentications: number;
  failedAuthentications: number;
  successRate: number;
  averageAuthTime: number;
  lastAuthenticationTime?: Date;
}

export interface SAMLConnectionStrategy {
  name: string;
  proxy?: string;
  description: string;
}

export interface SAMLFormData {
  [key: string]: string;
}

export interface SAMLRedirectInfo {
  url: string;
  method: "GET" | "POST";
  data?: SAMLFormData;
  proxy?: string;
}

export interface SAMLAuthError extends Error {
  code: string;
  details?: Record<string, unknown>;
  retry?: boolean;
}

export interface SAMLProxyConfig {
  http?: string;
  https?: string;
  noProxy?: string[];
}

export interface SAMLEnvironmentConfig {
  httpProxy?: string;
  httpsProxy?: string;
  noProxy?: string;
}

export interface SAMLValidationResult {
  isValid: boolean;
  statusCode?: number;
  error?: string;
  responseUrl?: string;
}

export interface SAMLDomainRule {
  domain: string;
  useProxy: boolean;
  description: string;
}

export const SAML_NO_PROXY_DOMAINS: string[] = [
  "ibfs.iberdrola.com",
  "corp.iberdrola.com",
  "neoenergia.com",
  "elektro.com.br",
];

export const SAML_CONNECTION_STRATEGIES: SAMLConnectionStrategy[] = [
  {
    name: "saml_smart_proxy",
    description: "Smart proxy selection per domain",
  },
  {
    name: "direct",
    proxy: undefined,
    description: "Direct connection fallback",
  },
];

export const SAML_TIMEOUTS = {
  DEFAULT: 900000, // 15 minutes (as specified by user)
  FORM_SUBMIT: 900000, // 15 minutes (as specified by user)
  VALIDATION: 900000, // 15 minutes (as specified by user)
} as const;

export const SAML_HTTP_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Accept-Encoding": "gzip, deflate",
  DNT: "1",
  Connection: "keep-alive",
  "Upgrade-Insecure-Requests": "1",
} as const;
