import { mutation } from "./_generated/server";

export const seedSpots = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("spots").collect();
    if (existing.length > 0) return "Already seeded";

    const spots = [
      // ── Iconic Skyscrapers ─────────────────────
      {
        name: "Transamerica Pyramid", neighborhood: "Financial District",
        lat: 37.7952, lng: -122.4028, gridRow: 0, gridCol: 2,
        buildingHeight: 7, buildingStyle: "pyramid" as const,
        currentBid: 10, color: "#E8E4DE", // Real: White quartz aggregate concrete
        category: "Skyscraper", impressions: 142000, prestigeScore: 9.8,
      },
      {
        name: "Salesforce Tower", neighborhood: "SoMa",
        lat: 37.7897, lng: -122.3969, gridRow: 0, gridCol: 7,
        buildingHeight: 8, buildingStyle: "skyscraper" as const,
        currentBid: 10, color: "#7BA7C9", // Real: Blue-grey reflective glass
        category: "Skyscraper", impressions: 185000, prestigeScore: 9.9,
      },

      // ── Historic Landmarks ─────────────────────
      {
        name: "Coit Tower", neighborhood: "Telegraph Hill",
        lat: 37.8024, lng: -122.4058, gridRow: 2, gridCol: 0,
        buildingHeight: 4.5, buildingStyle: "tower" as const,
        currentBid: 10, color: "#C9B99A", // Real: Unpainted reinforced concrete, warm buff
        category: "Landmark", impressions: 88000, prestigeScore: 9.1,
      },
      {
        name: "Ferry Building", neighborhood: "Embarcadero",
        lat: 37.7956, lng: -122.3935, gridRow: 2, gridCol: 2,
        buildingHeight: 3.5, buildingStyle: "clocktower" as const,
        currentBid: 10, color: "#C4A882", // Real: Colusa sandstone, warm sand/beige
        category: "Waterfront", impressions: 120000, prestigeScore: 9.5,
      },
      {
        name: "Golden Gate Bridge Vista", neighborhood: "Presidio",
        lat: 37.8199, lng: -122.4783, gridRow: 7, gridCol: 0,
        buildingHeight: 6, buildingStyle: "bridge" as const,
        currentBid: 10, color: "#C1272D", // Real: International Orange vermillion
        category: "Landmark", impressions: 210000, prestigeScore: 10.0,
      },

      // ── Waterfront & Sports ────────────────────
      {
        name: "Oracle Park", neighborhood: "South Beach",
        lat: 37.7786, lng: -122.3893, gridRow: 2, gridCol: 7,
        buildingHeight: 3, buildingStyle: "wide" as const,
        currentBid: 10, color: "#8B4513", // Real: Red-brick and steel
        category: "Waterfront", impressions: 95000, prestigeScore: 8.9,
      },
      {
        name: "Pier 39", neighborhood: "Fisherman's Wharf",
        lat: 37.8087, lng: -122.4098, gridRow: 2, gridCol: 9,
        buildingHeight: 2.2, buildingStyle: "small" as const,
        currentBid: 10, color: "#4A7C59", // Real: Weathered green-painted timber pier
        category: "Waterfront", impressions: 110000, prestigeScore: 9.0,
      },
      {
        name: "Ghirardelli Square", neighborhood: "Fisherman's Wharf",
        lat: 37.8060, lng: -122.4230, gridRow: 7, gridCol: 5,
        buildingHeight: 3, buildingStyle: "wide" as const,
        currentBid: 10, color: "#8B3A3A", // Real: Dark red-brick Victorian facade
        category: "Waterfront", impressions: 59000, prestigeScore: 8.1,
      },

      // ── Civic & Cultural ───────────────────────
      {
        name: "City Hall", neighborhood: "Civic Center",
        lat: 37.7793, lng: -122.4193, gridRow: 5, gridCol: 2,
        buildingHeight: 5.5, buildingStyle: "tower" as const,
        currentBid: 10, color: "#D6CFC4", // Real: Light grey Manchurian granite + gold dome
        category: "Landmark", impressions: 72000, prestigeScore: 8.7,
      },
      {
        name: "SFMOMA", neighborhood: "SoMa",
        lat: 37.7857, lng: -122.4011, gridRow: 5, gridCol: 7,
        buildingHeight: 3.5, buildingStyle: "wide" as const,
        currentBid: 10, color: "#F5F5F5", // Real: White Snøhetta rippled facade
        category: "Culture", impressions: 81000, prestigeScore: 8.8,
      },
      {
        name: "Grace Cathedral", neighborhood: "Nob Hill",
        lat: 37.7914, lng: -122.4130, gridRow: 9, gridCol: 2,
        buildingHeight: 4.5, buildingStyle: "tower" as const,
        currentBid: 10, color: "#A09080", // Real: Warm grey reinforced concrete, Gothic
        category: "Landmark", impressions: 45000, prestigeScore: 8.0,
      },
      {
        name: "Palace of Fine Arts", neighborhood: "Marina",
        lat: 37.8029, lng: -122.4484, gridRow: 9, gridCol: 7,
        buildingHeight: 3.5, buildingStyle: "tower" as const,
        currentBid: 10, color: "#D4A574", // Real: Warm terracotta/Roman-inspired rose
        category: "Landmark", impressions: 71000, prestigeScore: 8.8,
      },

      // ── Downtown & Neighborhoods ───────────────
      {
        name: "Painted Ladies", neighborhood: "Alamo Square",
        lat: 37.7762, lng: -122.4328, gridRow: 7, gridCol: 2,
        buildingHeight: 2.3, buildingStyle: "small" as const,
        currentBid: 10, color: "#8FAADC", // Real: Pastel blue (most famous row house)
        category: "Culture", impressions: 65000, prestigeScore: 8.4,
      },
      {
        name: "Union Square", neighborhood: "Downtown",
        lat: 37.7879, lng: -122.4074, gridRow: 7, gridCol: 7,
        buildingHeight: 4, buildingStyle: "tower" as const,
        currentBid: 10, color: "#708090", // Real: Modern slate-glass commercial tower
        category: "Skyscraper", impressions: 135000, prestigeScore: 9.3,
      },
      {
        name: "Moscone Center", neighborhood: "SoMa",
        lat: 37.7840, lng: -122.4006, gridRow: 7, gridCol: 9,
        buildingHeight: 2.5, buildingStyle: "wide" as const,
        currentBid: 10, color: "#607080", // Real: Modern grey steel & glass convention center
        category: "Landmark", impressions: 98000, prestigeScore: 8.9,
      },
      {
        name: "Lombard Street", neighborhood: "Russian Hill",
        lat: 37.8021, lng: -122.4187, gridRow: 9, gridCol: 5,
        buildingHeight: 2, buildingStyle: "small" as const,
        currentBid: 10, color: "#B85C5C", // Real: Red brick retaining walls flanking the zigzag
        category: "Landmark", impressions: 78000, prestigeScore: 8.6,
      },
    ];

    for (const spot of spots) {
      await ctx.db.insert("spots", spot);
    }
    return `Seeded ${spots.length} fresh spots — all starting at $10!`;

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
