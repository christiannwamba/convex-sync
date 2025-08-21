import { v } from "convex/values";
import { action, ActionCtx, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import {
  generatePKCEParams,
  buildGoogleOAuthUrl,
  isTokenExpired
} from "./helpers/tokenHelpers";
import {
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  refreshGoogleAccessToken
} from "./helpers/googleApiHelpers";
import { WorkflowManager } from "@convex-dev/workflow";
import { components } from "./_generated/api";

export const workflow = new WorkflowManager(components.workflow);

// OAuth completion workflow
export const _completeOAuthWorkflow = workflow.define({
  args: {
    code: v.string(),
    state: v.string(),
  },
  handler: async (step, args): Promise<{
    success: boolean;
    userId: Id<"users">;
    email: string;
    name: string;
  }> => {
    // Step 1: Get OAuth session with retry
    const session = await step.runQuery(internal.oauth._getOAuthSession,
      { state: args.state },
    );

    if (!session) {
      throw new Error("Invalid OAuth state");
    }

    // Step 2: Exchange code for tokens with retry
    const tokens = await step.runAction(internal.oauth._exchangeCodeForTokensAction,
      {
        code: args.code,
        codeVerifier: session.codeVerifier,
      },
      { retry: { maxAttempts: 3, initialBackoffMs: 100, base: 2 } }
    );

    // Step 3: Get user info from Google with retry
    const userInfo = await step.runAction(internal.oauth._fetchGoogleUserInfoAction,
      { accessToken: tokens.access_token },
      { retry: { maxAttempts: 3, initialBackoffMs: 100, base: 2 } }
    );

    // Step 4: Complete OAuth transaction with retry
    const result = await step.runMutation(internal.oauth._completeOAuthTransaction,
      {
        state: args.state,
        tokens,
        userInfo,
      },
    );

    // Step 5: Trigger calendar sync workflow with retry
    await step.runAction(internal.oauth._triggerCalendarSync,
      { userEmail: userInfo.email },
      { retry: { maxAttempts: 3, initialBackoffMs: 100, base: 2 } }
    );

    return {
      success: true,
      userId: result.userId,
      email: result.email,
      name: result.name,
    };
  },
});

export const initiateGoogleOAuth = action({
  args: {
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const { userEmail } = args;

    // Generate PKCE parameters using helper
    const { state, codeVerifier, codeChallenge } = await generatePKCEParams();

    // Store OAuth session using consolidated operation
    await ctx.runMutation(internal.oauth._initiateOAuthSession, {
      state,
      codeVerifier,
      userEmail,
    });

    // Build OAuth URL using helper
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const siteUrl = process.env.SITE_URL;

    if (!clientId || !siteUrl) {
      throw new Error("OAuth configuration missing: GOOGLE_CLIENT_ID or SITE_URL not set");
    }

    const oauthUrl = buildGoogleOAuthUrl(
      clientId,
      `${siteUrl}/api/oauth/callback`,
      state,
      codeChallenge
    );

    return {
      oauthUrl,
      state,
    };
  },
});

// Internal action to exchange code for tokens
export const _exchangeCodeForTokensAction = internalAction({
  args: {
    code: v.string(),
    codeVerifier: v.string(),
  },
  handler: async (ctx, args) => {
    const siteUrl = process.env.SITE_URL;
    if (!siteUrl) {
      throw new Error("SITE_URL environment variable not configured");
    }

    return await exchangeCodeForTokens(
      args.code,
      args.codeVerifier,
      `${siteUrl}/api/oauth/callback`
    );
  },
});

// Internal action to fetch Google user info
export const _fetchGoogleUserInfoAction = internalAction({
  args: {
    accessToken: v.string(),
  },
  handler: async (ctx, args) => {
    return await fetchGoogleUserInfo(args.accessToken);
  },
});

// Internal action to trigger calendar sync
export const _triggerCalendarSync = internalAction({
  args: {
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    // Import calendar workflow to trigger it
    const { workflow: calendarWorkflow } = await import("./calendar");
    await calendarWorkflow.start(ctx, internal.calendar._syncUserCalendarWorkflow, {
      userEmail: args.userEmail,
    });
  },
});

export const completeOAuthFlow = action({
  args: {
    code: v.string(),
    state: v.string(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    email: string;
  }> => {
    // Start the OAuth completion workflow
    const workflowId = await workflow.start(ctx, internal.oauth._completeOAuthWorkflow, {
      code: args.code,
      state: args.state,
    });

    const session = await ctx.runQuery(internal.oauth._getOAuthSession,
      { state: args.state },
    );

    if (!session) {
      throw new Error("Invalid OAuth state");
    }

    // For now, return a simple success message with the workflow ID
    // In a real app, you might want to poll the workflow status or use onComplete
    return {
      success: true,
      email: session.userEmail,
    };
  },
});

export async function refreshAccessToken(ctx: ActionCtx, args: { userId: Id<"users"> }) {
  const { userId } = args;

    const user = await ctx.runQuery(internal.oauth._getUserTokens, { userId });
    if (!user?.googleRefreshToken) {
      throw new Error("No refresh token available");
    }

    // Refresh tokens using helper
    const tokens = await refreshGoogleAccessToken(user.googleRefreshToken);

    // Update tokens using consolidated operation
    const result: {
      accessToken: string;
      expiresAt: number;
    } = await ctx.runMutation(internal.oauth._refreshUserTokens, {
      userId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
    });

  return result;
}


// Query functions
export const _getOAuthSession = internalQuery({
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

export const _getUserTokens = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

export const _getUserTokensByEmail = internalQuery({
    args: {
      email: v.string(),
    },
    handler: async (ctx, args) => {
      return await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", args.email)).first();
    },
  });



// ================================
// CONSOLIDATED INTERNAL OPERATIONS
// ================================

/**
 * Consolidated OAuth completion transaction
 * Combines session validation, user storage, and cleanup in single transaction
 */
export const _completeOAuthTransaction = internalMutation({
  args: {
    state: v.string(),
    tokens: v.object({
      access_token: v.string(),
      refresh_token: v.optional(v.string()),
      expires_in: v.number(),
    }),
    userInfo: v.object({
      email: v.string(),
      name: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    // Validate OAuth session
    const session = await ctx.db
      .query("oauthSessions")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();

    if (!session) {
      throw new Error("Invalid OAuth state");
    }

    // Check if user already exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.userInfo.email))
      .first();

    const expiresAt = Date.now() + (args.tokens.expires_in * 1000);
    let userId: Id<"users">;

    if (existingUser) {
      // Update existing user
      await ctx.db.patch(existingUser._id, {
        name: args.userInfo.name,
        googleAccessToken: args.tokens.access_token,
        googleRefreshToken: args.tokens.refresh_token || existingUser.googleRefreshToken,
        tokenExpiresAt: expiresAt,
      });
      userId = existingUser._id;
    } else {
      // Create new user
      if (!args.tokens.refresh_token) {
        throw new Error("Refresh token is required for new users");
      }
      userId = await ctx.db.insert("users", {
        email: args.userInfo.email,
        name: args.userInfo.name,
        googleAccessToken: args.tokens.access_token,
        googleRefreshToken: args.tokens.refresh_token,
        tokenExpiresAt: expiresAt,
      });
    }

    // Clean up OAuth session
    await ctx.db.delete(session._id);

    return {
      userId,
      email: args.userInfo.email,
      name: args.userInfo.name,
      codeVerifier: session.codeVerifier,
    };
  },
});

/**
 * Consolidated OAuth initiation
 * Creates session and returns all needed data in one operation
 */
export const _initiateOAuthSession = internalMutation({
  args: {
    state: v.string(),
    codeVerifier: v.string(),
    userEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const sessionId = await ctx.db.insert("oauthSessions", {
      state: args.state,
      codeVerifier: args.codeVerifier,
      createdAt: Date.now(),
      userEmail: args.userEmail,
    });

    return {
      sessionId,
      state: args.state,
    };
  },
});

/**
 * Consolidated token refresh operation
 * Updates user tokens in single transaction
 */
export const _refreshUserTokens = internalMutation({
  args: {
    userId: v.id("users"),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresIn: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const expiresAt = Date.now() + (args.expiresIn * 1000);

    await ctx.db.patch(args.userId, {
      googleAccessToken: args.accessToken,
      googleRefreshToken: args.refreshToken || user.googleRefreshToken,
      tokenExpiresAt: expiresAt,
    });

    return {
      accessToken: args.accessToken,
      expiresAt,
    };
  },
});
