/**
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 * Authentication service - Production implementation with ServiceNow OAuth2 and Basic Auth
 */

export interface AuthCredentials {
  username: string;
  password: string;
  instanceUrl: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
}

export class AuthService {
  private instanceUrl: string;

  constructor(instanceUrl: string) {
    this.instanceUrl = instanceUrl;
  }

  /**
   * Authenticate using Basic Auth (username/password)
   */
  async loginBasic(username: string, password: string): Promise<{ token: string; type: 'basic' }> {
    try {
      // Create Basic Auth token
      const credentials = btoa(`${username}:${password}`);
      const token = `Basic ${credentials}`;
      
      // Validate credentials by making a test API call
      const testResponse = await fetch(`${this.instanceUrl}/api/now/table/sys_user?sysparm_limit=1`, {
        method: 'GET',
        headers: {
          'Authorization': token,
          'Accept': 'application/json'
        }
      });

      if (!testResponse.ok) {
        throw new Error(`Authentication failed: ${testResponse.status} - ${testResponse.statusText}`);
      }

      return { token, type: 'basic' };
    } catch (error) {
      console.error('Basic authentication failed:', error);
      throw error;
    }
  }

  /**
   * Authenticate using OAuth2 (client credentials flow)
   */
  async loginOAuth(clientId: string, clientSecret: string, username?: string, password?: string): Promise<TokenResponse> {
    try {
      const tokenUrl = `${this.instanceUrl}/oauth_token.do`;
      
      const body = new URLSearchParams({
        grant_type: username && password ? 'password' : 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret
      });

      if (username && password) {
        body.append('username', username);
        body.append('password', password);
      }

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: body.toString()
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OAuth authentication failed: ${response.status} - ${errorText}`);
      }

      const tokenData: TokenResponse = await response.json();
      
      // Validate the token
      await this.validateOAuthToken(tokenData.access_token);
      
      return tokenData;
    } catch (error) {
      console.error('OAuth authentication failed:', error);
      throw error;
    }
  }

  /**
   * Validate OAuth token
   */
  async validateOAuthToken(accessToken: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.instanceUrl}/api/now/table/sys_user?sysparm_limit=1`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      return response.ok;
    } catch (error) {
      console.error('Token validation failed:', error);
      return false;
    }
  }

  /**
   * Validate Basic Auth token
   */
  async validateBasicToken(token: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.instanceUrl}/api/now/table/sys_user?sysparm_limit=1`, {
        method: 'GET',
        headers: {
          'Authorization': token,
          'Accept': 'application/json'
        }
      });

      return response.ok;
    } catch (error) {
      console.error('Basic token validation failed:', error);
      return false;
    }
  }

  /**
   * Refresh OAuth token
   */
  async refreshToken(refreshToken: string, clientId: string, clientSecret: string): Promise<TokenResponse> {
    try {
      const tokenUrl = `${this.instanceUrl}/oauth_token.do`;
      
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret
      });

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: body.toString()
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Token refresh failed:', error);
      throw error;
    }
  }

  /**
   * Logout (revoke OAuth token)
   */
  async logout(token: string, clientId?: string, clientSecret?: string): Promise<{ success: boolean }> {
    try {
      if (token.startsWith('Basic ')) {
        // Basic Auth doesn't need server-side logout
        return { success: true };
      }

      if (!clientId || !clientSecret) {
        // Cannot revoke without client credentials
        return { success: true };
      }

      const revokeUrl = `${this.instanceUrl}/oauth_revoke_token.do`;
      const accessToken = token.replace('Bearer ', '');
      
      const body = new URLSearchParams({
        token: accessToken,
        client_id: clientId,
        client_secret: clientSecret
      });

      const response = await fetch(revokeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      });

      return { success: response.ok };
    } catch (error) {
      console.error('Logout failed:', error);
      return { success: false };
    }
  }
}

/**
 * Static methods for backward compatibility
 */
export abstract class AuthServiceCompat {
  static async login(username: string, password: string, instanceUrl?: string): Promise<{ token: string }> {
    const url = instanceUrl || process.env.SNC_INSTANCE_URL;
    if (!url) {
      throw new Error('Instance URL not provided');
    }
    
    const authService = new AuthService(url);
    const result = await authService.loginBasic(username, password);
    return { token: result.token };
  }

  static async logout(token: string, instanceUrl?: string): Promise<{ success: boolean }> {
    const url = instanceUrl || process.env.SNC_INSTANCE_URL;
    if (!url) {
      return { success: true };
    }
    
    const authService = new AuthService(url);
    return await authService.logout(token);
  }

  static async validateToken(token: string, instanceUrl?: string): Promise<boolean> {
    const url = instanceUrl || process.env.SNC_INSTANCE_URL;
    if (!url) {
      return false;
    }
    
    const authService = new AuthService(url);
    
    if (token.startsWith('Basic ')) {
      return await authService.validateBasicToken(token);
    } else {
      const accessToken = token.replace('Bearer ', '');
      return await authService.validateOAuthToken(accessToken);
    }
  }
}