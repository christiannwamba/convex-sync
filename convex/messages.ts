import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("messages").order("desc").take(100);
  },
});

export const send = mutation({
  args: { text: v.string(), author: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("messages", {
      text: args.text,
      author: args.author,
    });
  },
});