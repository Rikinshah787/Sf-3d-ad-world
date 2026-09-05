import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";
import * as maplibregl from "maplibre-gl";
import * as THREE from "three";
import "maplibre-gl/dist/maplibre-gl.css";
import { soundFX } from "../lib/sound";

export type MapTheme = "day" | "sunset" | "night";

export interface Spot {
  _id: string;
  name: string;
  neighborhood: string;
  lat: number;
  lng: number;
  currentBid: number;
  highestBidder?: string;
  buildingHeight: number;
  buildingStyle?: "tower" | "wide" | "skyscraper" | "small" | "pyramid" | "clocktower" | "bridge";
  color?: string;
  adCompany?: string;
  adWebsite?: string;
  adTagline?: string;
  logoUrl?: string;
  impressions?: number;
  prestigeScore?: number;
  category?: string;
}

interface Props {
  spots: Spot[];
  onSpotClick: (spot: Spot) => void;
  highlightId?: string | null;
  theme?: MapTheme;
}

export type PresetView = "overview" | "downtown" | "financial" | "waterfront" | "goldengate" | "cardrive" | "transamericacar";

export interface SFMapHandle {
  flyTo: (lng: number, lat: number) => void;
  flyToPreset: (preset: PresetView) => void;
}

/* ── Shared geometry pool ────────────────────────── */
let _geo: {
  box: THREE.BoxGeometry;
  stud: THREE.CylinderGeometry;
  sphere: THREE.SphereGeometry;
  cylinder: THREE.CylinderGeometry;
  cone: THREE.ConeGeometry;
} | null = null;

function getGeo() {
  if (!_geo) {
    _geo = {
      box: new THREE.BoxGeometry(1, 1, 1),
      stud: new THREE.CylinderGeometry(0.14, 0.14, 0.22, 8),
      sphere: new THREE.SphereGeometry(0.15, 8, 6),
      cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
      cone: new THREE.ConeGeometry(0.5, 1, 4),
    };
  }
  return _geo;
}

/* ── Shared materials cache ──────────────────────── */
const MAT_CACHE: Record<string, THREE.MeshStandardMaterial> = {};
function mat(color: string, opts?: { transparent?: boolean; opacity?: number; emissive?: string; emissiveIntensity?: number; roughness?: number; metalness?: number }): THREE.MeshStandardMaterial {
  const r = opts?.roughness ?? 0.4;
  const m = opts?.metalness ?? 0.2;
  const key = `${color}_${opts?.transparent ?? false}_${opts?.opacity ?? 1}_${opts?.emissive ?? "#000"}_${opts?.emissiveIntensity ?? 0}_${r}_${m}`;
  if (!MAT_CACHE[key]) {
    MAT_CACHE[key] = new THREE.MeshStandardMaterial({
      color,
      transparent: opts?.transparent ?? false,
      opacity: opts?.opacity ?? 1,
      emissive: opts?.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0x000000),
      emissiveIntensity: opts?.emissiveIntensity ?? 0,
      roughness: r,
      metalness: m,
    });
  }
  return MAT_CACHE[key];
}

/**
 * Billboard faces are often viewed at a steep angle. Rendering their canvas at
 * 2x and using mipmaps/anisotropic filtering keeps copy legible instead of
 * softening it into the street texture below.
 */
function createSharpCanvasTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * The generic vector-building mesh gives the overview its city scale, but at
 * close zoom levels it turns into large flat facades that hide the branded 3D
 * landmarks. Fade it out as the visitor moves in so the view stays legible.
 */
function extrusionOpacityForTheme(theme: MapTheme) {
  const overviewOpacity = theme === "night" ? 0.78 : theme === "sunset" ? 0.68 : 0.64;
  return [
    "interpolate", ["linear"], ["zoom"],
    13, overviewOpacity * 0.7,
    15.5, overviewOpacity,
    16.55, overviewOpacity * 0.45,
    17.25, 0,
  ];
}

