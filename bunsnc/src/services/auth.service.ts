// Authentication service stub
export abstract class AuthService {
  static async login(username: string, password: string): Promise<{ token: string }> {
    // TODO: Implementar autenticação real (mock por enquanto)
    if (username === "admin" && password === "admin") {
      return { token: "mock-token-123" };
    }
    throw new Error("Invalid credentials");
  }

  static async logout(token: string): Promise<{ success: boolean }> {
    // TODO: Implementar logout real (mock)
    return { success: true };
  }

  static async validateToken(token: string): Promise<boolean> {
    // TODO: Implementar validação real (mock)
    return token === "mock-token-123";
  }
}
export class AuthService {
  // TODO: Implement authentication methods
}
