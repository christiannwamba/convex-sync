import { v } from "convex/values";
import { action, internalMutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";

// Generate cryptographically secure random string for PKCE
function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Generate code challenge for PKCE
async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const base64String = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return base64String.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export const initiateGoogleOAuth = action({
  args: {
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const { userEmail } = args;

    // Generate PKCE parameters
    const state = generateRandomString(32);
    const codeVerifier = generateRandomString(43); // 43 chars for base64url-safe
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // Store OAuth session
    await ctx.runMutation(internal.oauth.storeOAuthSession, {
      state,
      codeVerifier,
      userEmail,
    });

    // Build OAuth URL
    const googleOAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleOAuthUrl.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID!);
    googleOAuthUrl.searchParams.set('redirect_uri', `${process.env.SITE_URL}/api/oauth/callback`);
    googleOAuthUrl.searchParams.set('response_type', 'code');
    googleOAuthUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar.readonly openid email profile');
    googleOAuthUrl.searchParams.set('state', state);
    googleOAuthUrl.searchParams.set('code_challenge', codeChallenge);
    googleOAuthUrl.searchParams.set('code_challenge_method', 'S256');
    googleOAuthUrl.searchParams.set('access_type', 'offline');
    googleOAuthUrl.searchParams.set('prompt', 'consent');

    return {
      oauthUrl: googleOAuthUrl.toString(),
      state,
    };
  },
});

export const completeOAuthFlow = action({
  args: {
    code: v.string(),
    state: v.string(),
  },
  handler: async (ctx, args) => {
    const { code, state } = args;

    // Get OAuth session
    const session = await ctx.runQuery(api.oauth.getOAuthSession, { state });
    if (!session) {
      throw new Error("Invalid OAuth state");
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${process.env.SITE_URL}/api/oauth/callback`,
        code_verifier: session.codeVerifier,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const tokens = await tokenResponse.json() as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    // Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (!userInfoResponse.ok) {
      throw new Error('Failed to fetch user info');
    }

    const userInfo = await userInfoResponse.json() as {
      email: string;
      name: string;
    };

    // Store user and tokens
    const userId = await ctx.runMutation(internal.oauth.storeUserWithTokens, {
      email: userInfo.email,
      name: userInfo.name,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
    }) as Id<"users">;

    // Clean up OAuth session
    await ctx.runMutation(internal.oauth.cleanupOAuthSession, { state });
    await ctx.runAction(api.calendar.refreshUserCalendar, { userEmail: userInfo.email });

    return {
      success: true,
      userId,
      email: userInfo.email,
      name: userInfo.name,
    };
  },
});

export const refreshAccessToken = action({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { userId } = args;

    const user = await ctx.runQuery(api.oauth.getUserTokens, { userId });
    if (!user?.googleRefreshToken) {
      throw new Error("No refresh token available");
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: user.googleRefreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh failed: ${error}`);
    }

    const tokens = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    // Update tokens
    await ctx.runMutation(internal.oauth.updateUserTokens, {
      userId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || user.googleRefreshToken, // Keep existing refresh token if not provided
      expiresIn: tokens.expires_in,
    });

    return {
      accessToken: tokens.access_token,
      expiresAt: Date.now() + (tokens.expires_in * 1000),
    };
  },
});

// Internal mutations
export const storeOAuthSession = internalMutation({
  args: {
    state: v.string(),
    codeVerifier: v.string(),
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("oauthSessions", {
      state: args.state,
      codeVerifier: args.codeVerifier,
      createdAt: Date.now(),
    });
  },
});

export const storeUserWithTokens = internalMutation({
  args: {
    email: v.string(),
    name: v.string(),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresIn: v.number(),
  },
  handler: async (ctx, args) => {
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    const expiresAt = Date.now() + (args.expiresIn * 1000);

    if (existingUser) {
      await ctx.db.patch(existingUser._id, {
        name: args.name,
        googleAccessToken: args.accessToken,
        googleRefreshToken: args.refreshToken,
        tokenExpiresAt: expiresAt,
      });
      return existingUser._id;
    } else {
      return await ctx.db.insert("users", {
        email: args.email,
        name: args.name,
        googleAccessToken: args.accessToken,
        googleRefreshToken: args.refreshToken,
        tokenExpiresAt: expiresAt,
      });
    }
  },
});

export const updateUserTokens = internalMutation({
  args: {
    userId: v.id("users"),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresIn: v.number(),
  },
  handler: async (ctx, args) => {
    const expiresAt = Date.now() + (args.expiresIn * 1000);

    await ctx.db.patch(args.userId, {
      googleAccessToken: args.accessToken,
      googleRefreshToken: args.refreshToken,
      tokenExpiresAt: expiresAt,
    });
  },
});

export const cleanupOAuthSession = internalMutation({
  args: {
    state: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("oauthSessions")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();

    if (session) {
      await ctx.db.delete(session._id);
    }
  },
});

// Query functions
export const getOAuthSession = query({
  args: {
    state: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("oauthSessions")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();
  },
});

export const getUserTokens = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

export const getUserByEmail = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
  },
});
