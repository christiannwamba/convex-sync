import { v } from "convex/values";
import { action, internalMutation, query, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import { isTokenExpired } from "./helpers/tokenHelpers";
import {
  fetchGoogleCalendarEvents as fetchEventsFromGoogle,
  refreshGoogleAccessToken,
  type GoogleCalendarEvent,
  type GoogleCalendarEventsBatch
} from "./helpers/googleApiHelpers";
import { WorkflowManager } from "@convex-dev/workflow";
import { Workpool } from "@convex-dev/workpool";
import { components } from "./_generated/api";
import { refreshAccessToken } from "./oauth";

export const workflow = new WorkflowManager(components.workflow);

// Work Pool for Google Calendar API rate limiting
export const calendarApiPool = new Workpool(components.calendarApiWorkpool, {
  maxParallelism: 5, // Google Calendar API rate limit consideration
  retryActionsByDefault: true,
  defaultRetryBehavior: {
    maxAttempts: 3,
    initialBackoffMs: 1000,
    base: 2
  },
});

// Calendar sync workflow using Work Pool
export const _syncUserCalendarWorkflow = workflow.define({
  args: {
    userEmail: v.string(),
    maxEventsPerBatch: v.optional(v.number()),
  },
  handler: async (step, args): Promise<{
    success: boolean;
    message: string;
    initialBatchStarted: boolean;
  }> => {
    // Step 1: Get user by email
    const user = await step.runQuery(internal.oauth._getUserTokensByEmail,
      { email: args.userEmail },
    );

    if (!user) {
      throw new Error("User not found");
    }

    // Step 2: Get fresh tokens
    const { accessToken } = await step.runAction(internal.calendar._getUserWithFreshTokens,
      { userId: user._id },
      { retry: { maxAttempts: 3, initialBackoffMs: 100, base: 2 } }
    );

    // Step 3: Clear existing events before starting fresh sync
    await step.runMutation(internal.calendar._clearUserEvents, {
      userId: user._id,
    });

    // Step 4: Start the first batch through work pool
    const batchResult = await step.runAction(internal.calendar._startPaginatedSync, {
      userId: user._id,
      accessToken,
      userEmail: args.userEmail,
      maxEventsPerBatch: args.maxEventsPerBatch || 250,
    });

    return {
      success: true,
      message: `Paginated calendar sync started for ${args.userEmail}. Initial batch work ID: ${batchResult.workId}`,
      initialBatchStarted: true,
    };
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


// Action to start paginated sync process
export const _startPaginatedSync = internalAction({
  args: {
    userId: v.id("users"),
    accessToken: v.string(),
    userEmail: v.string(),
    maxEventsPerBatch: v.number(),
  },
  handler: async (ctx, args): Promise<{ workId: string }> => {
    console.log(`Starting paginated sync for user ${args.userEmail}`);

    // Start the first batch through work pool
    const workId = await calendarApiPool.enqueueAction(
      ctx,
      internal.calendar._fetchAndStoreBatch,
      {
        userId: args.userId,
        accessToken: args.accessToken,
        userEmail: args.userEmail,
        maxResults: args.maxEventsPerBatch,
        pageToken: undefined, // First batch
        batchNumber: 1,
      }
    );

    return { workId };
  },
});

// Action to fetch and store a single batch of events
export const _fetchAndStoreBatch = internalAction({
  args: {
    userId: v.id("users"),
    accessToken: v.string(),
    userEmail: v.string(),
    maxResults: v.number(),
    pageToken: v.optional(v.string()),
    batchNumber: v.number(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    eventsStored: number;
    nextPageToken?: string;
    batchNumber: number;
  }> => {
    console.log(`Fetching batch ${args.batchNumber} for ${args.userEmail}`);

    try {
      // Fetch events batch
      const timeMin = new Date().toISOString();
      const batch = await fetchEventsFromGoogle(args.accessToken, {
        maxResults: args.maxResults,
        timeMin,
        pageToken: args.pageToken,
      });

      // Store events if any
      let eventsStored = 0;
      if (batch.events.length > 0) {
        await ctx.runMutation(internal.calendar._storeBatchEvents, {
          userId: args.userId,
          events: batch.events,
          batchNumber: args.batchNumber,
        });
        eventsStored = batch.events.length;
      }

      // If there's a next page, enqueue the next batch
      if (batch.nextPageToken) {
        console.log(`Enqueueing batch ${args.batchNumber + 1} for ${args.userEmail}`);
        await calendarApiPool.enqueueAction(
          ctx,
          internal.calendar._fetchAndStoreBatch,
          {
            userId: args.userId,
            accessToken: args.accessToken,
            userEmail: args.userEmail,
            maxResults: args.maxResults,
            pageToken: batch.nextPageToken,
            batchNumber: args.batchNumber + 1,
          }
        );
      } else {
        console.log(`Finished paginated sync for ${args.userEmail} after ${args.batchNumber} batches`);
      }

      return {
        success: true,
        eventsStored,
        nextPageToken: batch.nextPageToken,
        batchNumber: args.batchNumber,
      };
    } catch (error) {
      console.error(`Batch ${args.batchNumber} failed for ${args.userEmail}:`, error);
      throw error;
    }
  },
});

// Internal mutation to store batch events
export const _storeBatchEvents = internalMutation({
  args: {
    userId: v.id("users"),
    events: v.array(
      v.object({
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
    batchNumber: v.number(),
  },
  handler: async (ctx, args) => {
    console.log(`Storing ${args.events.length} events from batch ${args.batchNumber}`);

    const lastSyncedAt = Date.now();
    for (const event of args.events) {
      await ctx.db.insert("calendarEvents", {
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
    }

    return { eventsStored: args.events.length };
  },
});

// Internal mutation to clear user events before sync
export const _clearUserEvents = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    console.log(`Clearing existing events for user ${args.userId}`);

    const existingEvents = await ctx.db
      .query("calendarEvents")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    for (const event of existingEvents) {
      await ctx.db.delete(event._id);
    }

    return { deletedCount: existingEvents.length };
  },
});

// Helper function for calendar refresh logic (can be reused)


// Calendar refresh with unlimited events and rate limiting
export const refreshUserCalendar = action({
  args: {
    userEmail: v.string(),
    maxEventsPerBatch: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    message: string;
    workflowId: string;
  }> => {
    // Start the calendar sync workflow
    const workflowId = await workflow.start(
      ctx,
      internal.calendar._syncUserCalendarWorkflow,
      {
        userEmail: args.userEmail,
        maxEventsPerBatch: args.maxEventsPerBatch || 250,
      }
    );

    return {
      success: true,
      message: `Calendar sync started for ${args.userEmail}. This will fetch ALL events in the background using rate-limited API calls.`,
      workflowId,
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
