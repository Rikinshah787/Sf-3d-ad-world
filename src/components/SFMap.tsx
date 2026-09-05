import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import * as maplibregl from "maplibre-gl";
import * as THREE from "three";
import "maplibre-gl/dist/maplibre-gl.css";

export interface Spot {
  _id: string;
  name: string;
  neighborhood: string;
  lat: number;
  lng: number;
  currentBid: number;
  highestBidder?: string;
  buildingHeight: number;
  color?: string;
  adCompany?: string;
  adWebsite?: string;
  adTagline?: string;
}

interface Props {
  spots: Spot[];
  onSpotClick: (spot: Spot) => void;
  highlightId?: string | null;
}

export interface SFMapHandle {
  flyTo: (lng: number, lat: number) => void;
}

/* ── Shared geometry pool ──────────────────────────── */
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  stud: new THREE.CylinderGeometry(0.14, 0.14, 0.22, 6),
  sphere: new THREE.SphereGeometry(0.15, 6, 4),
};

/* ── LEGO building with windows ────────────────────── */
function createLegoBuilding(height: number, color: string, ms: number): THREE.Group {
  const g = new THREE.Group();
  const s = ms * 30;
  const floorH = 0.6;
  const totalH = height * floorH;

  // Green baseplate
  const plate = new THREE.Mesh(G.box, new THREE.MeshLambertMaterial({ color: "#A8D5A2" }));
  plate.scale.set(1.7 * s, 0.06 * s, 1.7 * s);
  plate.position.y = -0.03 * s;
  g.add(plate);

  // Yellow LEGO base
  const base = new THREE.Mesh(G.box, new THREE.MeshLambertMaterial({ color: "#F2D052" }));
  base.scale.set(1.15 * s, 0.16 * s, 1.15 * s);
  base.position.y = 0.08 * s;
  g.add(base);

  // Main walls
  const wallMat = new THREE.MeshLambertMaterial({ color });
  const wall = new THREE.Mesh(G.box, wallMat);
  wall.scale.set(1.0 * s, totalH * s, 1.0 * s);
  wall.position.y = (0.16 + totalH / 2) * s;
  g.add(wall);

  // Window rows (darker insets on two sides)
  const winColor = new THREE.Color(color).multiplyScalar(0.6).getHexString();
  const winMat = new THREE.MeshLambertMaterial({ color: `#${winColor}` });
  const rows = Math.min(height, 5);
  for (let r = 0; r < rows; r++) {
    const wy = (0.16 + floorH * r + floorH * 0.45) * s;
    // Front windows
    for (let w = -1; w <= 1; w += 2) {
      const win = new THREE.Mesh(G.box, winMat);
      win.scale.set(0.18 * s, 0.15 * s, 0.06 * s);
      win.position.set(w * 0.22 * s, wy, 0.52 * s);
      g.add(win);
    }
    // Side windows
    for (let w = -1; w <= 1; w += 2) {
      const win = new THREE.Mesh(G.box, winMat);
      win.scale.set(0.06 * s, 0.15 * s, 0.18 * s);
      win.position.set(0.52 * s, wy, w * 0.22 * s);
      g.add(win);
    }
  }

  // Trim bands
  const trimMat = new THREE.MeshLambertMaterial({ color: "#E87461" });
  const trim = new THREE.Mesh(G.box, trimMat);
  trim.scale.set(1.06 * s, 0.06 * s, 1.06 * s);
  trim.position.y = (0.16 + totalH) * s;
  g.add(trim);

  // Roof studs (2x2 grid)
  const studMat = new THREE.MeshLambertMaterial({ color: "#2D5A3E" });
  const sp = 0.28 * s;
  for (let x = -1; x <= 1; x += 2) {
    for (let z = -1; z <= 1; z += 2) {
      const stud = new THREE.Mesh(G.stud, studMat);
      stud.scale.set(s, s, s);
      stud.position.set(x * sp * 0.5, (0.16 + totalH + 0.12) * s, z * sp * 0.5);
      g.add(stud);
    }
  }

  // Door (front, ground floor)
  const doorMat = new THREE.MeshLambertMaterial({ color: "#8B4513" });
  const door = new THREE.Mesh(G.box, doorMat);
  door.scale.set(0.2 * s, 0.25 * s, 0.04 * s);
  door.position.set(0, (0.16 + 0.125) * s, 0.52 * s);
  g.add(door);

  return g;
}