/* ── LEGO & Architectural Buildings ───────────────────────── */
function createLegoBuilding(spot: Spot, ms: number, theme: MapTheme): THREE.Group {
  const G = getGeo();
  const g = new THREE.Group();
  const s = ms * 30;
  const height = spot.buildingHeight;
  const color = spot.color || "#B0B0B0";
  const style = spot.buildingStyle || "tower";
  const isNight = theme === "night";
  const isSunset = theme === "sunset";

  // Derive realistic shade & highlight from base color
  const darkCol = "#" + new THREE.Color(color).clone().multiplyScalar(0.45).getHexString();
  const lightCol = "#" + new THREE.Color(color).clone().lerp(new THREE.Color("#ffffff"), 0.3).getHexString();
  const shadowCol = "#" + new THREE.Color(color).clone().multiplyScalar(0.65).getHexString();

  // Realistic window glass (warm amber glow at night, dark tinted during day)
  const winEmissive = isNight ? "#FFBF50" : "#000000";
  const winIntensity = isNight ? 1.2 : 0;
  const windowTint = isNight ? "#1A1A2E" : "#1C2B3A"; // Dark blue-grey glass

  // Baseplate: realistic urban sidewalk concrete
  const baseColor = isNight ? "#2A2A35" : "#C4B99A"; // Warm concrete/sandstone base
  const plateColor = isNight ? "#1A1E2E" : isSunset ? "#7A8A5A" : "#6B8E50"; // realistic grass
  const plateMat = mat(plateColor, { roughness: 0.9, metalness: 0.0 });

  const hasAd = !!spot.adCompany;
  const adGlow = hasAd ? (isNight ? 0.7 : 0.1) : 0;

  // ── Realistic grass/park baseplate (Raised to avoid glitchy map z-fighting) ──
  const plate = new THREE.Mesh(G.box, plateMat);
  plate.scale.set(2.2 * s, 0.05 * s, 2.2 * s);
  plate.position.y = 0.025 * s;
  g.add(plate);

  // Sidewalk border around baseplate
  const sidewalk = new THREE.Mesh(G.box, mat(isNight ? "#333340" : "#D1C9B8", { roughness: 0.85, metalness: 0 }));
  sidewalk.scale.set(2.3 * s, 0.03 * s, 2.3 * s);
  sidewalk.position.y = 0.015 * s;
  g.add(sidewalk);

  // ── Helper: window grid on a face ─────────────
  const addWindowGrid = (
    faceDir: "front" | "back" | "left" | "right",
    wallW: number, wallH: number, wallBaseY: number,
    rows: number, cols: number
  ) => {
    const winW = (wallW * 0.8) / cols;
    const winH = (wallH * 0.7) / rows;
    const gapX = (wallW * 0.8) / cols;
    const gapY = (wallH * 0.7) / rows;
    const startX = -(gapX * (cols - 1)) / 2;
    const startY = wallBaseY + 0.05 * s + wallH * 0.18;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wx = startX + c * gapX;
        const wy = startY + r * gapY;
        const win = new THREE.Mesh(G.box, mat(windowTint, {
          emissive: winEmissive, emissiveIntensity: winIntensity,
          roughness: 0.05, metalness: 0.75,
        }));

        const depth = 0.025 * s;
        const ww = winW * 0.7;
        const wh = winH * 0.65;
        if (faceDir === "front") {
          win.scale.set(ww, wh, depth);
          win.position.set(wx, wy, (wallW / 2 + 0.01) * 1.0);
        } else if (faceDir === "back") {
          win.scale.set(ww, wh, depth);
          win.position.set(wx, wy, -(wallW / 2 + 0.01) * 1.0);
        } else if (faceDir === "left") {
          win.scale.set(depth, wh, ww);
          win.position.set(-(wallW / 2 + 0.01) * 1.0, wy, wx);
        } else {
          win.scale.set(depth, wh, ww);
          win.position.set((wallW / 2 + 0.01) * 1.0, wy, wx);
        }
        g.add(win);
      }
    }
  };

  // ── Helper: add 2x2 LEGO rooftop studs ────────
  const addRoofStuds = (roofY: number, studColor: string) => {
    const sp = 0.26 * s;
    for (let x = -1; x <= 1; x += 2) {
      for (let z = -1; z <= 1; z += 2) {
        const stud = new THREE.Mesh(G.stud, mat(studColor, { emissive: isNight ? studColor : "#000", emissiveIntensity: isNight ? 0.9 : 0 }));
        stud.scale.set(s, s, s);
        stud.position.set(x * sp * 0.5, roofY, z * sp * 0.5);
        g.add(stud);
      }
    }
  };

  let bbRoofY = 1.0 * s;

  // ═══════════════════════════════════════════════
  //  PYRAMID — Transamerica-style tapering tower
  // ═══════════════════════════════════════════════
  if (style === "pyramid") {
    const totalH = height * 0.75;
    bbRoofY = (0.22 + 4 * (totalH * 0.15) + totalH * 0.4) * s;

    // Broad square base lobby (2 tiers)
    const lobby = new THREE.Mesh(G.box, mat(darkCol));
    lobby.scale.set(1.6 * s, 0.2 * s, 1.6 * s);
    lobby.position.y = 0.1 * s;
    g.add(lobby);

    const lobbyTrim = new THREE.Mesh(G.box, mat(lightCol));
    lobbyTrim.scale.set(1.65 * s, 0.04 * s, 1.65 * s);
    lobbyTrim.position.y = 0.21 * s;
    g.add(lobbyTrim);

    // Setback tiers — 4 decreasing floors
    const tiers = 4;
    const tierH = totalH * 0.15;
    let curW = 1.3;
    for (let t = 0; t < tiers; t++) {
      const tier = new THREE.Mesh(G.box, mat(color, { emissive: winEmissive, emissiveIntensity: isNight ? 0.15 : 0 }));
      const y0 = 0.22 + t * tierH;
      tier.scale.set(curW * s, tierH * s, curW * s);
      tier.position.y = (y0 + tierH / 2) * s;
      g.add(tier);

      // Floor separator band
      const band = new THREE.Mesh(G.box, mat(lightCol));
      band.scale.set((curW + 0.04) * s, 0.02 * s, (curW + 0.04) * s);
      band.position.y = (y0 + tierH) * s;
      g.add(band);

      // Window strips on front & side
      const winMat = mat("#0F172A", { emissive: winEmissive, emissiveIntensity: winIntensity, roughness: 0.1, metalness: 0.7 });
      const wh = tierH * 0.6 * s;
      const ww = curW * 0.75 * s;
      // Front
      const wf = new THREE.Mesh(G.box, winMat);
      wf.scale.set(ww, wh, 0.02 * s);
      wf.position.set(0, (y0 + tierH * 0.55) * s, (curW / 2 + 0.015) * s);
      g.add(wf);
      // Right
      const wr = new THREE.Mesh(G.box, winMat);
      wr.scale.set(0.02 * s, wh, ww);
      wr.position.set((curW / 2 + 0.015) * s, (y0 + tierH * 0.55) * s, 0);
      g.add(wr);

      curW *= 0.72;
    }

    // Pyramid cone core
    const coreTop = totalH * 0.35;
    const coreBaseY = 0.22 + tiers * tierH;
    const cone = new THREE.Mesh(G.cone, mat(color, { emissive: isNight ? color : "#000000", emissiveIntensity: isNight ? 0.25 : 0 }));
    cone.scale.set(curW * 1.5 * s, coreTop * s, curW * 1.5 * s);
    cone.position.y = (coreBaseY + coreTop / 2) * s;
    cone.rotation.y = Math.PI / 4;
    g.add(cone);

    // Antenna spire
    const spireH = totalH * 0.28;
    const spire = new THREE.Mesh(G.cylinder, mat("#CBD5E1", { emissive: "#818CF8", emissiveIntensity: isNight ? 1.2 : 0, metalness: 0.8, roughness: 0.1 }));
    spire.scale.set(0.06 * s, spireH * s, 0.06 * s);
    spire.position.y = (coreBaseY + coreTop + spireH / 2) * s;
    g.add(spire);

    // Blinking beacon
    const beacon = new THREE.Mesh(G.sphere, mat("#EF4444", { emissive: "#EF4444", emissiveIntensity: 1.5 }));
    beacon.scale.set(0.15 * s, 0.15 * s, 0.15 * s);
    beacon.position.y = (coreBaseY + coreTop + spireH) * s;
    g.add(beacon);

    // Observation deck ring
    const deckY = coreBaseY - 0.02;
    const deck = new THREE.Mesh(G.cylinder, mat("#94A3B8", { metalness: 0.6, roughness: 0.2 }));
    deck.scale.set(curW * 1.8 * s, 0.04 * s, curW * 1.8 * s);
    deck.position.y = deckY * s;
    g.add(deck);

    // ═══════════════════════════════════════════════
    //  SKYSCRAPER — Salesforce Tower style
    // ═══════════════════════════════════════════════
  } else if (style === "skyscraper") {
    const totalH = height * 0.8;
    bbRoofY = totalH * 0.95 * s;

    // Wide lobby entrance base
    const lobbyH = 0.25;
    const lobby = new THREE.Mesh(G.box, mat(darkCol, { metalness: 0.4, roughness: 0.3 }));
    lobby.scale.set(1.5 * s, lobbyH * s, 1.5 * s);
    lobby.position.y = (lobbyH / 2) * s;
    g.add(lobby);

    // Glass entrance
    const glass = new THREE.Mesh(G.box, mat("#38BDF8", { transparent: true, opacity: 0.5, roughness: 0.05, metalness: 0.9 }));
    glass.scale.set(0.5 * s, 0.18 * s, 0.03 * s);
    glass.position.set(0, 0.12 * s, 0.76 * s);
    g.add(glass);

    // Main cylindrical tower body — 3 sections tapering
    const sections = [
      { h: totalH * 0.45, r: 1.15, yStart: lobbyH },
      { h: totalH * 0.3, r: 1.0, yStart: lobbyH + totalH * 0.45 },
      { h: totalH * 0.15, r: 0.85, yStart: lobbyH + totalH * 0.75 },
    ];

    sections.forEach((sec, idx) => {
      const body = new THREE.Mesh(G.cylinder, mat(color, { roughness: 0.25, metalness: 0.35 }));
      body.scale.set(sec.r * s, sec.h * s, sec.r * s);
      body.position.y = (sec.yStart + sec.h / 2) * s;
      g.add(body);

      // Balcony / setback ring between sections
      if (idx < sections.length - 1) {
        const ring = new THREE.Mesh(G.cylinder, mat(lightCol, { metalness: 0.5, roughness: 0.2 }));
        ring.scale.set((sec.r + 0.1) * s, 0.04 * s, (sec.r + 0.1) * s);
        ring.position.y = (sec.yStart + sec.h) * s;
        g.add(ring);
      }

      // Vertical window strips (4 around cylinder)
      const wMat = mat("#0F172A", { emissive: winEmissive, emissiveIntensity: winIntensity, roughness: 0.05, metalness: 0.8 });
      for (let a = 0; a < 4; a++) {
        const angle = (a * Math.PI) / 2;
        const wStrip = new THREE.Mesh(G.box, wMat);
        const wW = sec.r * 0.35 * s;
        const wH = sec.h * 0.75 * s;
        const dist = sec.r * 0.52 * s;
        if (a % 2 === 0) {
          wStrip.scale.set(wW, wH, 0.02 * s);
          wStrip.position.set(Math.sin(angle) * dist, (sec.yStart + sec.h * 0.52) * s, Math.cos(angle) * dist);
        } else {
          wStrip.scale.set(0.02 * s, wH, wW);
          wStrip.position.set(Math.sin(angle) * dist, (sec.yStart + sec.h * 0.52) * s, Math.cos(angle) * dist);
        }
        g.add(wStrip);
      }
    });

    // Crown LED dome
    const crownY = lobbyH + totalH * 0.9;
    const crown = new THREE.Mesh(G.sphere, mat("#38BDF8", {
      emissive: "#38BDF8", emissiveIntensity: isNight ? 1.5 : 0.35,
      transparent: true, opacity: 0.85, roughness: 0.05, metalness: 0.9,
    }));
    crown.scale.set(0.8 * s, 0.4 * s, 0.8 * s);
    crown.position.y = crownY * s;
    g.add(crown);

    // Crown LED ring
    const ledRing = new THREE.Mesh(G.cylinder, mat("#6366F1", { emissive: "#6366F1", emissiveIntensity: isNight ? 1.2 : 0.3 }));
    ledRing.scale.set(0.9 * s, 0.03 * s, 0.9 * s);
    ledRing.position.y = (crownY - 0.15) * s;
    g.add(ledRing);

    // Rooftop antenna
    const ant = new THREE.Mesh(G.cylinder, mat("#94A3B8", { metalness: 0.8 }));
    ant.scale.set(0.04 * s, totalH * 0.12 * s, 0.04 * s);
    ant.position.y = (crownY + totalH * 0.06) * s;
    g.add(ant);

    // ═══════════════════════════════════════════════
    //  CLOCKTOWER — Ferry Building style
    // ═══════════════════════════════════════════════
  } else if (style === "clocktower") {
    const towerH = height * 0.65;

    // Long arcade base building
    const baseH = 0.35;
    const baseBody = new THREE.Mesh(G.box, mat(color, { roughness: 0.5 }));
    baseBody.scale.set(2.6 * s, baseH * s, 1.1 * s);
    baseBody.position.y = (baseH / 2) * s;
    g.add(baseBody);

    // Arcade arches along front (decorative pillars)
    for (let i = -3; i <= 3; i++) {
      const pillar = new THREE.Mesh(G.box, mat(lightCol));
      pillar.scale.set(0.06 * s, baseH * 0.7 * s, 0.04 * s);
      pillar.position.set(i * 0.35 * s, baseH * 0.42 * s, 0.56 * s);
      g.add(pillar);
    }

    // Cornice band
    const cornice = new THREE.Mesh(G.box, mat(lightCol));
    cornice.scale.set(2.7 * s, 0.05 * s, 1.15 * s);
    cornice.position.y = baseH * s;
    g.add(cornice);

    // Central tower (square, tapered)
    const twrW = 0.65;
    const twr = new THREE.Mesh(G.box, mat("#D4A76A", { roughness: 0.6 }));
    twr.scale.set(twrW * s, towerH * s, twrW * s);
    twr.position.y = (baseH + towerH / 2) * s;
    g.add(twr);

    // Tower window strips on 4 faces
    const twMat = mat("#1E293B", { emissive: winEmissive, emissiveIntensity: winIntensity, roughness: 0.1 });
    const twh = towerH * 0.5 * s;
    const tww = twrW * 0.5 * s;
    const off = (twrW / 2 + 0.01) * s;
    // Front
    const twf = new THREE.Mesh(G.box, twMat); twf.scale.set(tww, twh, 0.02 * s);
    twf.position.set(0, (baseH + towerH * 0.55) * s, off); g.add(twf);
    // Back
    const twb = new THREE.Mesh(G.box, twMat); twb.scale.set(tww, twh, 0.02 * s);
    twb.position.set(0, (baseH + towerH * 0.55) * s, -off); g.add(twb);
    // Left
    const twl = new THREE.Mesh(G.box, twMat); twl.scale.set(0.02 * s, twh, tww);
    twl.position.set(-off, (baseH + towerH * 0.55) * s, 0); g.add(twl);
    // Right
    const twr2 = new THREE.Mesh(G.box, twMat); twr2.scale.set(0.02 * s, twh, tww);
    twr2.position.set(off, (baseH + towerH * 0.55) * s, 0); g.add(twr2);

    // Clock faces on all 4 sides
    const clockY = baseH + towerH * 0.78;
    const clockR = 0.22;
    const clockDist = (twrW / 2 + 0.015) * s;
    const clockMat = mat("#FFFBEB", { emissive: "#FCD34D", emissiveIntensity: isNight ? 1.5 : 0.3, roughness: 0.2 });
    // Front
    const cf = new THREE.Mesh(G.cylinder, clockMat); cf.scale.set(clockR * s, 0.03 * s, clockR * s);
    cf.rotation.x = Math.PI / 2; cf.position.set(0, clockY * s, clockDist); g.add(cf);
    // Back
    const cb = new THREE.Mesh(G.cylinder, clockMat); cb.scale.set(clockR * s, 0.03 * s, clockR * s);
    cb.rotation.x = Math.PI / 2; cb.position.set(0, clockY * s, -clockDist); g.add(cb);
    // Left
    const cl = new THREE.Mesh(G.cylinder, clockMat); cl.scale.set(clockR * s, 0.03 * s, clockR * s);
    cl.rotation.z = Math.PI / 2; cl.position.set(-clockDist, clockY * s, 0); g.add(cl);
    // Right
    const cr = new THREE.Mesh(G.cylinder, clockMat); cr.scale.set(clockR * s, 0.03 * s, clockR * s);
    cr.rotation.z = Math.PI / 2; cr.position.set(clockDist, clockY * s, 0); g.add(cr);

    // Pointed roof spire
    const spireH = towerH * 0.35;
    const spire = new THREE.Mesh(G.cone, mat("#A0522D", { metalness: 0.4 }));
    spire.scale.set(0.45 * s, spireH * s, 0.45 * s);
    spire.position.y = (baseH + towerH + spireH / 2) * s;
    g.add(spire);

    // Finial ball
    const finial = new THREE.Mesh(G.sphere, mat("#D4AF37", { emissive: "#D4AF37", emissiveIntensity: isNight ? 0.8 : 0.2, metalness: 0.9 }));
    finial.scale.set(0.1 * s, 0.1 * s, 0.1 * s);
    finial.position.y = (baseH + towerH + spireH) * s;
    g.add(finial);

    // ═══════════════════════════════════════════════
    //  BRIDGE — Golden Gate style
    // ═══════════════════════════════════════════════
  } else if (style === "bridge") {
    const towerH = height * 0.85;
    const ggRed = "#C1272D";
    const ggMat = mat(ggRed, { emissive: "#DC2626", emissiveIntensity: isNight ? 0.5 : 0, roughness: 0.4, metalness: 0.3 });

    // Two main towers — each has twin columns + crossbeams
    const towerXPositions = [-0.7, 0.7];
    towerXPositions.forEach((tx) => {
      // Twin columns per tower
      for (const dz of [-0.12, 0.12]) {
        const col = new THREE.Mesh(G.box, ggMat);
        col.scale.set(0.18 * s, towerH * s, 0.18 * s);
        col.position.set(tx * s, (towerH / 2) * s, dz * s);
        g.add(col);
      }
      // Lower crossbeam
      const lCross = new THREE.Mesh(G.box, ggMat);
      lCross.scale.set(0.22 * s, 0.08 * s, 0.32 * s);
      lCross.position.set(tx * s, towerH * 0.35 * s, 0);
      g.add(lCross);
      // Upper crossbeam
      const uCross = new THREE.Mesh(G.box, ggMat);
      uCross.scale.set(0.22 * s, 0.08 * s, 0.32 * s);
      uCross.position.set(tx * s, towerH * 0.7 * s, 0);
      g.add(uCross);
      // Top cap
      const cap = new THREE.Mesh(G.box, ggMat);
      cap.scale.set(0.24 * s, 0.06 * s, 0.36 * s);
      cap.position.set(tx * s, towerH * s, 0);
      g.add(cap);
    });

    // Road deck
    const road = new THREE.Mesh(G.box, mat("#374151", { roughness: 0.8 }));
    road.scale.set(2.2 * s, 0.05 * s, 0.4 * s);
    road.position.y = towerH * 0.28 * s;
    g.add(road);

    // Road markings
    const marking = new THREE.Mesh(G.box, mat("#FCD34D"));
    marking.scale.set(2.0 * s, 0.005 * s, 0.02 * s);
    marking.position.y = (towerH * 0.28 + 0.03) * s;
    g.add(marking);

    // Suspension cables (main catenary — 2 per side)
    const cableMat = mat("#94A3B8", { metalness: 0.7, roughness: 0.2 });
    for (const side of [-0.14, 0.14]) {
      for (let ci = 0; ci < 8; ci++) {
        const t = ci / 7;
        const cx = -0.7 + t * 1.4;
        const sag = 4 * t * (1 - t);
        const cy = towerH * (0.95 - sag * 0.55);
        const cable = new THREE.Mesh(G.box, cableMat);
        cable.scale.set(0.22 * s, 0.015 * s, 0.015 * s);
        cable.position.set(cx * s, cy * s, side * s);
        cable.rotation.z = Math.atan2((ci < 4 ? -1 : 1) * 0.15, 0.2);
        g.add(cable);
      }
    }

    // Vertical suspenders from cables down to road deck
    for (let vi = 1; vi < 7; vi++) {
      const t = vi / 7;
      const vx = -0.7 + t * 1.4;
      const sag = 4 * t * (1 - t);
      const cableY = towerH * (0.95 - sag * 0.55);
      const deckY = towerH * 0.28;
      const suspH = cableY - deckY;
      if (suspH > 0) {
        const susp = new THREE.Mesh(G.box, cableMat);
        susp.scale.set(0.01 * s, suspH * s, 0.01 * s);
        susp.position.set(vx * s, (deckY + suspH / 2) * s, 0);
        g.add(susp);
      }
    }

    // Navigation beacon lights on tower tops
    for (const tx of towerXPositions) {
      const navLight = new THREE.Mesh(G.sphere, mat("#EF4444", { emissive: "#EF4444", emissiveIntensity: 1.5 }));
      navLight.scale.set(0.08 * s, 0.08 * s, 0.08 * s);
      navLight.position.set(tx * s, (towerH + 0.06) * s, 0);
      g.add(navLight);
    }

    // ═══════════════════════════════════════════════
    //  DEFAULT — Rich LEGO multi-floor tower
    // ═══════════════════════════════════════════════
  } else {
    const totalH = height * 0.6;
    const isWide = style === "wide";
    const wallW = isWide ? 1.4 : 1.0;
    const wallD = isWide ? 1.0 : 1.0;

    // LEGO base plate (yellow)
    const base = new THREE.Mesh(G.box, mat(baseColor));
    base.scale.set((wallW + 0.15) * s, 0.16 * s, (wallD + 0.15) * s);
    base.position.y = 0.08 * s;
    g.add(base);

    // Main wall body
    const wall = new THREE.Mesh(G.box, mat(color, { roughness: 0.45, metalness: 0.15 }));
    wall.scale.set(wallW * s, totalH * s, wallD * s);
    wall.position.y = (0.16 + totalH / 2) * s;
    g.add(wall);

    // Wall corner pillars (4 vertical edges)
    const pillarW = 0.06;
    const corners = [
      [wallW / 2, wallD / 2], [wallW / 2, -wallD / 2],
      [-wallW / 2, wallD / 2], [-wallW / 2, -wallD / 2],
    ];
    corners.forEach(([cx, cz]) => {
      const pillar = new THREE.Mesh(G.box, mat(darkCol, { roughness: 0.5 }));
      pillar.scale.set(pillarW * s, totalH * s, pillarW * s);
      pillar.position.set(cx * s, (0.16 + totalH / 2) * s, cz * s);
      g.add(pillar);
    });

    // Window grids on all 4 faces
    const wRows = Math.max(2, Math.floor(height));
    const wCols = isWide ? 4 : 3;
    const wallHScaled = totalH * s;
    const wallWScaled = wallW * s;
    const wallDScaled = wallD * s;
    const baseY = 0.16 * s;

    addWindowGrid("front", wallWScaled, wallHScaled, baseY, wRows, wCols);
    addWindowGrid("back", wallWScaled, wallHScaled, baseY, wRows, wCols);
    addWindowGrid("left", wallDScaled, wallHScaled, baseY, wRows, Math.max(2, wCols - 1));
    addWindowGrid("right", wallDScaled, wallHScaled, baseY, wRows, Math.max(2, wCols - 1));

    // Door with frame
    const doorH = 0.22;
    const doorFrame = new THREE.Mesh(G.box, mat("#64748B"));
    doorFrame.scale.set(0.24 * s, doorH * s, 0.04 * s);
    doorFrame.position.set(0, (0.16 + doorH / 2) * s, (wallD / 2 + 0.015) * s);
    g.add(doorFrame);

    const door = new THREE.Mesh(G.box, mat("#7C3AED", { emissive: isNight ? "#7C3AED" : "#000", emissiveIntensity: isNight ? 0.5 : 0 }));
    door.scale.set(0.18 * s, doorH * 0.9 * s, 0.02 * s);
    door.position.set(0, (0.16 + doorH * 0.45) * s, (wallD / 2 + 0.025) * s);
    g.add(door);

    // Awning over door
    const awning = new THREE.Mesh(G.box, mat(hasAd ? "#10B981" : "#E87461"));
    awning.scale.set(0.35 * s, 0.02 * s, 0.15 * s);
    awning.position.set(0, (0.16 + doorH + 0.02) * s, (wallD / 2 + 0.08) * s);
    awning.rotation.x = -0.15;
    g.add(awning);

    // Roof trim band (glows green if ad claimed)
    const trimColor = hasAd ? "#10B981" : "#E87461";
    const trim = new THREE.Mesh(G.box, mat(trimColor, { emissive: trimColor, emissiveIntensity: adGlow }));
    trim.scale.set((wallW + 0.06) * s, 0.06 * s, (wallD + 0.06) * s);
    trim.position.y = (0.16 + totalH) * s;
    g.add(trim);

    // Parapet edge
    const parapet = new THREE.Mesh(G.box, mat(darkCol));
    parapet.scale.set((wallW + 0.1) * s, 0.04 * s, (wallD + 0.1) * s);
    parapet.position.y = (0.16 + totalH + 0.05) * s;
    g.add(parapet);

    // Rooftop LEGO studs (2x2)
    addRoofStuds((0.16 + totalH + 0.18) * s, isNight ? "#818CF8" : "#2D5A3E");

    // Rooftop AC unit (small box detail)
    const ac = new THREE.Mesh(G.box, mat("#94A3B8", { roughness: 0.6, metalness: 0.5 }));
    ac.scale.set(0.18 * s, 0.1 * s, 0.14 * s);
    ac.position.set(-0.25 * s, (0.16 + totalH + 0.12) * s, -0.2 * s);
    g.add(ac);

    // Small antenna mast (tall buildings only)
    if (height >= 3) {
      const mast = new THREE.Mesh(G.cylinder, mat("#64748B", { metalness: 0.7 }));
      mast.scale.set(0.02 * s, totalH * 0.2 * s, 0.02 * s);
      mast.position.set(0.3 * s, (0.16 + totalH + totalH * 0.1 + 0.08) * s, 0.2 * s);
      g.add(mast);

      // Antenna tip light
      if (isNight) {
        const antLight = new THREE.Mesh(G.sphere, mat("#EF4444", { emissive: "#EF4444", emissiveIntensity: 1 }));
        antLight.scale.set(0.04 * s, 0.04 * s, 0.04 * s);
        antLight.position.set(0.3 * s, (0.16 + totalH + totalH * 0.2 + 0.1) * s, 0.2 * s);
        g.add(antLight);
      }
    }
  }

  // ── Rooftop 3D Glowing Billboard Mesh ────────────────
  const billboard = createBillboardMesh(spot, s, bbRoofY, isNight);
  g.add(billboard);

  // Tag group for raycasting & identification
  g.userData.isBuilding = true;
  g.userData.spotId = spot._id;
  g.userData.spotName = spot.name;

  return g;
}

