// Pure TypeScript helper functions for token management and OAuth utilities
// These functions don't use Convex context and can be easily tested

/**
 * Generate cryptographically secure random string for PKCE
 */
export function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate code challenge for PKCE
 */
export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const base64String = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return base64String.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Generate PKCE parameters for OAuth flow
 */
export async function generatePKCEParams(): Promise<{
  state: string;
  codeVerifier: string;
  codeChallenge: string;
}> {
  const state = generateRandomString(32);
  const codeVerifier = generateRandomString(43); // 43 chars for base64url-safe
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  
  return { state, codeVerifier, codeChallenge };
}

/**
 * Build Google OAuth URL with all required parameters
 */
export function buildGoogleOAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  codeChallenge: string,
  scopes: string = 'https://www.googleapis.com/auth/calendar.readonly openid email profile'
): string {
  const googleOAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleOAuthUrl.searchParams.set('client_id', clientId);
  googleOAuthUrl.searchParams.set('redirect_uri', redirectUri);
  googleOAuthUrl.searchParams.set('response_type', 'code');
  googleOAuthUrl.searchParams.set('scope', scopes);
  googleOAuthUrl.searchParams.set('state', state);
  googleOAuthUrl.searchParams.set('code_challenge', codeChallenge);
  googleOAuthUrl.searchParams.set('code_challenge_method', 'S256');
  googleOAuthUrl.searchParams.set('access_type', 'offline');
  googleOAuthUrl.searchParams.set('prompt', 'consent');
  
  return googleOAuthUrl.toString();
}

/**
 * Check if access token is expired (with buffer)
 */
export function isTokenExpired(
  tokenExpiresAt: number,
  bufferMinutes: number = 5
): boolean {
  const now = Date.now();
  const bufferMs = bufferMinutes * 60 * 1000;
  return tokenExpiresAt - now < bufferMs;
}

/**
 * Calculate token expiration timestamp
 */
export function calculateTokenExpiration(expiresInSeconds: number): number {
  return Date.now() + (expiresInSeconds * 1000);
}

/**
 * Validate OAuth state parameter
 */
export function validateOAuthState(
  providedState: string,
  expectedState: string
): boolean {
  return providedState === expectedState;
}

/**
 * Extract domain from email address
 */
export function extractEmailDomain(email: string): string {
  const atIndex = email.lastIndexOf('@');
  return atIndex >= 0 ? email.substring(atIndex + 1) : '';
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}