import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const listSpots = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("spots").collect();
  },
});

export const getSpot = query({
  args: { spotId: v.id("spots") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.spotId);
  },
});

export const placeBid = mutation({
  args: {
    spotId: v.id("spots"),
    bidder: v.string(),
    amount: v.float64(),
    company: v.optional(v.string()),
    website: v.optional(v.string()),
    tagline: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const spot = await ctx.db.get(args.spotId);
    if (!spot) throw new Error("Spot not found");
    if (args.amount <= spot.currentBid) {
      throw new Error("Bid must be higher than current bid");
    }

    // Record the bid
    await ctx.db.insert("bids", {
      spotId: args.spotId,
      bidder: args.bidder,
      amount: args.amount,
      company: args.company,
      website: args.website,
      tagline: args.tagline,
      timestamp: Date.now(),
    });

    // Update the spot — winner's ad goes live immediately
    await ctx.db.patch(args.spotId, {
      currentBid: args.amount,
      highestBidder: args.bidder,
      adCompany: args.company || args.bidder,
      adWebsite: args.website,
      adTagline: args.tagline,
      logoUrl: args.logoUrl,
      adColor: spot.color,
    });
  },
});

export const getBidsForSpot = query({
  args: { spotId: v.id("spots") },
  handler: async (ctx, args) => {
    const bids = await ctx.db
      .query("bids")
      .withIndex("by_spot", (q) => q.eq("spotId", args.spotId))
      .collect();
    return bids.sort((a, b) => b.timestamp - a.timestamp);
  },
});

export const listRecentBids = query({
  args: {},
  handler: async (ctx) => {
    const bids = await ctx.db.query("bids").collect();
    const sorted = bids.sort((a, b) => b.timestamp - a.timestamp).slice(0, 15);
    const result = [];
    for (const b of sorted) {
      const spot = await ctx.db.get(b.spotId);
      if (spot) {
        result.push({
          ...b,
          spotName: spot.name,
          spotNeighborhood: spot.neighborhood,
          spotColor: spot.color,
        });
      }
    }
    return result;
  },
});