/* ── 3D Billboard & Vehicle Helpers ──────────────── */
function createBillboardMesh(spot: Spot, scale: number, roofY: number, isNight: boolean): THREE.Group {
  const G = getGeo();
  const bbGroup = new THREE.Group();

  const company = spot.adCompany || spot.name;
  const amount = spot.currentBid;
  const hasAd = !!spot.adCompany;

  // Create 2D Canvas for screen text
  const canvas = document.createElement("canvas");
  const canvasScale = 2;
  canvas.width = 512 * canvasScale;
  canvas.height = 256 * canvasScale;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.scale(canvasScale, canvasScale);
    // Cyber metallic background
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, hasAd ? "#0B1329" : "#1E1B4B");
    grad.addColorStop(1, hasAd ? "#1E293B" : "#0F172A");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);

    // Neon Frame border
    ctx.strokeStyle = hasAd ? "#10B981" : "#6366F1";
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, 498, 242);

    // Header badge
    ctx.fillStyle = hasAd ? "#34D399" : "#818CF8";
    ctx.font = "900 28px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(hasAd ? "● LIVE ADVERTISER" : "⚡ SF LANDMARK BILLBOARD", 256, 54);

    // Main Brand Name
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "900 46px sans-serif";
    ctx.fillText(company.length > 14 ? company.slice(0, 14) + "…" : company, 256, 126);

    // Price tag
    ctx.fillStyle = "#FBBF24";
    ctx.font = "900 42px sans-serif";
    ctx.fillText(`$${amount} ${hasAd ? "CURRENT BID" : "STARTING BID"}`, 256, 200);
  }

  const texture = createSharpCanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  // Billboard Truss Frame (dark steel)
  const frameMat = mat("#1E293B", { metalness: 0.8, roughness: 0.2 });
  const frameW = 1.1 * scale;
  const frameH = 0.55 * scale;
  const frameDepth = 0.04 * scale;

  const frame = new THREE.Mesh(G.box, frameMat);
  frame.scale.set(frameW, frameH, frameDepth);
  bbGroup.add(frame);

  // Billboard Screen Mesh with glowing Canvas texture
  const screenMat = new THREE.MeshStandardMaterial({
    map: texture,
    emissiveMap: texture,
    emissive: new THREE.Color(hasAd ? 0x34d399 : 0x818cf8),
    emissiveIntensity: isNight ? 1.4 : 0.6,
    roughness: 0.2,
    metalness: 0.1,
  });

  const screenGeo = G.box;
  const screen = new THREE.Mesh(screenGeo, screenMat);
  screen.scale.set(frameW * 0.96, frameH * 0.92, frameDepth * 1.1);
  screen.position.z = 0.01 * scale;
  bbGroup.add(screen);

  // Steel Mounting Legs down to roof
  const legH = 0.25 * scale;
  for (const lx of [-frameW * 0.38, frameW * 0.38]) {
    const leg = new THREE.Mesh(G.cylinder, frameMat);
    leg.scale.set(0.03 * scale, legH, 0.03 * scale);
    leg.position.set(lx, -frameH / 2 - legH / 2, 0);
    bbGroup.add(leg);
  }

  // Top Spotlight Fixtures & Sky Light Beacons
  for (const sx of [-frameW * 0.35, frameW * 0.35]) {
    const spotFixture = new THREE.Mesh(G.box, mat("#F59E0B", { emissive: "#F59E0B", emissiveIntensity: isNight ? 1.5 : 0.4 }));
    spotFixture.scale.set(0.06 * scale, 0.04 * scale, 0.08 * scale);
    spotFixture.position.set(sx, frameH / 2 + 0.03 * scale, 0.06 * scale);
    bbGroup.add(spotFixture);
  }

  // 3D Sky Light Beacons shooting into the clouds on claimed/hot spots
  if (hasAd || amount > 10) {
    const beamColor = hasAd ? "#10B981" : "#6366F1";
    const beamH = 12 * scale;
    const beam = new THREE.Mesh(G.cylinder, mat(beamColor, { transparent: true, opacity: isNight ? 0.35 : 0.15, emissive: beamColor, emissiveIntensity: isNight ? 1.8 : 0.8 }));
    beam.scale.set(0.12 * scale, beamH, 0.12 * scale);
    beam.position.set(0, frameH / 2 + beamH / 2, 0);
    bbGroup.add(beam);
  }

  bbGroup.position.set(0, roofY + frameH / 2 + legH, 0);
  return bbGroup;
}