/* ── Helicopter ──────────────────────────────────── */
function createHelicopter(color: string): THREE.Group {
  const h = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(G.box, mat);
  body.scale.set(0.6, 0.25, 0.25);
  h.add(body);
  const cabin = new THREE.Mesh(G.sphere, new THREE.MeshLambertMaterial({ color: "#88ccff", transparent: true, opacity: 0.6 }));
  cabin.position.set(0.2, 0.1, 0);
  h.add(cabin);
  const tail = new THREE.Mesh(G.box, mat);
  tail.scale.set(0.5, 0.08, 0.08);
  tail.position.set(-0.5, 0.05, 0);
  h.add(tail);
  const fin = new THREE.Mesh(G.box, mat);
  fin.scale.set(0.04, 0.18, 0.14);
  fin.position.set(-0.7, 0.12, 0);
  h.add(fin);
  const rotor = new THREE.Mesh(G.box, new THREE.MeshLambertMaterial({ color: "#333", transparent: true, opacity: 0.35 }));
  rotor.scale.set(1.4, 0.02, 0.06);
  rotor.position.y = 0.2;
  rotor.userData.isRotor = true;
  h.add(rotor);
  const skid = new THREE.Mesh(G.box, new THREE.MeshLambertMaterial({ color: "#333" }));
  skid.scale.set(0.5, 0.02, 0.28);
  skid.position.y = -0.14;
  h.add(skid);
  return h;
}

/* ── Car ─────────────────────────────────────────── */
function createCar(color: string): THREE.Group {
  const c = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(G.box, mat);
  body.scale.set(0.35, 0.1, 0.18);
  c.add(body);
  const cab = new THREE.Mesh(G.box, new THREE.MeshLambertMaterial({ color: "#88ccff", transparent: true, opacity: 0.5 }));
  cab.scale.set(0.18, 0.08, 0.16);
  cab.position.set(0.02, 0.08, 0);
  c.add(cab);
  const axle = new THREE.Mesh(G.box, new THREE.MeshLambertMaterial({ color: "#222" }));
  axle.scale.set(0.3, 0.04, 0.2);
  axle.position.y = -0.06;
  c.add(axle);
  return c;
}

/* ── Boat ────────────────────────────────────────── */
function createBoat(color: string): THREE.Group {
  const b = new THREE.Group();
  const hull = new THREE.Mesh(G.box, new THREE.MeshLambertMaterial({ color }));
  hull.scale.set(0.5, 0.08, 0.2);
  b.add(hull);
  const cabin = new THREE.Mesh(G.box, new THREE.MeshLambertMaterial({ color: "#fff" }));
  cabin.scale.set(0.15, 0.12, 0.14);
  cabin.position.set(-0.05, 0.1, 0);
  b.add(cabin);
  return b;
}

/* ── Animation configs ───────────────────────────── */
const HELI_PATHS = [
  { center: [-122.41, 37.79] as [number, number], radius: 0.008, alt: 250, speed: 0.3, color: "#EF4444" },
  { center: [-122.42, 37.78] as [number, number], radius: 0.006, alt: 200, speed: -0.25, color: "#3B82F6" },
  { center: [-122.43, 37.80] as [number, number], radius: 0.01, alt: 300, speed: 0.2, color: "#F59E0B" },
];

const CAR_ROUTES = [
  { from: [-122.4194, 37.772] as [number, number], to: [-122.4194, 37.805] as [number, number], speed: 0.15, color: "#EF4444" },
  { from: [-122.435, 37.785] as [number, number], to: [-122.39, 37.785] as [number, number], speed: 0.12, color: "#3B82F6" },
  { from: [-122.41, 37.775] as [number, number], to: [-122.41, 37.80] as [number, number], speed: 0.18, color: "#10B981" },
  { from: [-122.425, 37.79] as [number, number], to: [-122.395, 37.79] as [number, number], speed: 0.1, color: "#F97316" },
  { from: [-122.405, 37.77] as [number, number], to: [-122.405, 37.81] as [number, number], speed: 0.14, color: "#8B5CF6" },
];

const BOAT_ROUTES = [
  { from: [-122.385, 37.795] as [number, number], to: [-122.385, 37.810] as [number, number], speed: 0.06, color: "#1E40AF" },
  { from: [-122.380, 37.790] as [number, number], to: [-122.395, 37.805] as [number, number], speed: 0.04, color: "#DC2626" },
];

