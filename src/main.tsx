import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { setWorkerUrl } from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "./styles.css";

// Vite needs an explicit URL for MapLibre's module worker in a production
// bundle. Without it, vector tiles can silently fail after static deployment.
setWorkerUrl(maplibreWorkerUrl);

const convexUrl = import.meta.env.VITE_CONVEX_URL as string;

const convex = new ConvexReactClient(convexUrl);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexProvider client={convex}>
      <App />
    </ConvexProvider>
  </React.StrictMode>
);
