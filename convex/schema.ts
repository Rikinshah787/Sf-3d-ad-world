import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  spots: defineTable({
    name: v.string(),
    neighborhood: v.string(),
    lat: v.float64(),
    lng: v.float64(),
    gridRow: v.float64(),
    gridCol: v.float64(),
    buildingHeight: v.float64(),
    buildingStyle: v.union(
      v.literal("tower"),
      v.literal("wide"),
      v.literal("skyscraper"),
      v.literal("small"),
      v.literal("pyramid"),
      v.literal("clocktower"),
      v.literal("bridge")
    ),
    currentBid: v.float64(),
    highestBidder: v.optional(v.string()),
    // Ad fields
    adCompany: v.optional(v.string()),
    adWebsite: v.optional(v.string()),
    adTagline: v.optional(v.string()),
    adColor: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    color: v.optional(v.string()),
    // Metric fields
    impressions: v.optional(v.float64()),
    prestigeScore: v.optional(v.float64()),
    category: v.optional(v.string()),
  }),
  bids: defineTable({
    spotId: v.id("spots"),
    bidder: v.string(),
    amount: v.float64(),
    company: v.optional(v.string()),
    website: v.optional(v.string()),
    tagline: v.optional(v.string()),
    timestamp: v.float64(),
  }).index("by_spot", ["spotId"]),
});
