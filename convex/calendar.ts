import { v } from "convex/values";
import { action, internalMutation, query, ActionCtx, QueryCtx, internalAction, mutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id, Doc } from "./_generated/dataModel";
import { isTokenExpired } from "./helpers/tokenHelpers";
import {
  fetchGoogleCalendarEvents as fetchEventsFromGoogle,
  refreshGoogleAccessToken,
  type GoogleCalendarEvent
} from "./helpers/googleApiHelpers";
import { vWorkflowId, WorkflowManager } from "@convex-dev/workflow";
import { components } from "./_generated/api";
import { refreshAccessToken } from "./oauth";

export const workflow = new WorkflowManager(components.workflow);

// Calendar sync workflow
export const _syncUserCalendarWorkflow = workflow.define({
  args: { userEmail: v.string() },
  handler: async (step, args): Promise<{
    success: boolean;
    message: string;
    eventsCount: number;
  }> => {
    // Step 1: Get user by email with retry
    const user = await step.runQuery(internal.oauth._getUserTokensByEmail,
      { email: args.userEmail },
    );

    if (!user) {
      throw new Error("User not found");
    }

    // Step 2: Get user with fresh tokens with retry
    const { accessToken } = await step.runAction(internal.calendar._getUserWithFreshTokens,
      { userId: user._id },
      { retry: { maxAttempts: 3, initialBackoffMs: 100, base: 2 } }
    );

    // Step 3: Fetch events from Google with retry
    const events = await step.runAction(internal.calendar._fetchGoogleCalendarEvents,
      {
        accessToken,
        maxResults: 100,
      },
      { retry: { maxAttempts: 3, initialBackoffMs: 100, base: 2 } }
    );


    // Step 4: Store events in database with retry
    const result = await step.runMutation(internal.calendar._batchRefreshUserCalendar,
      { userEmail: args.userEmail, events },
    );

    return result;
  },
});

// Internal action to get user tokens and refresh if needed
export const _getUserWithFreshTokens = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, args): Promise<{ accessToken: string; user: Doc<"users"> }> => {
    const user = await ctx.runQuery(internal.oauth._getUserTokens, { userId: args.userId });

    if (!user?.googleAccessToken) {
      throw new Error("User not authenticated with Google");
    }

    // Check if token is expired using helper
    const needsRefresh = user.tokenExpiresAt && isTokenExpired(user.tokenExpiresAt, 5);

    if (needsRefresh) {
      console.log("Token expired, refreshing...");
      const refreshResult = await refreshAccessToken(ctx, { userId: args.userId });
      return { accessToken: refreshResult.accessToken, user };
    }

    return { accessToken: user.googleAccessToken, user };
  },
});

// Internal action to fetch Google Calendar events
export const _fetchGoogleCalendarEvents = internalAction({
  args: {
    accessToken: v.string(),
    maxResults: v.number(),
  },
  handler: async (ctx, args): Promise<GoogleCalendarEvent[]> => {
    const timeMin = new Date().toISOString();
    console.log("fetching events");
    return await fetchEventsFromGoogle(args.accessToken, {
      maxResults: args.maxResults,
      timeMin,
    });
  },
});

// Helper function for calendar refresh logic (can be reused)


export const refreshUserCalendar = action({
  args: {
    userEmail: v.string(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    message: string;
    eventsCount: number;
}> => {
    // Start the calendar sync workflow
    const workflowId = await workflow.start(ctx, internal.calendar._syncUserCalendarWorkflow, {
      userEmail: args.userEmail,
    });

    // For now, return a simple success message with the workflow ID
    // In a real app, you might want to poll the workflow status
    return {
      success: true,
      message: `Calendar sync workflow started with ID: ${workflowId}`,
      eventsCount: 0, // Will be updated when workflow completes
    };
  },
});

export const getUserCalendarEventsByEmail = query({
  args: {
    email: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { email, limit = 50 } = args;

    // First find the user
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    if (!user) {
      return [];
    }

    // Get their calendar events
    return await ctx.db
      .query("calendarEvents")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(limit);
  },
});

export const getUserAuthStatus = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!user) {
      return {
        isAuthenticated: false,
        hasTokens: false,
        user: null,
      };
    }

    const hasValidTokens = user.googleAccessToken && user.googleRefreshToken;
    const isTokenValid = user.tokenExpiresAt ? user.tokenExpiresAt > Date.now() : false;

    return {
      isAuthenticated: !!hasValidTokens,
      hasTokens: !!hasValidTokens,
      tokenExpired: !isTokenValid,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        tokenExpiresAt: user.tokenExpiresAt,
      },
    };
  },
});

// ================================
// CONSOLIDATED INTERNAL OPERATIONS
// ================================

/**
 * Consolidated calendar refresh operation
 * Combines user lookup, event clearing, and batch event storage in single transaction
 */
export const _batchRefreshUserCalendar = internalMutation({
  args: {
    userEmail: v.string(),
    events: v.array(
      v.object({
        // Only validate the fields we actually need/use
        id: v.string(),
        summary: v.string(),
        description: v.optional(v.string()),
        start: v.object({
          dateTime: v.optional(v.string()),
          date: v.optional(v.string()),
          timeZone: v.optional(v.string()),
        }),
        end: v.object({
          dateTime: v.optional(v.string()),
          date: v.optional(v.string()),
          timeZone: v.optional(v.string()),
        }),
        location: v.optional(v.string()),
        status: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Get user by email
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.userEmail))
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    // Clear existing events for this user
    const existingEvents = await ctx.db
      .query("calendarEvents")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    for (const event of existingEvents) {
      await ctx.db.delete(event._id);
    }

    // Store new events in batch
    const storedEventIds: Id<"calendarEvents">[] = [];
    const lastSyncedAt = Date.now();

    for (const event of args.events) {
      const eventId = await ctx.db.insert("calendarEvents", {
        userId: user._id,
        googleEventId: event.id,
        summary: event.summary || 'Untitled Event',
        description: event.description,
        start: event.start,
        end: event.end,
        location: event.location,
        status: event.status,
        lastSyncedAt,
      });
      storedEventIds.push(eventId);
    }

    return {
      success: true,
      message: `Synced ${args.events.length} calendar events`,
      eventsCount: args.events.length,
      userId: user._id,
      storedEventIds,
    };
  },
});
