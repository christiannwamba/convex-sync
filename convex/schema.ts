import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  messages: defineTable({
    text: v.string(),
    author: v.string(),
  }),
  
  users: defineTable({
    email: v.string(),
    name: v.optional(v.string()),
    googleAccessToken: v.optional(v.string()),
    googleRefreshToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
  }).index("by_email", ["email"]),
  
  calendarEvents: defineTable({
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
  }).index("by_user", ["userId"])
    .index("by_google_event_id", ["googleEventId"]),
  
  oauthSessions: defineTable({
    state: v.string(),
    codeVerifier: v.string(),
    userId: v.optional(v.id("users")),
    createdAt: v.number(),
  }).index("by_state", ["state"]),
});