/* ── Component ───────────────────────────────────── */
const SFMap = forwardRef<SFMapHandle, Props>(({ spots, onSpotClick, highlightId }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const onSpotClickRef = useRef(onSpotClick);
  const [ready, setReady] = useState(false);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const animRef = useRef<{ helis: THREE.Group[]; cars: THREE.Group[]; boats: THREE.Group[] }>({ helis: [], cars: [], boats: [] });
  const startTimeRef = useRef(performance.now());

  onSpotClickRef.current = onSpotClick;

  // Expose flyTo to parent
  useImperativeHandle(ref, () => ({
    flyTo(lng: number, lat: number) {
      mapRef.current?.flyTo({ center: [lng, lat], zoom: 17, pitch: 60, bearing: -17.6, duration: 1500 });
    },
  }));

  /* ── Init map + Three.js custom layer ───── */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [-122.4094, 37.7849],
      zoom: 14.5,
      pitch: 55,
      bearing: -17.6,
      maxPitch: 70,
    } as any);

    map.on("load", () => {
      const scene = new THREE.Scene();
      sceneRef.current = scene;

      // Warm sunset-ish lighting
      scene.add(new THREE.AmbientLight(0xfff5e6, 0.8));
      const sun = new THREE.DirectionalLight(0xffffff, 0.75);
      sun.position.set(2, 3, 1);
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0xffd4a8, 0.35);
      fill.position.set(-1, 1, -0.5);
      scene.add(fill);

      const refMerc = maplibregl.MercatorCoordinate.fromLngLat([-122.4194, 37.7749], 0);
      const mScale = refMerc.meterInMercatorCoordinateUnits();

      // Helicopters
      HELI_PATHS.forEach((p) => {
        const h = createHelicopter(p.color);
        const s = mScale * 40;
        h.scale.set(s, s, s);
        scene.add(h);
        animRef.current.helis.push(h);
      });

      // Cars
      CAR_ROUTES.forEach((r) => {
        const c = createCar(r.color);
        const s = mScale * 25;
        c.scale.set(s, s, s);
        scene.add(c);
        animRef.current.cars.push(c);
      });

      // Boats in the bay
      BOAT_ROUTES.forEach((r) => {
        const b = createBoat(r.color);
        const s = mScale * 35;
        b.scale.set(s, s, s);
        scene.add(b);
        animRef.current.boats.push(b);
      });

      const camera = new THREE.Camera();
      let renderer: THREE.WebGLRenderer;

      const customLayer: maplibregl.CustomLayerInterface = {
        id: "lego-world",
        type: "custom",
        renderingMode: "3d",
        onAdd(_map, gl) {
          renderer = new THREE.WebGLRenderer({ canvas: _map.getCanvas(), context: gl as any, antialias: true });
          renderer.autoClear = false;
          startTimeRef.current = performance.now();
        },
        render(_gl, args: any) {
          const mat = args.defaultProjectionData?.mainMatrix || args.projMatrix || args.projectionMatrix;
          if (!mat) return;
          if (mat.elements) camera.projectionMatrix.copy(mat);
          else if (Array.isArray(mat)) camera.projectionMatrix.fromArray(mat);
          else if (typeof mat === "object" && mat[0] !== undefined) camera.projectionMatrix.fromArray(Array.from(mat));

          const t = (performance.now() - startTimeRef.current) / 1000;

          // Helicopters
          for (let i = 0; i < HELI_PATHS.length; i++) {
            const heli = animRef.current.helis[i];
            if (!heli) continue;
            const p = HELI_PATHS[i];
            const angle = t * p.speed;
            const lng = p.center[0] + Math.cos(angle) * p.radius;
            const lat = p.center[1] + Math.sin(angle) * p.radius;
            const merc = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], p.alt);
            heli.position.set(merc.x, merc.y, merc.z || 0);
            heli.rotation.set(Math.PI / 2, 0, -angle - Math.PI / 2);
            const rotor = heli.children[4];
            if (rotor) rotor.rotation.y = t * 20;
          }

          // Cars
          for (let i = 0; i < CAR_ROUTES.length; i++) {
            const car = animRef.current.cars[i];
            if (!car) continue;
            const r = CAR_ROUTES[i];
            const progress = (t * r.speed) % 2;
            const p = progress > 1 ? 2 - progress : progress;
            const lng = r.from[0] + (r.to[0] - r.from[0]) * p;
            const lat = r.from[1] + (r.to[1] - r.from[1]) * p;
            const merc = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], 0);
            car.position.set(merc.x, merc.y, merc.z || 0);
            const dir = Math.atan2(r.to[1] - r.from[1], r.to[0] - r.from[0]);
            car.rotation.set(Math.PI / 2, 0, progress > 1 ? -dir + Math.PI : -dir);
          }

          // Boats (bob gently)
          for (let i = 0; i < BOAT_ROUTES.length; i++) {
            const boat = animRef.current.boats[i];
            if (!boat) continue;
            const r = BOAT_ROUTES[i];
            const progress = (t * r.speed) % 2;
            const p = progress > 1 ? 2 - progress : progress;
            const lng = r.from[0] + (r.to[0] - r.from[0]) * p;
            const lat = r.from[1] + (r.to[1] - r.from[1]) * p;
            const merc = maplibregl.MercatorCoordinate.fromLngLat([lng, lat], 2);
            boat.position.set(merc.x, merc.y, merc.z || 0);
            const dir = Math.atan2(r.to[1] - r.from[1], r.to[0] - r.from[0]);
            boat.rotation.set(Math.PI / 2 + Math.sin(t * 1.5 + i) * 0.05, 0, progress > 1 ? -dir + Math.PI : -dir);
          }

          renderer.resetState();
          renderer.render(scene, camera);
          map.triggerRepaint();
        },
      };

      map.addLayer(customLayer);

      // Smooth intro zoom
      setTimeout(() => {
        map.flyTo({ center: [-122.4094, 37.7849], zoom: 15.2, pitch: 58, duration: 3000 });
      }, 500);

      setReady(true);
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  /* ── Place buildings + markers ──────────── */
  useEffect(() => {
    if (!mapRef.current || !ready || !sceneRef.current) return;
    const map = mapRef.current;
    const scene = sceneRef.current;

    const keep = 3 + HELI_PATHS.length + CAR_ROUTES.length + BOAT_ROUTES.length;
    while (scene.children.length > keep) scene.remove(scene.children[scene.children.length - 1]);

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const refMerc = maplibregl.MercatorCoordinate.fromLngLat([-122.4194, 37.7749], 0);
    const meterScale = refMerc.meterInMercatorCoordinateUnits();

    spots.forEach((spot) => {
      const merc = maplibregl.MercatorCoordinate.fromLngLat([spot.lng, spot.lat], 0);
      const color = spot.color || "#4ECDC4";

      const building = createLegoBuilding(spot.buildingHeight, color, meterScale);
      building.position.set(merc.x, merc.y, merc.z || 0);
      building.rotation.x = Math.PI / 2;
      scene.add(building);

      // Marker
      const hasAd = !!spot.adCompany;
      const isHighlighted = spot._id === highlightId;
      const el = document.createElement("div");
      el.className = "spot-marker";
      el.style.cssText = `cursor:pointer;user-select:none;transition:transform .25s,filter .25s;${isHighlighted ? "transform:scale(1.25) translateY(-6px);filter:drop-shadow(0 0 12px gold);" : ""}`;

      if (hasAd) {
        el.innerHTML = `<div style="
          background:linear-gradient(135deg,#fff 0%,#f8faff 100%);
          border-radius:16px;padding:10px 16px;
          box-shadow:0 6px 24px rgba(0,0,0,.18);
          min-width:110px;text-align:center;
          border:2.5px solid ${color};
          backdrop-filter:blur(8px);
        ">
          <div style="font-size:14px;font-weight:800;color:#111;letter-spacing:-.3px">${spot.adCompany}</div>
          ${spot.adTagline ? `<div style="font-size:9.5px;color:#777;margin-top:2px;line-height:1.3">${spot.adTagline}</div>` : ""}
          <div style="margin-top:6px;display:flex;align-items:center;justify-content:center;gap:6px">
            <span style="font-size:13px;font-weight:800;color:#4F46E5">$${spot.currentBid}</span>
            ${spot.adWebsite ? `<a href="${spot.adWebsite}" target="_blank" rel="noopener" style="
              font-size:10px;color:#fff;background:#4F46E5;
              padding:3px 8px;border-radius:6px;text-decoration:none;font-weight:700;
            ">Visit ↗</a>` : ""}
          </div>
        </div>`;
      } else {
        el.innerHTML = `<div style="
          background:${color};color:#fff;font-weight:800;
          font-size:11px;padding:6px 14px;border-radius:20px;
          box-shadow:0 4px 14px rgba(0,0,0,.22),0 0 0 2.5px #fff;
          white-space:nowrap;letter-spacing:.3px;
        ">$${spot.currentBid} · Bid Now</div>`;
      }

      el.onmouseenter = () => { if (!isHighlighted) el.style.transform = "scale(1.12) translateY(-4px)"; };
      el.onmouseleave = () => { if (!isHighlighted) el.style.transform = ""; };
      el.onclick = (e) => { e.stopPropagation(); onSpotClickRef.current(spot); };

      const marker = new maplibregl.Marker({ element: el }).setLngLat([spot.lng, spot.lat]).addTo(map);
      markersRef.current.push(marker);
    });

    map.triggerRepaint();
  }, [spots, ready, highlightId]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
});

SFMap.displayName = "SFMap";
export default SFMap;