/* ── Ultra-Realistic Vehicle Helpers ─────────────── */

// Suspended 3D Towed Aerial Billboard Banner
function createTowedBannerMesh(): THREE.Group {
  const G = getGeo();
  const bannerGroup = new THREE.Group();

  // Steel Tow Cables
  for (const cx of [-0.22, 0.22]) {
    const cable = new THREE.Mesh(G.cylinder, mat("#94A3B8", { metalness: 0.9 }));
    cable.scale.set(0.008, 0.4, 0.008);
    cable.position.set(cx, -0.25, 0);
    bannerGroup.add(cable);
  }

  // Banner Canvas Texture
  const canvas = document.createElement("canvas");
  const canvasScale = 2;
  canvas.width = 512 * canvasScale;
  canvas.height = 128 * canvasScale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(canvasScale, canvasScale);

  ctx.fillStyle = "#0F172A";
  ctx.fillRect(0, 0, 512, 128);

  ctx.strokeStyle = "#10B981";
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 504, 120);

  const grad = ctx.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, "rgba(99, 102, 241, 0.4)");
  grad.addColorStop(1, "rgba(236, 72, 153, 0.4)");
  ctx.fillStyle = grad;
  ctx.fillRect(8, 8, 496, 112);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 26px sans-serif";
  ctx.fillStyle = "#F8FAFC";
  ctx.fillText("⚡ SF 3D AD WORLD ⚡", 256, 44);

  ctx.font = "bold 20px sans-serif";
  ctx.fillStyle = "#34D399";
  ctx.fillText("BID NOW • STARTING AT $10", 256, 84);

  const texture = createSharpCanvasTexture(canvas);

  const bannerMat = new THREE.MeshStandardMaterial({
    map: texture,
    emissive: 0xffffff,
    emissiveMap: texture,
    emissiveIntensity: 0.9,
    side: THREE.DoubleSide,
    roughness: 0.2,
    metalness: 0.1,
  });

  const banner = new THREE.Mesh(G.box, bannerMat);
  banner.scale.set(1.4, 0.35, 0.02);
  banner.position.set(0, -0.45, 0);
  bannerGroup.add(banner);

  return bannerGroup;
}

