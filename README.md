# 🏙️ SF 3D Ad World

A real-time 3D virtual city of San Francisco where companies bid on famous landmark spots to advertise. Built with LEGO-style isometric buildings on a real SF map.

## Features

- **3D LEGO City** — Isometric buildings with windows, doors, and roof studs placed at real SF landmark coordinates
- **Real-time Bidding** — Powered by Convex for instant updates across all viewers
- **Ad Billboards** — Highest bidder's company name, tagline, and website link appear on the map
- **Animated World** — Helicopters circling, cars driving streets, boats cruising the bay
- **Search & Filter** — Find spots by name, neighborhood, or advertiser
- **Fly-to Navigation** — Click any spot to smoothly fly the camera there

## Tech Stack

- **Frontend:** React + TypeScript + Vite
- **3D Rendering:** Three.js (custom layer inside MapLibre GL JS)
- **Map:** MapLibre GL JS + OpenFreeMap tiles (no API key needed)
- **Backend:** Convex (real-time database, mutations, queries)

## Getting Started

```bash
npm install
npx convex dev    # Start Convex backend
npm run dev       # Start Vite dev server
```

Open http://localhost:5173 and click "Launch City" to seed the database with SF landmarks.

## How It Works

1. Famous SF spots (Transamerica Pyramid, Salesforce Tower, Golden Gate, etc.) are placed on the map
2. Anyone can bid on a spot — highest bidder wins the ad placement
3. Winners get a billboard on the 3D map showing their company, tagline, and a clickable link to their website
4. All bids sync in real-time via Convex

## License

MIT
