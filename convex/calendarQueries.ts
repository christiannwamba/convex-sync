import { v } from "convex/values";
import { query } from "./_generated/server";

export const getUserCalendarEvents = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, limit = 50 } = args;
    
    return await ctx.db
      .query("calendarEvents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
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

export const getRecentCalendarEvents = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    
    const events = await ctx.db
      .query("calendarEvents")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    
    // Filter events that were synced in the last 24 hours and are upcoming
    return events.filter(event => {
      const wasRecentlySynced = event.lastSyncedAt > oneDayAgo;
      
      // Check if event is upcoming (either by dateTime or date)
      const startTime = event.start.dateTime || event.start.date;
      if (startTime) {
        const eventStart = new Date(startTime).getTime();
        return wasRecentlySynced && eventStart > now;
      }
      
      return wasRecentlySynced;
    }).sort((a, b) => {
      // Sort by start time
      const aStart = new Date(a.start.dateTime || a.start.date || 0).getTime();
      const bStart = new Date(b.start.dateTime || b.start.date || 0).getTime();
      return aStart - bStart;
    });
  },
});