// US Coast Guard Rescue MH-65 Dolphin Helicopter with Searchlight
function createHelicopter(color: string): THREE.Group {
  const G = getGeo();
  const h = new THREE.Group();

  // Fuselage (International Orange & White Coast Guard Livery)
  const bodyMat = mat("#FF4500", { roughness: 0.2, metalness: 0.3 }); // Coast Guard Orange
  const whiteMat = mat("#FFFFFF", { roughness: 0.2, metalness: 0.2 });

  const body = new THREE.Mesh(G.box, bodyMat);
  body.scale.set(0.65, 0.26, 0.26);
  h.add(body);

  const belly = new THREE.Mesh(G.box, whiteMat);
  belly.scale.set(0.66, 0.08, 0.27);
  belly.position.y = -0.09;
  h.add(belly);

  // Glass Cockpit Windshield
  const cabin = new THREE.Mesh(G.sphere, mat("#38BDF8", { transparent: true, opacity: 0.75, roughness: 0.05, metalness: 0.9 }));
  cabin.scale.set(0.24, 0.18, 0.22);
  cabin.position.set(0.22, 0.06, 0);
  h.add(cabin);

  // Tail Boom & Fin
  const tail = new THREE.Mesh(G.box, bodyMat);
  tail.scale.set(0.55, 0.08, 0.08);
  tail.position.set(-0.52, 0.08, 0);
  h.add(tail);

  const tailFin = new THREE.Mesh(G.box, whiteMat);
  tailFin.scale.set(0.12, 0.28, 0.04);
  tailFin.position.set(-0.76, 0.16, 0);
  h.add(tailFin);

  // Main Rotor Blades
  const rotor = new THREE.Mesh(G.box, mat("#1E293B", { transparent: true, opacity: 0.6, metalness: 0.8 }));
  rotor.scale.set(1.5, 0.015, 0.08);
  rotor.position.y = 0.22;
  rotor.userData.isRotor = true;
  h.add(rotor);

  // Rotor Shaft Cap
  const cap = new THREE.Mesh(G.cylinder, mat("#94A3B8", { metalness: 0.9 }));
  cap.scale.set(0.08, 0.06, 0.08);
  cap.position.y = 0.18;
  h.add(cap);

  // Downward Searchlight Cone
  const searchCone = new THREE.Mesh(G.cone, mat("#FDE047", { transparent: true, opacity: 0.25, emissive: "#FDE047", emissiveIntensity: 1.2 }));
  searchCone.scale.set(0.4, 1.2, 0.4);
  searchCone.position.set(0.2, -0.7, 0);
  searchCone.rotation.x = Math.PI;
  h.add(searchCone);

  // ── Suspended 3D Towed Aerial Billboard Banner ──────────
  const towedBanner = createTowedBannerMesh();
  h.add(towedBanner);

  h.userData.isVehicle = true;
  return h;
}

