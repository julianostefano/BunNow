/**
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 * AuthService.pure.ts - Static methods using real authentication
 */
import { AuthServiceCompat } from './auth.service';

export abstract class AuthService {
    /**
     * Real login implementation using Basic Auth
     */
    static async login(username: string, password: string): Promise<{ token: string }> {
        return await AuthServiceCompat.login(username, password);
    }

    /**
     * Real logout implementation
     */
    static async logout(token: string): Promise<{ success: boolean }> {
        return await AuthServiceCompat.logout(token);
    }

    /**
     * Real token validation implementation
     */
    static async validateToken(token: string): Promise<boolean> {
        return await AuthServiceCompat.validateToken(token);
    }
}
