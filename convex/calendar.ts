import { v } from "convex/values";
import { action, internalMutation, query, ActionCtx, QueryCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id, Doc } from "./_generated/dataModel";
import { isTokenExpired } from "./helpers/tokenHelpers";
import {
  fetchGoogleCalendarEvents as fetchEventsFromGoogle,
  refreshGoogleAccessToken,
  type GoogleCalendarEvent
} from "./helpers/googleApiHelpers";

// Utility function to get user tokens and refresh if needed
async function getUserWithFreshTokens(
  ctx: ActionCtx,
  userId: Id<"users">
): Promise<{ accessToken: string; user: Doc<"users"> }> {
  const user = await ctx.runQuery(api.oauth.getUserTokens, { userId });

  if (!user?.googleAccessToken) {
    throw new Error("User not authenticated with Google");
  }

  // Check if token is expired using helper
  const needsRefresh = user.tokenExpiresAt && isTokenExpired(user.tokenExpiresAt, 5);

  if (needsRefresh) {
    console.log("Token expired, refreshing...");
    const refreshResult = await ctx.runAction(api.oauth.refreshAccessToken, { userId });
    return { accessToken: refreshResult.accessToken, user };
  }

  return { accessToken: user.googleAccessToken, user };
}

// Helper function for calendar refresh logic (can be reused)
export async function refreshUserCalendarHelper(
  ctx: ActionCtx,
  userEmail: string
): Promise<{
  success: boolean;
  message: string;
  eventsCount: number;
}> {
  // Get user by email
  const user: {_id: Id<"users">} | null = await ctx.runQuery(api.oauth.getUserByEmail, { email: userEmail });
  if (!user) {
    throw new Error("User not found");
  }

  try {
    // Get user with fresh tokens
    const { accessToken } = await getUserWithFreshTokens(ctx, user._id);

    // Fetch events from Google using helper
    const events = await fetchEventsFromGoogle(accessToken, {
      maxResults: 100,
      timeMin: new Date().toISOString(),
    });

    // Use consolidated operation that clears and refreshes all events
    const result = await ctx.runMutation(internal.calendar._batchRefreshUserCalendar, {
      userEmail,
      events,
    });

    return result;
  } catch (error) {
    console.error('Calendar refresh failed:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      eventsCount: 0,
    };
  }
}

export const refreshUserCalendar = action({
  args: {
    userEmail: v.string(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    message: string;
    eventsCount: number;
}> => {
    return await refreshUserCalendarHelper(ctx, args.userEmail);
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

/**
 * Consolidated event storage operation
 * Handles batch event insertion/updating with upsert logic
 */
export const _batchStoreEvents = internalMutation({
  args: {
    userId: v.id("users"),
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
    const storedEventIds: Id<"calendarEvents">[] = [];
    const lastSyncedAt = Date.now();

    for (const event of args.events) {
      // Check if event already exists
      const existingEvent = await ctx.db
        .query("calendarEvents")
        .withIndex("by_google_event_id", (q) => q.eq("googleEventId", event.id))
        .first();

      if (existingEvent) {
        // Update existing event
        await ctx.db.patch(existingEvent._id, {
          summary: event.summary || 'Untitled Event',
          description: event.description,
          start: event.start,
          end: event.end,
          location: event.location,
          status: event.status,
          lastSyncedAt,
        });
        storedEventIds.push(existingEvent._id);
      } else {
        // Create new event
        const eventId = await ctx.db.insert("calendarEvents", {
          userId: args.userId,
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
    }

    return {
      success: true,
      eventsCount: args.events.length,
      storedEventIds,
    };
  },
});

/**
 * Get user with token validation in single query
 */
export const _getUserWithValidTokens = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);

    if (!user?.googleAccessToken) {
      return { user: null, needsTokenRefresh: false, isValid: false };
    }

    // Check if token is expired (with 5 minute buffer)
    const now = Date.now();
    const isTokenExpired = user.tokenExpiresAt && (user.tokenExpiresAt - now) < 5 * 60 * 1000;

    return {
      user,
      needsTokenRefresh: isTokenExpired || false,
      isValid: true,
    };
  },
});