// SF Yellow Taxi & SFPD Police Cruiser
function createCar(color: string): THREE.Group {
  const G = getGeo();
  const c = new THREE.Group();
  const isTaxi = color === "#F97316" || color === "#EF4444";

  // Body & Paint
  const carColor = isTaxi ? "#F59E0B" : "#1E293B"; // Yellow Taxi or Police Dark
  const body = new THREE.Mesh(G.box, mat(carColor, { roughness: 0.3, metalness: 0.4 }));
  body.scale.set(0.38, 0.11, 0.19);
  c.add(body);

  // Cabin Windows
  const cab = new THREE.Mesh(G.box, mat("#38BDF8", { transparent: true, opacity: 0.75, roughness: 0.05, metalness: 0.8 }));
  cab.scale.set(0.2, 0.09, 0.16);
  cab.position.set(0.02, 0.09, 0);
  c.add(cab);

  // 4 Wheels
  const wheelMat = mat("#0F172A", { roughness: 0.9 });
  for (const wx of [-0.11, 0.11]) {
    for (const wz of [-0.1, 0.1]) {
      const wheel = new THREE.Mesh(G.cylinder, wheelMat);
      wheel.scale.set(0.07, 0.04, 0.07);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, -0.05, wz);
      c.add(wheel);
    }
  }

  // Headlights (glowing yellow)
  for (const wz of [-0.06, 0.06]) {
    const light = new THREE.Mesh(G.sphere, mat("#FDE047", { emissive: "#FDE047", emissiveIntensity: 1.5 }));
    light.scale.set(0.03, 0.03, 0.03);
    light.position.set(0.2, -0.01, wz);
    c.add(light);
  }

  // Rooftop Light / Taxi Sign
  if (isTaxi) {
    const taxiSign = new THREE.Mesh(G.box, mat("#FCD34D", { emissive: "#FCD34D", emissiveIntensity: 1 }));
    taxiSign.scale.set(0.07, 0.04, 0.04);
    taxiSign.position.set(0.02, 0.15, 0);
    c.add(taxiSign);
  } else {
    // Police Siren Blue/Red
    const siren = new THREE.Mesh(G.box, mat("#EF4444", { emissive: "#3B82F6", emissiveIntensity: 2 }));
    siren.scale.set(0.08, 0.03, 0.06);
    siren.position.set(0.02, 0.14, 0);
    c.add(siren);
  }

  c.userData.isVehicle = true;
  return c;
}

// SF Bay Ferry & Tugboat
function createBoat(color: string): THREE.Group {
  const G = getGeo();
  const b = new THREE.Group();

  // Double-decker SF Ferry Hull (White superstructure, Dark Navy hull)
  const hull = new THREE.Mesh(G.box, mat("#1E3A8A", { roughness: 0.3, metalness: 0.3 }));
  hull.scale.set(0.65, 0.1, 0.24);
  b.add(hull);

  // Deck 1
  const deck1 = new THREE.Mesh(G.box, mat("#FFFFFF", { roughness: 0.3 }));
  deck1.scale.set(0.48, 0.12, 0.2);
  deck1.position.set(-0.02, 0.1, 0);
  b.add(deck1);

  // Deck 2 Cabin
  const deck2 = new THREE.Mesh(G.box, mat("#FFFFFF", { roughness: 0.3 }));
  deck2.scale.set(0.28, 0.1, 0.16);
  deck2.position.set(-0.05, 0.2, 0);
  b.add(deck2);

  // Glass Passenger Windows
  const win = new THREE.Mesh(G.box, mat("#38BDF8", { transparent: true, opacity: 0.7, emissive: "#38BDF8", emissiveIntensity: 0.3 }));
  win.scale.set(0.42, 0.06, 0.21);
  win.position.set(-0.02, 0.11, 0);
  b.add(win);

  // Smokestack Pipe
  const stack = new THREE.Mesh(G.cylinder, mat("#EF4444", { metalness: 0.8 }));
  stack.scale.set(0.04, 0.1, 0.04);
  stack.position.set(-0.12, 0.28, 0);
  b.add(stack);

  // Water Wake Foam Trail
  const wake = new THREE.Mesh(G.box, mat("#E0F2FE", { transparent: true, opacity: 0.45 }));
  wake.scale.set(0.5, 0.01, 0.28);
  wake.position.set(-0.55, -0.04, 0);
  b.add(wake);

  b.userData.isVehicle = true;
  return b;
}

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
];

const BOAT_ROUTES = [
  { from: [-122.385, 37.795] as [number, number], to: [-122.385, 37.810] as [number, number], speed: 0.06, color: "#1E40AF" },
  { from: [-122.380, 37.790] as [number, number], to: [-122.395, 37.805] as [number, number], speed: 0.04, color: "#DC2626" },
];



