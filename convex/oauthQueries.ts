import { v } from "convex/values";
import { query } from "./_generated/server";

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