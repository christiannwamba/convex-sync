import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  location?: string;
  status: string;
}

// Utility function to make authenticated Google API requests with token refresh
async function makeAuthenticatedGoogleRequest(
  ctx: any,
  userId: string,
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const user = await ctx.runQuery(api.oauthQueries.getUserTokens, { userId });

  if (!user?.googleAccessToken) {
    throw new Error("User not authenticated with Google");
  }

  // Check if token is expired (with 5 minute buffer)
  const now = Date.now();
  const isTokenExpired = user.tokenExpiresAt && (user.tokenExpiresAt - now) < 5 * 60 * 1000;

  let accessToken = user.googleAccessToken;

  if (isTokenExpired) {
    console.log("Token expired, refreshing...");
    const refreshResult = await ctx.runAction(api.oauth.refreshAccessToken, { userId });
    accessToken = refreshResult.accessToken;
  }

  // Make the API request
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  return response;
}

export const fetchGoogleCalendarEvents = action({
  args: {
    userId: v.id("users"),
    maxResults: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    eventsCount: number;
    events: Id<"calendarEvents">[];
}> => {
    const { userId, maxResults = 50 } = args;

    // Get calendar events from Google Calendar API
    const now = new Date().toISOString();
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.set('timeMin', now);
    url.searchParams.set('maxResults', maxResults.toString());
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');

    const response = await makeAuthenticatedGoogleRequest(ctx, userId, url.toString());

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to fetch calendar events: ${error}`);
    }

    const data = await response.json() as { items?: GoogleCalendarEvent[] };
    const events: GoogleCalendarEvent[] = data.items || [];

    // Store events in database
    const storedEvents: Id<"calendarEvents">[] = [];
    for (const event of events) {
      const storedEvent = await ctx.runMutation(internal.calendar.storeCalendarEvent, {
        userId,
        googleEventId: event.id,
        summary: event.summary || 'Untitled Event',
        description: event.description,
        start: {
          dateTime: event.start.dateTime,
          date: event.start.date,
          timeZone: event.start.timeZone,
        },
        end: {
          dateTime: event.end.dateTime,
          date: event.end.date,
          timeZone: event.end.timeZone,
        },
        location: event.location,
        status: event.status,
        lastSyncedAt: Date.now(),
      });
      storedEvents.push(storedEvent);
    }

    return {
      success: true,
      eventsCount: events.length,
      events: storedEvents,
    };
  },
});

export const syncUserCalendar = action({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { userId } = args;

    try {
      // Fetch and store events
      const result: {
        success: boolean;
        eventsCount: number;
        events: Id<"calendarEvents">[];
    } = await ctx.runAction(api.calendar.fetchGoogleCalendarEvents, {
        userId,
        maxResults: 100,
      });

      console.log(`Successfully synced ${result.eventsCount} events for user ${userId}`);

      return {
        success: true,
        message: `Synced ${result.eventsCount} calendar events`,
        eventsCount: result.eventsCount,
      };
    } catch (error) {
      console.error('Calendar sync failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

export const refreshUserCalendar = action({
  args: {
    userEmail: v.string(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    message: string;
    eventsCount: number;
}> => {
    const { userEmail } = args;

    // Get user by email
    const user: {_id: Id<"users">} | null = await ctx.runQuery(api.oauthQueries.getUserByEmail, { email: userEmail });
    if (!user) {
      throw new Error("User not found");
    }

    // Clear existing events for this user
    await ctx.runMutation(internal.calendar.clearUserEvents, { userId: user._id });

    // Sync fresh events
    const result = await ctx.runAction(api.calendar.syncUserCalendar, { userId: user._id });

    return result as {
      success: boolean;
      message: string;
      eventsCount: number;
    };
  },
});

// Internal mutations for database operations
export const storeCalendarEvent = internalMutation({
  args: {
    userId: v.id("users"),
    googleEventId: v.string(),
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
    lastSyncedAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Check if event already exists
    const existingEvent = await ctx.db
      .query("calendarEvents")
      .withIndex("by_google_event_id", (q) => q.eq("googleEventId", args.googleEventId))
      .first();

    if (existingEvent) {
      // Update existing event
      await ctx.db.patch(existingEvent._id, {
        summary: args.summary,
        description: args.description,
        start: args.start,
        end: args.end,
        location: args.location,
        status: args.status,
        lastSyncedAt: args.lastSyncedAt,
      });
      return existingEvent._id;
    } else {
      // Create new event
      return await ctx.db.insert("calendarEvents", args);
    }
  },
});

export const clearUserEvents = internalMutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("calendarEvents")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    for (const event of events) {
      await ctx.db.delete(event._id);
    }

    return events.length;
  },
});
