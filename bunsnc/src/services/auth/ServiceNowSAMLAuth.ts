/**
 * ServiceNow SAML Authentication Service
 * Adapted from Python saml_auth.py to TypeScript
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import {
  SAMLConfig,
  SAMLAuthenticationData,
  SAMLConnectionStrategy,
  SAMLFormData,
  SAMLValidationResult,
  SAML_NO_PROXY_DOMAINS,
  SAML_CONNECTION_STRATEGIES,
  SAML_TIMEOUTS,
  SAML_HTTP_HEADERS,
  CookieData
} from '../../types/saml';
import { samlConfigManager } from './SAMLConfigManager';

interface BunFetchOptions {
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit;
  redirect?: RequestRedirect;
  signal?: AbortSignal;
  timeout?: number;
  proxy?: string;
}

export class ServiceNowSAMLAuth {
  private startTime?: Date;
  private storageInitialized = false;

  constructor() {
    this.startTime = undefined;
    this.initializeStorage();
  }

  /**
   * Initialize MongoDB storage connection
   */
  private async initializeStorage(): Promise<void> {
    if (this.storageInitialized) return;

    try {
      // SAMLConfigManager uses existing MongoDB infrastructure, no need to connect
      this.storageInitialized = true;
      console.log('✅ SAML authentication storage initialized (using existing MongoDB)');
    } catch (error) {
      console.error('❌ Failed to initialize SAML storage:', error);
    }
  }

  /**
   * Determine if URL should use proxy based on domain rules
   * Returns proxy URL to use, or undefined for direct connection
   */
  private shouldUseProxy(url: string, configProxy?: string): string | undefined {
    // Check environment variables first
    const envProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    const proxy = configProxy || envProxy;

    if (!proxy) return undefined;

    // Check NO_PROXY environment variable
    const noProxy = process.env.NO_PROXY;
    if (noProxy) {
      const noProxyDomains = noProxy.split(',').map(d => d.trim());
      try {
        const urlObj = new URL(url);
        for (const domain of noProxyDomains) {
          if (urlObj.hostname.includes(domain) || domain === '*') {
            console.log(`Domain excluded by NO_PROXY: ${url} (${domain})`);
            return undefined;
          }
        }
      } catch (error) {
        console.error('Error parsing URL for NO_PROXY check:', error);
      }
    }

    try {
      const urlObj = new URL(url);

      // Check hardcoded no-proxy domains (SAML/ADFS servers)
      for (const domain of SAML_NO_PROXY_DOMAINS) {
        if (urlObj.hostname.includes(domain)) {
          console.log(`Domain should not use proxy: ${url} (${domain})`);
          return undefined;
        }
      }

      console.log(`Domain should use proxy: ${url} (${proxy})`);
      return proxy;
    } catch (error) {
      console.error('Error parsing URL for proxy decision:', error);
      return undefined;
    }
  }

  /**
   * Convert relative URLs to absolute
   */
  private makeAbsoluteUrl(url: string, baseResponse: Response): string {
    if (url.startsWith('/')) {
      const baseUrl = new URL(baseResponse.url);
      const absolute = `${baseUrl.protocol}//${baseUrl.host}${url}`;
      console.log(`Converted relative to absolute URL: ${url} -> ${absolute}`);
      return absolute;
    } else if (!url.startsWith('http')) {
      const base = baseResponse.url.substring(0, baseResponse.url.lastIndexOf('/'));
      const absolute = `${base}/${url}`;
      console.log(`Converted relative to absolute URL: ${url} -> ${absolute}`);
      return absolute;
    }
    return url;
  }

  /**
   * Custom fetch with timeout and proxy support using Bun's native proxy
   */
  private async fetchWithOptions(url: string, options: BunFetchOptions = {}, configProxy?: string): Promise<Response> {
    const { timeout = SAML_TIMEOUTS.DEFAULT, proxy: optionsProxy, ...fetchOptions } = options;

    // Determine proxy to use
    const proxyUrl = this.shouldUseProxy(url, optionsProxy || configProxy);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Build fetch configuration with proper proxy support
      const fetchConfig: BunFetchOptions = {
        ...fetchOptions,
        signal: controller.signal,
        ...(proxyUrl && { proxy: proxyUrl })
      };

      console.log(`Fetching ${url}`, {
        method: fetchConfig.method || 'GET',
        proxy: proxyUrl || 'direct',
        headers: Object.keys(fetchConfig.headers || {})
      });

      const response = await fetch(url, fetchConfig as RequestInit);
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Main SAML authentication method with MongoDB persistence
   */
  async authenticate(config: SAMLConfig): Promise<SAMLAuthenticationData> {
    this.startTime = new Date();

    console.log('Starting SAML authentication', {
      username: config.username,
      instance: config.instance,
      baseUrl: config.baseUrl,
      proxy: config.proxy
    });

    // Ensure storage is initialized
    await this.initializeStorage();

    // Save configuration to MongoDB
    try {
      await samlConfigManager.saveConfig(config);
    } catch (error) {
      console.warn('Failed to save SAML config to MongoDB:', error);
    }

    const initialUrl = `${config.baseUrl}/nav_to.do`;

    // Try multiple connection strategies
    let lastError: Error | null = null;

    for (const strategy of SAML_CONNECTION_STRATEGIES) {
      try {
        console.log(`Attempting SAML authentication with ${strategy.name} strategy`);

        // Step 1: Navigate to ServiceNow and capture SAML redirect
        console.log('Step 1: Navigating to ServiceNow', { url: initialUrl });

        const response = await this.fetchWithOptions(initialUrl, {
          method: 'GET',
          headers: SAML_HTTP_HEADERS,
          redirect: 'manual' // Handle redirects manually
        }, config.proxy);

        console.log('Initial response', {
          status: response.status,
          url: response.url
        });

        // Follow redirects manually to capture SAML request
        let currentResponse = response;
        let redirectCount = 0;
        let samlRequestUrl: string | null = null;

        while (currentResponse.status >= 300 && currentResponse.status < 400 && redirectCount < 10) {
          redirectCount++;
          const location = currentResponse.headers.get('location');
          if (!location) break;

          // Convert to absolute URL
          const absoluteLocation = this.makeAbsoluteUrl(location, currentResponse);

          console.log(`Following redirect ${redirectCount}`, { location: absoluteLocation });

          // Check if this is SAML/ADFS redirect
          if (absoluteLocation.toLowerCase().includes('adfs') ||
              absoluteLocation.toLowerCase().includes('saml')) {
            samlRequestUrl = absoluteLocation;
            console.log('Found SAML/ADFS redirect', { url: absoluteLocation });
          }

          currentResponse = await this.fetchWithOptions(absoluteLocation, {
            method: 'GET',
            headers: SAML_HTTP_HEADERS,
            redirect: 'manual'
          }, config.proxy);

          console.log(`Redirect ${redirectCount} response`, {
            status: currentResponse.status,
            url: currentResponse.url
          });
        }

        // Determine the authentication flow
        if (samlRequestUrl || currentResponse.url.toLowerCase().includes('adfs')) {
          console.log('Proceeding with SAML authentication flow');
          return await this.handleSAMLFlow(currentResponse, config);
        } else if (currentResponse.url.includes('service-now.com')) {
          console.log('Direct ServiceNow login detected');
          return await this.handleDirectLogin(currentResponse, config);
        } else {
          throw new Error(`Unexpected redirect target: ${currentResponse.url}`);
        }

      } catch (error) {
        console.error(`SAML authentication failed with ${strategy.name}:`, error);
        lastError = error instanceof Error ? error : new Error(String(error));
        continue;
      }
    }

    // If all strategies failed
    if (lastError) {
      const duration = this.startTime ? new Date().getTime() - this.startTime.getTime() : 0;
      console.error('All SAML authentication strategies failed', {
        lastError: lastError.message,
        durationMs: duration
      });

      // Mark error in MongoDB
      try {
        await samlConfigManager.markError(config.instance, lastError.message);
      } catch (error) {
        console.warn('Failed to mark SAML error in MongoDB:', error);
      }

      throw new Error(`SAML authentication failed: ${lastError.message}`);
    } else {
      throw new Error('SAML authentication failed: No strategies attempted');
    }
  }

  /**
   * Handle SAML/ADFS authentication flow
   */
  private async handleSAMLFlow(response: Response, config: SAMLConfig): Promise<SAMLAuthenticationData> {
    console.log('Starting SAML/ADFS flow');

    const htmlText = await response.text();

    // Parse HTML to find form (basic parsing without external libraries)
    const formMatch = htmlText.match(/<form[^>]*>([\s\S]*?)<\/form>/i);
    if (!formMatch) {
      throw new Error('Could not find login form in ADFS page');
    }

    const formContent = formMatch[1];

    // Extract form action
    const actionMatch = htmlText.match(/<form[^>]*action=["']([^"']+)["']/i);
    if (!actionMatch) {
      throw new Error('Could not find form action in ADFS page');
    }

    let formAction = actionMatch[1];

    // Make form action absolute
    if (formAction.startsWith('/')) {
      const baseUrl = new URL(response.url);
      formAction = `${baseUrl.protocol}//${baseUrl.host}${formAction}`;
    } else if (!formAction.startsWith('http')) {
      const base = response.url.substring(0, response.url.lastIndexOf('/'));
      formAction = `${base}/${formAction}`;
    }

    console.log('Found ADFS form', { action: formAction });

    // Prepare form data
    const formData: SAMLFormData = {};

    // Extract hidden fields
    const hiddenInputs = formContent.match(/<input[^>]*type=["']hidden["'][^>]*>/gi) || [];
    for (const hiddenInput of hiddenInputs) {
      const nameMatch = hiddenInput.match(/name=["']([^"']+)["']/i);
      const valueMatch = hiddenInput.match(/value=["']([^"']*)["']/i);

      if (nameMatch) {
        const name = nameMatch[1];
        const value = valueMatch ? valueMatch[1] : '';
        formData[name] = value;
      }
    }

    // Find credential fields
    const allInputs = formContent.match(/<input[^>]*>/gi) || [];
    for (const input of allInputs) {
      const nameMatch = input.match(/name=["']([^"']+)["']/i);
      const typeMatch = input.match(/type=["']([^"']+)["']/i);

      if (nameMatch && typeMatch) {
        const name = nameMatch[1];
        const type = typeMatch[1].toLowerCase();
        const nameLower = name.toLowerCase();

        if (type === 'text' || type === 'email' || nameLower.includes('user')) {
          formData[name] = config.username;
          console.log('Found username field', { field: name });
        } else if (type === 'password' || nameLower.includes('pass')) {
          formData[name] = config.password;
          console.log('Found password field', { field: name });
        }
      }
    }

    console.log('Submitting ADFS credentials', {
      formAction,
      fields: Object.keys(formData)
    });

    // Submit ADFS form
    const formResponse = await this.fetchWithOptions(formAction, {
      method: 'POST',
      headers: {
        ...SAML_HTTP_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(formData),
      redirect: 'manual'
    }, config.proxy);

    console.log('ADFS form submitted', {
      status: formResponse.status
    });

    // Follow SAML response back to ServiceNow
    let currentResponse = formResponse;
    let redirectCount = 0;

    while (currentResponse.status >= 300 && currentResponse.status < 400 && redirectCount < 10) {
      redirectCount++;
      const location = currentResponse.headers.get('location');
      if (!location) break;

      const absoluteLocation = this.makeAbsoluteUrl(location, currentResponse);
      console.log(`Following SAML redirect ${redirectCount}`, { location: absoluteLocation });

      currentResponse = await this.fetchWithOptions(absoluteLocation, {
        method: 'GET',
        headers: SAML_HTTP_HEADERS,
        redirect: 'manual'
      }, config.proxy);

      // Check if we're back on ServiceNow
      if (currentResponse.url.includes('service-now.com')) {
        console.log('Successfully returned to ServiceNow', { url: currentResponse.url });
        break;
      }
    }

    return await this.extractAuthData(currentResponse, config);
  }

  /**
   * Handle direct ServiceNow login (fallback)
   */
  private async handleDirectLogin(response: Response, config: SAMLConfig): Promise<SAMLAuthenticationData> {
    console.log('Starting direct ServiceNow login');

    const htmlText = await response.text();

    // Find login form
    const formMatch = htmlText.match(/<form[^>]*>([\s\S]*?)<\/form>/i);
    if (!formMatch) {
      throw new Error('Could not find login form in ServiceNow page');
    }

    // Extract form action
    const actionMatch = htmlText.match(/<form[^>]*action=["']([^"']+)["']/i);
    let formAction = actionMatch ? actionMatch[1] : '/login.do';

    if (formAction.startsWith('/')) {
      formAction = `${config.baseUrl}${formAction}`;
    }

    // Prepare form data
    const formData: SAMLFormData = {};

    // Extract hidden fields
    const hiddenInputs = htmlText.match(/<input[^>]*type=["']hidden["'][^>]*>/gi) || [];
    for (const hiddenInput of hiddenInputs) {
      const nameMatch = hiddenInput.match(/name=["']([^"']+)["']/i);
      const valueMatch = hiddenInput.match(/value=["']([^"']*)["']/i);

      if (nameMatch) {
        const name = nameMatch[1];
        const value = valueMatch ? valueMatch[1] : '';
        formData[name] = value;
      }
    }

    // Add standard ServiceNow credentials
    formData['user_name'] = config.username;
    formData['user_password'] = config.password;

    console.log('Submitting direct ServiceNow credentials');

    // Submit login form
    const loginResponse = await this.fetchWithOptions(formAction, {
      method: 'POST',
      headers: {
        ...SAML_HTTP_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(formData),
      redirect: 'follow'
    }, config.proxy);

    console.log('Direct login submitted', { status: loginResponse.status });

    return await this.extractAuthData(loginResponse, config);
  }

  /**
   * Extract authentication data from successful login
   */
  private async extractAuthData(response: Response, config: SAMLConfig): Promise<SAMLAuthenticationData> {
    console.log('Extracting authentication data', { url: response.url });

    // Extract cookies (simplified - would need more robust cookie parsing)
    const cookies: CookieData[] = [];
    const cookieHeader = response.headers.get('set-cookie');
    if (cookieHeader) {
      // Basic cookie parsing - in production should use a proper cookie parser
      const cookieStrings = cookieHeader.split(',');
      for (const cookieStr of cookieStrings) {
        const [nameValue] = cookieStr.split(';');
        const [name, value] = nameValue.split('=');
        if (name && value) {
          cookies.push({
            name: name.trim(),
            value: value.trim(),
            domain: new URL(response.url).hostname,
            path: '/',
            secure: response.url.startsWith('https'),
            httpOnly: true
          });
        }
      }
    }

    // Extract headers
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Look for user token in response
    let userToken: string | undefined;
    const htmlText = await response.text();
    const tokenMatch = htmlText.match(/g_ck\s*=\s*["']([^"']+)["']/);
    if (tokenMatch) {
      userToken = tokenMatch[1];
    }

    // Extract session ID from cookies
    let sessionId: string | undefined;
    for (const cookie of cookies) {
      if (cookie.name.toUpperCase() === 'JSESSIONID') {
        sessionId = cookie.value;
        break;
      }
    }

    const now = new Date();
    const authData: SAMLAuthenticationData = {
      cookies,
      headers,
      userToken,
      userAgent: SAML_HTTP_HEADERS['User-Agent'],
      sessionId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 8 * 60 * 60 * 1000), // 8 hours
      lastValidated: now,
      validationStatus: 'valid'
    };

    const duration = this.startTime ? new Date().getTime() - this.startTime.getTime() : 0;
    console.log('SAML authentication completed successfully', {
      durationMs: duration,
      cookiesCount: cookies.length,
      headersCount: Object.keys(headers).length,
      hasUserToken: !!userToken
    });

    // Save authentication data to MongoDB
    try {
      await samlConfigManager.saveAuthData(config.instance, authData);
      console.log('✅ SAML authentication data saved to MongoDB');
    } catch (error) {
      console.error('❌ Failed to save SAML auth data to MongoDB:', error);
    }

    return authData;
  }

  /**
   * Get stored authentication data from MongoDB
   */
  async getStoredAuthData(instance?: string): Promise<SAMLAuthenticationData | null> {
    await this.initializeStorage();
    return await samlConfigManager.getAuthData(instance);
  }

  /**
   * Get stored configuration from MongoDB
   */
  async getStoredConfig(instance?: string): Promise<SAMLConfig | null> {
    await this.initializeStorage();
    return await samlConfigManager.getConfig(instance);
  }

  /**
   * Validate existing authentication data
   */
  async validateAuth(config: SAMLConfig, authData: SAMLAuthenticationData): Promise<SAMLValidationResult> {
    try {
      // Test access to a protected ServiceNow page
      const testUrl = `${config.baseUrl}/sys_user.do?JSON&sysparm_action=getKeys&sysparm_max=1`;

      // Build cookie header
      const cookieHeader = authData.cookies
        .map(cookie => `${cookie.name}=${cookie.value}`)
        .join('; ');

      const response = await this.fetchWithOptions(testUrl, {
        method: 'GET',
        headers: {
          ...SAML_HTTP_HEADERS,
          'Cookie': cookieHeader
        },
        timeout: SAML_TIMEOUTS.VALIDATION
      }, config.proxy);

      // Check if we get a valid response (not redirected to login)
      const isValid = response.ok && !response.url.toLowerCase().includes('login');

      console.log('Authentication validation completed', {
        isValid,
        status: response.status,
        url: response.url
      });

      return {
        isValid,
        statusCode: response.status,
        responseUrl: response.url
      };

    } catch (error) {
      console.error('Authentication validation failed:', error);

      // Mark validation error in MongoDB
      try {
        await samlConfigManager.markError(config.instance, `Validation failed: ${error instanceof Error ? error.message : String(error)}`);
      } catch (storageError) {
        console.warn('Failed to mark validation error in MongoDB:', storageError);
      }

      return {
        isValid: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Cleanup MongoDB connection
   */
  async cleanup(): Promise<void> {
    if (this.storageInitialized) {
      // SAMLConfigManager uses existing MongoDB infrastructure, no need to disconnect
      this.storageInitialized = false;
      console.log('🔌 SAML authentication cleanup completed');
    }
  }
}

// Export singleton instance
export const serviceNowSAMLAuth = new ServiceNowSAMLAuth();