/* ── Camera Presets Map ────────────────────────── */
const PRESETS: Record<PresetView, { center: [number, number]; zoom: number; pitch: number; bearing: number }> = {
  overview: { center: [-122.4194, 37.785], zoom: 14.2, pitch: 52, bearing: -17 },
  downtown: { center: [-122.404, 37.789], zoom: 17.0, pitch: 65, bearing: -25 },
  financial: { center: [-122.401, 37.794], zoom: 17.4, pitch: 67, bearing: -40 },
  waterfront: { center: [-122.392, 37.795], zoom: 17.0, pitch: 64, bearing: 20 },
  goldengate: { center: [-122.475, 37.818], zoom: 16.2, pitch: 62, bearing: -60 },
  cardrive: { center: [-122.395, 37.792], zoom: 17.8, pitch: 68, bearing: -30 },
  transamericacar: { center: [-122.4025, 37.7948], zoom: 18.2, pitch: 70, bearing: -10 },
};

/* ── Main Component ────────────────────────────── */
const SFMap = forwardRef<SFMapHandle, Props>(({ spots, onSpotClick, highlightId, theme = "day" }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, { marker: maplibregl.Marker; el: HTMLDivElement }>>(new Map());
  const onSpotClickRef = useRef(onSpotClick);
  const spotsRef = useRef(spots);
  const [ready, setReady] = useState(false);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.Camera | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const fillLightRef = useRef<THREE.DirectionalLight | null>(null);
  const animRef = useRef<{ helis: THREE.Group[]; cars: THREE.Group[]; boats: THREE.Group[] }>({ helis: [], cars: [], boats: [] });
  const startTimeRef = useRef(performance.now());

  onSpotClickRef.current = onSpotClick;
  spotsRef.current = spots;

  useImperativeHandle(ref, () => ({
    flyTo(lng: number, lat: number) {
      soundFX.playFly();
      mapRef.current?.flyTo({ center: [lng, lat], zoom: 17.2, pitch: 62, bearing: -20, duration: 1400, essential: true } as any);
    },
    flyToPreset(preset: PresetView) {
      soundFX.playFly();
      const p = PRESETS[preset] || PRESETS.overview;
      mapRef.current?.flyTo({ center: p.center, zoom: p.zoom, pitch: p.pitch, bearing: p.bearing, duration: 1600, essential: true } as any);
    },
  }));

  /* ── Init Map & Three.js ────────────────────── */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: PRESETS.overview.center,
      zoom: PRESETS.overview.zoom,
      pitch: PRESETS.overview.pitch,
      bearing: PRESETS.overview.bearing,
      // Extreme pitch makes vector-building facades fill the viewport and
      // obscures the city below. 72° still feels cinematic without the haze.
      maxPitch: 72,
      // MapLibre defaults to antialiasing off. The custom Three.js scene shares
      // this canvas, so it must be enabled before either renderer is created.
      canvasContextAttributes: {
        antialias: true,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false,
      } as any,
      // Respect native display density and cap it before a high-DPI screen can
      // make the continuously animated map unnecessarily expensive.
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    } as any);

    map.on("load", () => {
      const scene = new THREE.Scene();
      sceneRef.current = scene;

      const ambient = new THREE.AmbientLight(0xfff5e6, 0.85);
      scene.add(ambient);
      ambientLightRef.current = ambient;

      const sun = new THREE.DirectionalLight(0xffffff, 0.85);
      sun.position.set(2, 4, 1.5);
      scene.add(sun);
      dirLightRef.current = sun;

      const fill = new THREE.DirectionalLight(0xffd4a8, 0.4);
      fill.position.set(-2, 1, -1);
      scene.add(fill);
      fillLightRef.current = fill;

      const refMerc = maplibregl.MercatorCoordinate.fromLngLat([-122.4194, 37.7749], 0);
      const mScale = refMerc.meterInMercatorCoordinateUnits();

      // Spawn vehicles
      HELI_PATHS.forEach((p) => {
        const h = createHelicopter(p.color);
        const s = mScale * 40;
        h.scale.set(s, s, s);
        h.traverse((c) => { if (c instanceof THREE.Mesh) { c.castShadow = true; c.receiveShadow = true; } });
        scene.add(h);
        animRef.current.helis.push(h);
      });

      CAR_ROUTES.forEach((r) => {
        const c = createCar(r.color);
        const s = mScale * 25;
        c.scale.set(s, s, s);
        c.traverse((child) => { if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; } });
        scene.add(c);
        animRef.current.cars.push(c);
      });

      BOAT_ROUTES.forEach((r) => {
        const b = createBoat(r.color);
        const s = mScale * 35;
        b.scale.set(s, s, s);
        b.traverse((child) => { if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; } });
        scene.add(b);
        animRef.current.boats.push(b);
      });

      const camera = new THREE.Camera();
      cameraRef.current = camera;
      let renderer: THREE.WebGLRenderer;

      // Render the building mass before labels so neighborhood names remain
      // crisp, then keep the layer deliberately subtle behind our ad objects.
      const firstSymbolLayerId = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
      map.addLayer({
        id: "3d-buildings-extrusion",
        source: "openmaptiles",
        "source-layer": "building",
        filter: ["==", "extrude", "true"],
        type: "fill-extrusion",
        minzoom: 13,
        paint: {
          "fill-extrusion-color": "#A7B4C3",
          "fill-extrusion-height": ["get", "render_height"],
          "fill-extrusion-base": ["get", "render_min_height"],
          "fill-extrusion-opacity": extrusionOpacityForTheme(theme) as any,
        },
      }, firstSymbolLayerId);

      const customLayer: maplibregl.CustomLayerInterface = {
        id: "lego-world",
        type: "custom",
        renderingMode: "3d",
        onAdd(_map, gl) {
          renderer = new THREE.WebGLRenderer({ canvas: _map.getCanvas(), context: gl as any, antialias: true });
          renderer.autoClear = false;
          // MapLibre and Three share mercator-sized world coordinates here;
          // the old generic shadow frustum covered hundreds of kilometres and
          // produced soft, oversized shadow artifacts. Directional lighting
          // retains depth without the false ground shadows.
          renderer.shadowMap.enabled = false;

          startTimeRef.current = performance.now();
        },
        render(_gl, args: any) {
          const m = args.defaultProjectionData?.mainMatrix || args.projMatrix || args.projectionMatrix;
          if (!m) return;
          if (m.elements) camera.projectionMatrix.copy(m);
          else if (Array.isArray(m)) camera.projectionMatrix.fromArray(m);
          else if (typeof m === "object" && m[0] !== undefined) camera.projectionMatrix.fromArray(Array.from(m));

          // MapLibre owns canvas resizing. Keep Three's cached viewport in
          // sync with the physical backing buffer without changing its size.
          const mapCanvas = map.getCanvas();
          renderer.setViewport(0, 0, mapCanvas.width, mapCanvas.height);

          const t = (performance.now() - startTimeRef.current) / 1000;

          // Animate helicopters
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
            const rotor = heli.children.find((c) => c.userData.isRotor);
            if (rotor) rotor.rotation.y = t * 24;
          }

          // Animate cars
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

          // Animate boats
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
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

      // Pointer Raycasting for 3D Building Click
      const canvas = map.getCanvas();
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();

      canvas.addEventListener("click", (e) => {
        if (!sceneRef.current || !cameraRef.current) return;
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, cameraRef.current);
        const intersects = raycaster.intersectObjects(sceneRef.current.children, true);

        for (const hit of intersects) {
          let curr: THREE.Object3D | null = hit.object;
          while (curr && !curr.userData.isBuilding) {
            curr = curr.parent;
          }
          if (curr && curr.userData.spotId) {
            const foundSpot = spotsRef.current.find((s) => s._id === curr!.userData.spotId);
            if (foundSpot) {
              soundFX.playClick();
              onSpotClickRef.current(foundSpot);
              break;
            }
          }
        }
      });

      setReady(true);
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  /* ── Theme Lighting & Atmosphere Switch ────── */
  useEffect(() => {
    if (!ready || !ambientLightRef.current || !dirLightRef.current || !fillLightRef.current) return;

    if (theme === "night") {
      ambientLightRef.current.color.setHex(0x1e1b4b);
      ambientLightRef.current.intensity = 0.9;

      dirLightRef.current.color.setHex(0x6366f1);
      dirLightRef.current.intensity = 0.5;

      fillLightRef.current.color.setHex(0xec4899);
      fillLightRef.current.intensity = 0.4;
    } else if (theme === "sunset") {
      ambientLightRef.current.color.setHex(0xfeb2b2);
      ambientLightRef.current.intensity = 0.7;

      dirLightRef.current.color.setHex(0xf59e0b);
      dirLightRef.current.intensity = 1.1;

      fillLightRef.current.color.setHex(0xd946ef);
      fillLightRef.current.intensity = 0.5;
    } else {
      // Day
      ambientLightRef.current.color.setHex(0xfff5e6);
      ambientLightRef.current.intensity = 0.85;

      dirLightRef.current.color.setHex(0xffffff);
      dirLightRef.current.intensity = 0.85;

      fillLightRef.current.color.setHex(0xffd4a8);
      fillLightRef.current.intensity = 0.4;
    }

    if (mapRef.current) {
      if (mapRef.current.getLayer("3d-buildings-extrusion")) {
        const bColor = theme === "night" ? "#1E293B" : theme === "sunset" ? "#8F6F72" : "#A7B4C3";
        mapRef.current.setPaintProperty("3d-buildings-extrusion", "fill-extrusion-color", bColor);
        mapRef.current.setPaintProperty("3d-buildings-extrusion", "fill-extrusion-opacity", extrusionOpacityForTheme(theme) as any);
      }
      mapRef.current.triggerRepaint();
    }
  }, [theme, ready]);

  /* ── Place/Update 3D Buildings ────────────── */
  useEffect(() => {
    if (!mapRef.current || !ready || !sceneRef.current) return;
    const scene = sceneRef.current;

    // Remove existing buildings
    const toRemove = scene.children.filter((c) => c.userData.isBuilding);
    toRemove.forEach((c) => scene.remove(c));

    const refMerc = maplibregl.MercatorCoordinate.fromLngLat([-122.4194, 37.7749], 0);
    const meterScale = refMerc.meterInMercatorCoordinateUnits();

    spots.forEach((spot) => {
      const merc = maplibregl.MercatorCoordinate.fromLngLat([spot.lng, spot.lat], 0);
      const building = createLegoBuilding(spot, meterScale, theme);
      building.traverse((c) => {
        if (c instanceof THREE.Mesh) {
          c.castShadow = true;
          c.receiveShadow = true;
        }
      });
      building.position.set(merc.x, merc.y, merc.z || 0);
      building.rotation.x = Math.PI / 2;
      scene.add(building);
    });

    mapRef.current.triggerRepaint();
  }, [spots, ready, theme]);

  /* ── Update Map Markers ────────────────────── */
  useEffect(() => {
    if (!mapRef.current || !ready) return;
    const map = mapRef.current;

    const spotIds = new Set(spots.map((s) => s._id));
    markersRef.current.forEach((entry, id) => {
      if (!spotIds.has(id)) {
        entry.marker.remove();
        markersRef.current.delete(id);
      }
    });

    spots.forEach((spot) => {
      const hasAd = !!spot.adCompany;
      const isHighlighted = spot._id === highlightId;
      const color = spot.color || "#4ECDC4";
      const existing = markersRef.current.get(spot._id);

      const highlightCSS = "transform:scale(1.25) translateY(-6px);filter:drop-shadow(0 0 16px #6366F1);";
      const normalCSS = "transform:scale(1) translateY(0);filter:none;";
      const baseCSS = "cursor:pointer;user-select:none;transform-origin:center bottom;transition:transform .2s ease, filter .2s ease;";

      if (existing) {
        // Update existing marker's inner element only
        const inner = existing.el.querySelector("[data-marker-inner]") as HTMLElement | null;
        if (inner) {
          inner.style.cssText = baseCSS + (isHighlighted ? highlightCSS : normalCSS);
          inner.innerHTML = markerHTML(spot, hasAd, color, theme);
        }
        return;
      }

      // Create a wrapper that MapLibre will anchor. We don't touch its styles at all.
      const rootEl = document.createElement("div");
      // Prevent root from having any layout effect — MapLibre positions this via translate()
      rootEl.style.cssText = "display:flex;align-items:flex-end;justify-content:center;";

      // Inner visual element — all hover transforms happen here
      const innerEl = document.createElement("div");
      innerEl.setAttribute("data-marker-inner", "true");
      innerEl.style.cssText = baseCSS + (isHighlighted ? highlightCSS : normalCSS);
      innerEl.innerHTML = markerHTML(spot, hasAd, color, theme);

      innerEl.addEventListener("mouseenter", () => {
        if (spot._id !== highlightId) {
          innerEl.style.transform = "scale(1.12) translateY(-4px)";
          innerEl.style.filter = "drop-shadow(0 4px 12px rgba(99,102,241,0.4))";
        }
      });

      innerEl.addEventListener("mouseleave", () => {
        if (spot._id !== highlightId) {
          innerEl.style.transform = "scale(1) translateY(0)";
          innerEl.style.filter = "none";
        }
      });

      innerEl.addEventListener("click", (e) => {
        e.stopPropagation();
        soundFX.playClick();
        onSpotClickRef.current(spot);
      });

      rootEl.appendChild(innerEl);

      const marker = new maplibregl.Marker({ element: rootEl, anchor: "center" })
        .setLngLat([spot.lng, spot.lat])
        .addTo(map);
      markersRef.current.set(spot._id, { marker, el: rootEl });
    });
  }, [spots, ready, highlightId, theme]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
});

