import { mutation } from "./_generated/server";

export const seedSpots = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("spots").collect();
    if (existing.length > 0) return "Already seeded";

    const spots = [
      {
        name: "Transamerica Pyramid", neighborhood: "Financial District",
        lat: 37.7952, lng: -122.4028, gridRow: 0, gridCol: 2,
        buildingHeight: 6, buildingStyle: "skyscraper" as const,
        currentBid: 500, color: "#8B5CF6",
        highestBidder: "Stripe", adCompany: "Stripe", adWebsite: "https://stripe.com", adTagline: "Financial infrastructure for the internet",
      },
      {
        name: "Salesforce Tower", neighborhood: "SoMa",
        lat: 37.7897, lng: -122.3969, gridRow: 0, gridCol: 7,
        buildingHeight: 6, buildingStyle: "skyscraper" as const,
        currentBid: 750, color: "#06B6D4",
        highestBidder: "Vercel", adCompany: "Vercel", adWebsite: "https://vercel.com", adTagline: "Develop. Preview. Ship.",
      },
      {
        name: "Coit Tower", neighborhood: "Telegraph Hill",
        lat: 37.8024, lng: -122.4058, gridRow: 2, gridCol: 0,
        buildingHeight: 4, buildingStyle: "tower" as const,
        currentBid: 200, color: "#EF4444",
      },
      {
        name: "Ferry Building", neighborhood: "Embarcadero",
        lat: 37.7956, lng: -122.3935, gridRow: 2, gridCol: 2,
        buildingHeight: 3, buildingStyle: "wide" as const,
        currentBid: 350, color: "#F59E0B",
        highestBidder: "Convex", adCompany: "Convex", adWebsite: "https://convex.dev", adTagline: "The fullstack TypeScript development platform",
      },
      {
        name: "Oracle Park", neighborhood: "South Beach",
        lat: 37.7786, lng: -122.3893, gridRow: 2, gridCol: 7,
        buildingHeight: 3, buildingStyle: "wide" as const,
        currentBid: 400, color: "#F97316",
      },
      {
        name: "Pier 39", neighborhood: "Fisherman's Wharf",
        lat: 37.8087, lng: -122.4098, gridRow: 2, gridCol: 9,
        buildingHeight: 2, buildingStyle: "small" as const,
        currentBid: 300, color: "#14B8A6",
        highestBidder: "Figma", adCompany: "Figma", adWebsite: "https://figma.com", adTagline: "Where teams design together",
      },
      {
        name: "City Hall", neighborhood: "Civic Center",
        lat: 37.7793, lng: -122.4193, gridRow: 5, gridCol: 2,
        buildingHeight: 5, buildingStyle: "tower" as const,
        currentBid: 450, color: "#A855F7",
      },
      {
        name: "SFMOMA", neighborhood: "SoMa",
        lat: 37.7857, lng: -122.4011, gridRow: 5, gridCol: 7,
        buildingHeight: 3, buildingStyle: "wide" as const,
        currentBid: 280, color: "#EC4899",
        highestBidder: "Linear", adCompany: "Linear", adWebsite: "https://linear.app", adTagline: "Plan and build products",
      },
      {
        name: "Golden Gate Bridge Vista", neighborhood: "Presidio",
        lat: 37.8199, lng: -122.4783, gridRow: 7, gridCol: 0,
        buildingHeight: 2, buildingStyle: "small" as const,
        currentBid: 600, color: "#EF4444",
        highestBidder: "Notion", adCompany: "Notion", adWebsite: "https://notion.so", adTagline: "Your connected workspace",
      },
      {
        name: "Painted Ladies", neighborhood: "Alamo Square",
        lat: 37.7762, lng: -122.4328, gridRow: 7, gridCol: 2,
        buildingHeight: 2, buildingStyle: "small" as const,
        currentBid: 350, color: "#D946EF",
      },
      {
        name: "Ghirardelli Square", neighborhood: "Fisherman's Wharf",
        lat: 37.8060, lng: -122.4230, gridRow: 7, gridCol: 5,
        buildingHeight: 3, buildingStyle: "wide" as const,
        currentBid: 250, color: "#92400E",
      },
      {
        name: "Union Square", neighborhood: "Downtown",
        lat: 37.7879, lng: -122.4074, gridRow: 7, gridCol: 7,
        buildingHeight: 3, buildingStyle: "tower" as const,
        currentBid: 380, color: "#10B981",
        highestBidder: "Supabase", adCompany: "Supabase", adWebsite: "https://supabase.com", adTagline: "Build in a weekend. Scale to millions.",
      },
      {
        name: "Moscone Center", neighborhood: "SoMa",
        lat: 37.7840, lng: -122.4006, gridRow: 7, gridCol: 9,
        buildingHeight: 2, buildingStyle: "wide" as const,
        currentBid: 320, color: "#3B82F6",
      },
      {
        name: "Grace Cathedral", neighborhood: "Nob Hill",
        lat: 37.7914, lng: -122.4130, gridRow: 9, gridCol: 2,
        buildingHeight: 4, buildingStyle: "tower" as const,
        currentBid: 220, color: "#7C3AED",
      },
      {
        name: "Lombard Street", neighborhood: "Russian Hill",
        lat: 37.8021, lng: -122.4187, gridRow: 9, gridCol: 5,
        buildingHeight: 2, buildingStyle: "small" as const,
        currentBid: 280, color: "#E11D48",
      },
      {
        name: "Palace of Fine Arts", neighborhood: "Marina",
        lat: 37.8029, lng: -122.4484, gridRow: 9, gridCol: 7,
        buildingHeight: 3, buildingStyle: "tower" as const,
        currentBid: 310, color: "#D97706",
      },
    ];

    for (const spot of spots) {
      await ctx.db.insert("spots", spot);
    }
    return `Seeded ${spots.length} spots`;
  },
});

// Reset — clears all data so you can re-seed
export const resetSpots = mutation({
  args: {},
  handler: async (ctx) => {
    const spots = await ctx.db.query("spots").collect();
    const bids = await ctx.db.query("bids").collect();
    for (const b of bids) await ctx.db.delete(b._id);
    for (const s of spots) await ctx.db.delete(s._id);
    return `Deleted ${spots.length} spots and ${bids.length} bids`;
  },
});