function markerHTML(spot: Spot, hasAd: boolean, color: string, theme: MapTheme): string {
  const isNight = theme === "night";
  const bg = isNight ? "rgba(15, 23, 42, 0.92)" : "rgba(255, 255, 255, 0.95)";
  const textCol = isNight ? "#F8FAFC" : "#0F172A";
  const subTextCol = isNight ? "#94A3B8" : "#64748B";
  const borderGlow = isNight ? `0 0 16px ${color}88` : "0 8px 24px rgba(0,0,0,0.18)";

  if (hasAd) {
    return `<div style="
      background:${bg};
      backdrop-filter:blur(12px);
      border-radius:16px;padding:8px 14px;
      box-shadow:${borderGlow};
      min-width:120px;text-align:center;
      border:2.5px solid ${color};
      color:${textCol};
    ">
      <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:2px">
        ${spot.logoUrl ? `<img src="${spot.logoUrl}" style="width:14px;height:14px;object-fit:contain" />` : ""}
        <span style="font-size:12px;font-weight:800;letter-spacing:-.3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${spot.adCompany}</span>
      </div>
      ${spot.adTagline ? `<div style="font-size:9px;color:${subTextCol};line-height:1.2;margin-bottom:4px">${spot.adTagline}</div>` : ""}
      <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:4px">
        <span style="font-size:12px;font-weight:800;color:#6366F1">$${spot.currentBid}</span>
        ${spot.adWebsite ? `<span style="font-size:9px;color:#fff;background:#6366F1;padding:2px 6px;border-radius:6px;font-weight:700">Ad ↗</span>` : ""}
      </div>
    </div>`;
  }

  return `<div style="
    background:${color};color:#fff;font-weight:800;
    font-size:11px;padding:6px 14px;border-radius:20px;
    box-shadow:0 4px 16px rgba(0,0,0,.25), 0 0 0 2px rgba(255,255,255,0.8);
    white-space:nowrap;letter-spacing:.3px;
    backdrop-filter:blur(8px);
  ">$${spot.currentBid} · Bid Spot</div>`;
}

SFMap.displayName = "SFMap";
export default SFMap;
