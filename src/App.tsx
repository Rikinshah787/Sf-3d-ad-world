import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import SFMap, { type SFMapHandle, type Spot, type MapTheme, type PresetView } from "./components/SFMap";
import { soundFX } from "./lib/sound";

export default function App() {
  const spots = useQuery(api.spots.listSpots);
  const recentBids = useQuery(api.spots.listRecentBids);
  const placeBid = useMutation(api.spots.placeBid);
  const seed = useMutation(api.seed.seedSpots);
  const reset = useMutation(api.seed.resetSpots);

  const mapRef = useRef<SFMapHandle>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // UI States
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<"bid" | "history" | "specs">("bid");
  const [theme, setTheme] = useState<MapTheme>("day");
  const [muted, setMuted] = useState(false);
  const [isTouring, setIsTouring] = useState(false);
  const tourIndexRef = useRef(0);

  const toggleAutoTour = () => {
    soundFX.playClick();
    setIsTouring((prev) => !prev);
  };

  useEffect(() => {
    if (!isTouring) return;
    const presets: PresetView[] = ["transamericacar", "cardrive", "downtown", "financial", "waterfront", "goldengate", "overview"];
    const interval = setInterval(() => {
      tourIndexRef.current = (tourIndexRef.current + 1) % presets.length;
      const nextPreset = presets[tourIndexRef.current];
      setActivePreset(nextPreset);
      mapRef.current?.flyToPreset(nextPreset);
    }, 4200);
    const firstPreset = presets[tourIndexRef.current];
    setActivePreset(firstPreset);
    mapRef.current?.flyToPreset(firstPreset);
    return () => clearInterval(interval);
  }, [isTouring]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showSponsors, setShowSponsors] = useState(false);
  const [activePreset, setActivePreset] = useState<PresetView>("overview");

  // Form States
  const [bidder, setBidder] = useState("");
  const [bidAmount, setBidAmount] = useState("");
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [tagline, setTagline] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [bidError, setBidError] = useState("");
  const [bidSuccess, setBidSuccess] = useState(false);

  // Filter States
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusTab, setStatusTab] = useState<"all" | "claimed" | "open">("all");
  const [sortBy, setSortBy] = useState<"bid" | "prestige" | "height" | "name">("bid");
  const [showReset, setShowReset] = useState(false);

  // Derived selected spot
  const selectedSpot: Spot | null = useMemo(() => {
    if (!selectedSpotId || !spots) return null;
    return (spots.find((s) => s._id === selectedSpotId) as Spot | undefined) ?? null;
  }, [selectedSpotId, spots]);

  // Spot specific past bids query
  const spotBids = useQuery(
    api.spots.getBidsForSpot,
    selectedSpotId ? { spotId: selectedSpotId as Id<"spots"> } : "skip"
  );

  // Toggle Sound FX
  const handleToggleSound = () => {
    setMuted((prev) => {
      const next = !prev;
      soundFX.setEnabled(!next);
      if (!next) soundFX.playClick();
      return next;
    });
  };

  // Toggle Theme
  const handleToggleTheme = (t: MapTheme) => {
    setTheme(t);
    soundFX.playThemeToggle();
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "Escape") {
        setSelectedSpotId(null);
        setShowLeaderboard(false);
        setShowSponsors(false);
        setShowReset(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Sync selectedSpot clear on reset
  useEffect(() => {
    if (selectedSpotId && spots && !spots.find((s) => s._id === selectedSpotId)) {
      setSelectedSpotId(null);
    }
  }, [selectedSpotId, spots]);

  // Spot selection handler
  const handleSpotClick = useCallback((spot: Spot) => {
    setSelectedSpotId(spot._id);
    setDrawerTab("bid");
    setBidAmount(String(Math.ceil(spot.currentBid * 1.15)));
    setBidError("");
    setBidSuccess(false);
    mapRef.current?.flyTo(spot.lng, spot.lat);
  }, []);

  // Camera preset handler
  const handlePresetSelect = (preset: PresetView) => {
    setIsTouring(false);
    setActivePreset(preset);
    mapRef.current?.flyToPreset(preset);
  };

  // Filter & Sort spots
  const filteredSpots = useMemo(() => {
    if (!spots) return [];
    let result = [...spots];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.neighborhood.toLowerCase().includes(q) ||
          (s.adCompany && s.adCompany.toLowerCase().includes(q))
      );
    }

    if (categoryFilter !== "all") {
      result = result.filter((s) => s.category?.toLowerCase() === categoryFilter.toLowerCase());
    }

    if (statusTab === "claimed") result = result.filter((s) => s.adCompany);
    if (statusTab === "open") result = result.filter((s) => !s.adCompany);

    result.sort((a, b) => {
      if (sortBy === "bid") return b.currentBid - a.currentBid;
      if (sortBy === "prestige") return (b.prestigeScore || 0) - (a.prestigeScore || 0);
      if (sortBy === "height") return b.buildingHeight - a.buildingHeight;
      return a.name.localeCompare(b.name);
    });

    return result;
  }, [spots, search, categoryFilter, statusTab, sortBy]);

  // Handle placing a bid
  const handleBid = async () => {
    if (!selectedSpot || !bidder.trim()) return;
    const amount = parseFloat(bidAmount);
    if (isNaN(amount) || amount <= 0) {
      setBidError("Enter a valid amount");
      return;
    }
    if (amount <= selectedSpot.currentBid) {
      setBidError(`Must be higher than current bid ($${selectedSpot.currentBid})`);
      return;
    }

    try {
      await placeBid({
        spotId: selectedSpot._id as Id<"spots">,
        bidder: bidder.trim(),
        amount,
        company: company.trim() || undefined,
        website: website.trim() || undefined,
        tagline: tagline.trim() || undefined,
        logoUrl: logoUrl.trim() || undefined,
      });

      setBidError("");
      setBidSuccess(true);
      soundFX.playSuccess();

      setTimeout(() => {
        setBidSuccess(false);
      }, 2000);
    } catch (e: any) {
      setBidError(e.message || "Bid failed");
    }
  };

  // Quick bid addition
  const applyQuickBid = (add: number | string) => {
    if (!selectedSpot) return;
    soundFX.playClick();
    if (typeof add === "string" && add.endsWith("%")) {
      const pct = parseFloat(add) / 100;
      setBidAmount(String(Math.ceil(selectedSpot.currentBid * (1 + pct))));
    } else if (typeof add === "number") {
      setBidAmount(String(selectedSpot.currentBid + add));
    }
  };

  const claimedCount = spots?.filter((s) => s.adCompany).length ?? 0;
  const totalBidsVal = spots?.reduce((s, sp) => s + sp.currentBid, 0) ?? 0;
  const topBidVal = spots?.reduce((max, s) => Math.max(max, s.currentBid), 0) ?? 0;
  const isLoading = spots === undefined;

  const categories = ["all", "Skyscraper", "Landmark", "Waterfront", "Culture"];

  return (
    <div className="app-shell" style={{
      width: "100vw", height: "100vh", position: "relative", overflow: "hidden",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif",
      color: "#F8FAFC", background: "#0F172A",
    }}>
      {/* 3D Map */}
      <SFMap
        ref={mapRef}
        spots={(spots ?? []) as Spot[]}
        onSpotClick={handleSpotClick}
        highlightId={selectedSpotId}
        theme={theme}
      />

      {/* ── Loading Overlay ────────────────────── */}
      {isLoading && (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          flexDirection: "column", alignItems: "center", justifyContent: "center",
          background: "rgba(15, 23, 42, 0.85)", backdropFilter: "blur(16px)", zIndex: 50,
        }}>
          <div style={{ fontSize: 52, marginBottom: 12, animation: "bounce 1.5s infinite" }}>🏙️</div>
          <div style={{ color: "#F8FAFC", fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>
            Initializing SF 3D Ad World...
          </div>
          <div style={{ color: "#94A3B8", fontSize: 13, marginTop: 4 }}>Loading real-time Convex grid</div>
          <style>{`@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}`}</style>
        </div>
      )}

      {/* ── Product header ────────────────────── */}
      <header className="app-header">
        <button
          className="brand-button"
          onClick={() => handlePresetSelect("overview")}
          aria-label="SF Ad World — return to overview"
        >
          <span className="brand-mark" aria-hidden="true">🏙️</span>
          <span>
            <span className="brand-title">
              SF Ad World <span className="brand-badge">LIVE 3D</span>
            </span>
            <span className="brand-subtitle">Own a piece of the San Francisco skyline</span>
          </span>
        </button>

        {!isLoading && spots && spots.length > 0 && (
          <div className="global-stats" aria-label="Marketplace statistics">
            <span style={pillStyle("#A5B4FC")}>{claimedCount}/{spots.length} claimed</span>
            <span style={pillStyle("#6EE7B7")}>${totalBidsVal.toLocaleString()} marketplace</span>
            <span style={pillStyle("#FCD34D")}>Top bid ${topBidVal}</span>
          </div>
        )}

        <div className="header-spacer" />

        <div className="header-actions">
          <button
            className="sound-toggle"
            onClick={handleToggleSound}
            style={iconBtnStyle}
            title={muted ? "Turn sound on" : "Mute sound"}
            aria-label={muted ? "Turn sound on" : "Mute sound"}
            aria-pressed={muted}
          >
            {muted ? "🔇" : "🔊"}
          </button>

          <div className="control-cluster theme-toggle" role="group" aria-label="Map lighting">
            <button onClick={() => handleToggleTheme("day")} style={themeBtnStyle(theme === "day")} title="Day mode" aria-label="Day mode" aria-pressed={theme === "day"}>☀️</button>
            <button onClick={() => handleToggleTheme("sunset")} style={themeBtnStyle(theme === "sunset")} title="Sunset mode" aria-label="Sunset mode" aria-pressed={theme === "sunset"}>🌇</button>
            <button onClick={() => handleToggleTheme("night")} style={themeBtnStyle(theme === "night")} title="Night mode" aria-label="Night mode" aria-pressed={theme === "night"}>🌙</button>
          </div>

          <button
            className="primary-action"
            onClick={toggleAutoTour}
            style={{
              ...btnStyle,
              background: isTouring ? "linear-gradient(135deg, #EC4899, #8B5CF6)" : "rgba(255,255,255,0.08)",
              color: "#FFF",
              border: isTouring ? "1px solid #EC4899" : "1px solid rgba(255,255,255,0.15)",
              boxShadow: isTouring ? "0 0 16px rgba(236,72,153,0.5)" : "none",
            }}
            title="Run an automated camera tour"
            aria-pressed={isTouring}
          >
            <span aria-hidden="true">{isTouring ? "⏹️" : "🎬"}</span>
            <span className="action-label">{isTouring ? "Stop tour" : "Auto tour"}</span>
          </button>

          <button
            className="primary-action"
            onClick={() => { soundFX.playClick(); setShowLeaderboard(true); }}
            style={{ ...btnStyle, background: "linear-gradient(135deg, #F59E0B, #D97706)", color: "#FFF" }}
            title="Open the advertiser leaderboard"
          >
            <span aria-hidden="true">🏆</span>
            <span className="action-label">Leaderboard</span>
          </button>

          <button
            className="sponsor-action"
            onClick={() => { soundFX.playClick(); setShowSponsors(true); }}
            style={{
              ...btnStyle,
              background: "rgba(129, 140, 248, 0.14)",
              color: "#E0E7FF",
              border: "1px solid rgba(129, 140, 248, 0.34)",
            }}
            title="View hackathon partners"
            aria-label="View hackathon partners"
          >
            <span aria-hidden="true">✦</span>
            <span className="action-label">Partners</span>
          </button>

          <div className="settings-wrap">
            <button
              onClick={() => setShowReset(!showReset)}
              style={iconBtnStyle}
              title="Demo settings"
              aria-label="Demo settings"
              aria-expanded={showReset}
            >
              ⚙️
            </button>
            {showReset && (
              <button
                className="settings-popover"
                onClick={async () => {
                  setSelectedSpotId(null);
                  await reset();
                  await seed();
                  setShowReset(false);
                }}
                style={btnStyle}
              >
                Reset demo data
              </button>
            )}
          </div>
        </div>
      </header>

      <nav className="view-dock" aria-label="Camera views">
        {(Object.keys(presetMeta) as PresetView[]).map((preset) => {
          const item = presetMeta[preset];
          return (
            <button
              key={preset}
              className={`preset-button ${activePreset === preset ? "active" : ""}`}
              onClick={() => handlePresetSelect(preset)}
              aria-pressed={activePreset === preset}
              title={`${item.label} camera view`}
            >
              <span className="preset-icon" aria-hidden="true">{item.icon}</span>
              <span className="preset-label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ── Empty State Seed Overlay ────────────── */}
      {spots && spots.length === 0 && (
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          background: "rgba(15, 23, 42, 0.92)", backdropFilter: "blur(20px)", borderRadius: 28,
          padding: "48px 52px", textAlign: "center", border: "1px solid rgba(255,255,255,0.15)",
          boxShadow: "0 30px 100px rgba(0,0,0,0.6)", zIndex: 30,
        }}>
          <div style={{ fontSize: 64, marginBottom: 4 }}>🏙️</div>
          <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -0.5, marginBottom: 4 }}>SF Ad World</div>
          <div style={{ fontSize: 14, color: "#94A3B8", marginBottom: 28, maxWidth: 320, lineHeight: 1.6 }}>
            A 3D virtual San Francisco ad marketplace. Bid on iconic landmark spots, showcase your company logo, and dominate the SF skyline!
          </div>
          <button onClick={() => seed()} style={{
            background: "linear-gradient(135deg,#6366F1,#EC4899)", color: "#fff", border: "none",
            borderRadius: 16, padding: "18px 56px", fontSize: 18, fontWeight: 800, cursor: "pointer",
            boxShadow: "0 8px 30px rgba(99,102,241,0.5)", transition: "all .2s",
          }}>
            🚀 Launch SF City Grid →
          </button>
        </div>
      )}

      {/* ── Left Sidebar: Search & Spot Directory ── */}
      {spots && spots.length > 0 && (
        <aside className={`spot-directory ${selectedSpot ? "has-selection" : ""}`} aria-label="Landmark marketplace">
          {/* Search & Filters Panel */}
          <div className="glass-panel filter-panel" style={{
            background: "rgba(15, 23, 42, 0.82)", backdropFilter: "blur(16px)",
            borderRadius: 20, padding: "14px", border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.3)",
            pointerEvents: "auto", marginBottom: 12,
          }}>
            {/* Search Input */}
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: 10, fontSize: 15, opacity: 0.5 }}>🔍</span>
              <input
                ref={searchInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search spots, brands, neighborhoods... (/)"
                aria-label="Search landmarks, brands, or neighborhoods"
                style={sidebarInputStyle}
              />
              {search && (
                <button onClick={() => setSearch("")} style={{
                  position: "absolute", right: 10, top: 8, background: "none", border: "none",
                  color: "#94A3B8", cursor: "pointer", fontSize: 16,
                }}>×</button>
              )}
            </div>

            {/* Category Pills */}
            <div className="category-row" style={{ display: "flex", gap: 4, marginTop: 10, overflowX: "auto", paddingBottom: 2 }}>
              {categories.map((cat) => (
                <button key={cat} onClick={() => { soundFX.playClick(); setCategoryFilter(cat); }} aria-pressed={categoryFilter === cat} style={{
                  padding: "5px 10px", border: "none", borderRadius: 8,
                  fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
                  background: categoryFilter === cat ? "#6366F1" : "rgba(255,255,255,0.06)",
                  color: categoryFilter === cat ? "#FFF" : "#94A3B8",
                  textTransform: "capitalize", transition: "all .15s",
                }}>
                  {cat}
                </button>
              ))}
            </div>

            {/* Status & Sort Tabs */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", gap: 4 }}>
                {(["all", "claimed", "open"] as const).map((tab) => (
                  <button key={tab} onClick={() => setStatusTab(tab)} aria-pressed={statusTab === tab} style={{
                    padding: "4px 8px", border: "none", borderRadius: 6,
                    fontSize: 10, fontWeight: 700, cursor: "pointer",
                    background: statusTab === tab ? "rgba(99,102,241,0.2)" : "transparent",
                    color: statusTab === tab ? "#818CF8" : "#64748B",
                  }}>
                    {tab.toUpperCase()}
                  </button>
                ))}
              </div>

              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} aria-label="Sort landmarks" style={{
                background: "rgba(255,255,255,0.06)", color: "#94A3B8", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 6, padding: "3px 6px", fontSize: 10, fontWeight: 700, cursor: "pointer", outline: "none",
              }}>
                <option value="bid" style={{ background: "#0F172A" }}>Sort: Highest Bid</option>
                <option value="prestige" style={{ background: "#0F172A" }}>Sort: Prestige ⭐</option>
                <option value="height" style={{ background: "#0F172A" }}>Sort: Height 🏢</option>
                <option value="name" style={{ background: "#0F172A" }}>Sort: Name A-Z</option>
              </select>
            </div>
          </div>

          {/* Spots Directory Scroll List */}
          <div className="glass-panel spot-list" style={{
            flex: 1, overflowY: "auto", pointerEvents: "auto",
            background: "rgba(15, 23, 42, 0.82)", backdropFilter: "blur(16px)",
            borderRadius: 20, padding: "8px", border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.3)",
          }}>
            {filteredSpots.length === 0 && (
              <div style={{ padding: 36, textAlign: "center", color: "#64748B", fontSize: 13 }}>
                No spots match your filter criteria
              </div>
            )}

            {filteredSpots.map((spot) => {
              const hasAd = !!spot.adCompany;
              const isSelected = selectedSpotId === spot._id;
              return (
                <button type="button" key={spot._id} className="spot-card" onClick={() => handleSpotClick(spot as Spot)}
                  aria-pressed={isSelected}
                  aria-label={`${spot.name}, ${spot.neighborhood}, current bid $${spot.currentBid}`}
                  style={{
                    padding: "12px 14px", borderRadius: 14, cursor: "pointer",
                    marginBottom: 4, display: "flex", alignItems: "center", gap: 12,
                    transition: "all .2s",
                    background: isSelected ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.02)",
                    border: isSelected ? "1.5px solid #6366F1" : "1.5px solid transparent",
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                >
                  {/* Spot Icon / Logo */}
                  <div style={{
                    width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                    background: `linear-gradient(135deg, ${spot.color || "#6366F1"}, ${spot.color || "#6366F1"}88)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 20, boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                  }}>
                    {spot.logoUrl ? (
                      <img src={spot.logoUrl} style={{ width: 22, height: 22, objectFit: "contain" }} alt="" />
                    ) : hasAd ? "📢" : "🏢"}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{spot.name}</span>
                      {hasAd && (
                        <span style={{
                          fontSize: 9, background: "rgba(16,185,129,0.2)", color: "#34D399",
                          padding: "2px 6px", borderRadius: 4, fontWeight: 800, flexShrink: 0,
                        }}>LIVE</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{spot.neighborhood}</span>
                      {spot.prestigeScore && <span style={{ color: "#FBBF24" }}>★ {spot.prestigeScore}</span>}
                    </div>
                  </div>

                  {/* Bid Price */}
                  <div style={{
                    fontSize: 14, fontWeight: 800, color: "#818CF8",
                    background: "rgba(99,102,241,0.15)", padding: "6px 12px", borderRadius: 10, flexShrink: 0,
                  }}>
                    ${spot.currentBid}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>
      )}

      {/* ── Interactive Spot & Bid Drawer ────── */}
      {selectedSpot && (
        <section className="glass-panel bid-drawer" role="dialog" aria-label={`Bid on ${selectedSpot.name}`} style={{
          borderRadius: 24,
          background: "rgba(15, 23, 42, 0.92)", backdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
          animation: "slideUp .3s ease-out", zIndex: 30,
        }}>
          <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>

          {/* Success Overlay */}
          {bidSuccess && (
            <div role="status" aria-live="polite" style={{
              position: "absolute", inset: 0, zIndex: 40,
              background: "rgba(15, 23, 42, 0.96)", backdropFilter: "blur(16px)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              borderRadius: 24, animation: "fadeIn .2s",
            }}>
              <div style={{ fontSize: 56, marginBottom: 8 }}>🎉</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#FFF" }}>Bid Placed Successfully!</div>
              <div style={{ fontSize: 13, color: "#94A3B8", marginTop: 4 }}>Your ad is now broadcasting on the SF Skyline</div>
            </div>
          )}

          {/* Drawer Header */}
          <div style={{
            background: `linear-gradient(135deg, ${selectedSpot.color || "#6366F1"}, ${selectedSpot.color || "#6366F1"}77)`,
            padding: "18px 22px", color: "#FFF", position: "relative",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.4 }}>{selectedSpot.name}</div>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>📍 {selectedSpot.neighborhood}</span>
                  {selectedSpot.category && <span>• {selectedSpot.category}</span>}
                </div>
              </div>
              <button onClick={() => setSelectedSpotId(null)} aria-label="Close landmark details" style={{
                background: "rgba(255,255,255,0.2)", border: "none", color: "#fff",
                width: 32, height: 32, borderRadius: 10, fontSize: 18, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>×</button>
            </div>

            {/* Drawer Tabs */}
            <div style={{ display: "flex", gap: 4, marginTop: 14, background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 3 }}>
              {(["bid", "history", "specs"] as const).map((t) => (
                <button key={t} onClick={() => { soundFX.playClick(); setDrawerTab(t); }} style={{
                  flex: 1, border: "none", borderRadius: 8, padding: "5px 0",
                  fontSize: 11, fontWeight: 800, cursor: "pointer",
                  background: drawerTab === t ? "rgba(255,255,255,0.3)" : "transparent",
                  color: "#FFF", textTransform: "capitalize", transition: "all .15s",
                }}>
                  {t === "bid" ? "📢 Bid & Ad" : t === "history" ? "📜 Bid History" : "📊 Specs"}
                </button>
              ))}
            </div>
          </div>

          {/* Drawer Body */}
          <div style={{ padding: "20px 22px", background: "rgba(15, 23, 42, 0.6)" }}>
            {drawerTab === "bid" && (
              <>
                {/* Current Leader Box */}
                {selectedSpot.adCompany && (
                  <div style={{
                    background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: "14px", marginBottom: 14,
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}>
                    <div style={{ fontSize: 10, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1, fontWeight: 800 }}>Active Advertiser</div>
                    <div style={{ fontSize: 17, fontWeight: 900, color: "#FFF", marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                      {selectedSpot.logoUrl && <img src={selectedSpot.logoUrl} style={{ width: 18, height: 18, objectFit: "contain" }} alt="" />}
                      <span>{selectedSpot.adCompany}</span>
                    </div>
                    {selectedSpot.adTagline && <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{selectedSpot.adTagline}</div>}
                    {selectedSpot.adWebsite && (
                      <a href={selectedSpot.adWebsite} target="_blank" rel="noopener noreferrer" style={{
                        display: "inline-flex", alignItems: "center", gap: 4, marginTop: 8,
                        fontSize: 11, color: "#FFF", fontWeight: 800, textDecoration: "none",
                        background: "#6366F1", padding: "5px 12px", borderRadius: 8,
                      }}>
                        Visit {selectedSpot.adWebsite.replace("https://", "")} ↗
                      </a>
                    )}
                  </div>
                )}

                {/* Bid Stats */}
                <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                  <div style={{ flex: 1, background: "rgba(99,102,241,0.15)", borderRadius: 14, padding: "12px 14px", border: "1px solid rgba(99,102,241,0.3)" }}>
                    <div style={{ fontSize: 9, color: "#818CF8", textTransform: "uppercase", letterSpacing: 1, fontWeight: 800 }}>Current Highest Bid</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: "#818CF8", marginTop: 2 }}>${selectedSpot.currentBid}</div>
                  </div>
                  <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div style={{ fontSize: 9, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1, fontWeight: 800 }}>Prestige Score</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "#FBBF24", marginTop: 4 }}>
                      ★ {selectedSpot.prestigeScore || 9.0} / 10
                    </div>
                  </div>
                </div>

                {/* Quick Bid Options */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, marginBottom: 6 }}>⚡ Quick Bid Increments</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => applyQuickBid(25)} style={quickBidBtn}>+$25</button>
                    <button onClick={() => applyQuickBid(50)} style={quickBidBtn}>+$50</button>
                    <button onClick={() => applyQuickBid(100)} style={quickBidBtn}>+$100</button>
                    <button onClick={() => applyQuickBid("20%")} style={quickBidBtn}>+20%</button>
                  </div>
                </div>

                {/* Input Form */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input value={bidder} onChange={(e) => setBidder(e.target.value)} placeholder="Your name *" aria-label="Your name" autoComplete="name" style={drawerInputStyle} />
                  <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company or brand" aria-label="Company or brand" autoComplete="organization" style={drawerInputStyle} />
                  <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website (https://yourbrand.com)" aria-label="Company website" autoComplete="url" style={drawerInputStyle} />
                  <input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Short tagline" aria-label="Advertisement tagline" style={drawerInputStyle} />
                  <input type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="Logo image URL (optional)" aria-label="Logo image URL" style={drawerInputStyle} />

                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <div style={{ position: "relative", flex: 1 }}>
                      <span style={{ position: "absolute", left: 14, top: 12, fontSize: 15, color: "#818CF8", fontWeight: 900 }}>$</span>
                      <input type="number" min={selectedSpot.currentBid + 1} value={bidAmount} onChange={(e) => setBidAmount(e.target.value)} placeholder="0" aria-label="Bid amount in dollars" style={{ ...drawerInputStyle, paddingLeft: 28 }} />
                    </div>
                    <button onClick={handleBid} disabled={!bidder.trim()} style={{
                      background: bidder.trim() ? "linear-gradient(135deg,#6366F1,#EC4899)" : "#334155",
                      color: "#FFF", border: "none", borderRadius: 12, padding: "12px 24px",
                      fontSize: 15, fontWeight: 900, cursor: bidder.trim() ? "pointer" : "default",
                      boxShadow: bidder.trim() ? "0 4px 20px rgba(99,102,241,0.4)" : "none",
                      transition: "all .2s",
                    }}>
                      Place Bid →
                    </button>
                  </div>
                </div>

                {bidError && <div role="alert" style={{ color: "#F87171", fontSize: 11, marginTop: 8, fontWeight: 700 }}>⚠️ {bidError}</div>}
              </>
            )}

            {drawerTab === "history" && (
              <div style={{ maxHeight: 300, overflowY: "auto" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#94A3B8", marginBottom: 10 }}>📜 Past Bids on {selectedSpot.name}</div>
                {(!spotBids || spotBids.length === 0) ? (
                  <div style={{ padding: 24, textAlign: "center", color: "#64748B", fontSize: 13 }}>No past bids recorded yet</div>
                ) : (
                  spotBids.map((b, i) => (
                    <div key={b._id} style={{
                      background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: "10px 14px",
                      marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "#FFF" }}>{b.company || b.bidder}</div>
                        <div style={{ fontSize: 10, color: "#94A3B8" }}>by {b.bidder} • {new Date(b.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: i === 0 ? "#34D399" : "#818CF8" }}>
                        ${b.amount}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {drawerTab === "specs" && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#94A3B8", marginBottom: 12 }}>📊 Landmark Metrics</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={specCard}>
                    <div style={{ fontSize: 10, color: "#94A3B8" }}>Est. Daily Impressions</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: "#FFF", marginTop: 2 }}>
                      {(selectedSpot.impressions || 85000).toLocaleString()} / day
                    </div>
                  </div>
                  <div style={specCard}>
                    <div style={{ fontSize: 10, color: "#94A3B8" }}>3D Height Rating</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: "#818CF8", marginTop: 2 }}>
                      {selectedSpot.buildingHeight}x Scale
                    </div>
                  </div>
                  <div style={specCard}>
                    <div style={{ fontSize: 10, color: "#94A3B8" }}>Neighborhood</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#FFF", marginTop: 2 }}>
                      {selectedSpot.neighborhood}
                    </div>
                  </div>
                  <div style={specCard}>
                    <div style={{ fontSize: 10, color: "#94A3B8" }}>Map Coordinates</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginTop: 2 }}>
                      {selectedSpot.lat.toFixed(3)}, {selectedSpot.lng.toFixed(3)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {!selectedSpot && spots && spots.length > 0 && (
        <div className="map-help" aria-hidden="true">
          <span>Drag to explore · scroll to zoom · select a landmark to bid</span>
          <kbd>/</kbd><span>search</span>
        </div>
      )}

      {/* ── Real-Time Activity Ticker ──────────── */}
      {recentBids && recentBids.length > 0 && (
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 40,
          background: "rgba(15, 23, 42, 0.95)", backdropFilter: "blur(12px)",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          display: "flex", alignItems: "center", overflow: "hidden", zIndex: 20,
        }}>
          <div style={{
            background: "#6366F1", color: "#FFF", padding: "0 14px", height: "100%",
            display: "flex", alignItems: "center", fontSize: 11, fontWeight: 900,
            letterSpacing: 0.5, flexShrink: 0, zIndex: 5,
          }}>
            ⚡ LIVE ACTIVITY
          </div>
          <div style={{
            display: "flex", gap: 32, animation: "ticker 35s linear infinite",
            whiteSpace: "nowrap", paddingLeft: 20,
          }}>
            <style>{`@keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}`}</style>
            {recentBids.concat(recentBids).map((bid, i) => (
              <span key={i} style={{ fontSize: 12, fontWeight: 700, color: "#CBD5E1", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#34D399" }}>🚀 {bid.company || bid.bidder}</span>
                <span>placed</span>
                <span style={{ color: "#FBBF24", fontWeight: 900 }}>${bid.amount}</span>
                <span>on</span>
                <span style={{ color: "#FFF" }}>{bid.spotName}</span>
                <span style={{ opacity: 0.4, margin: "0 8px" }}>•</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Leaderboard Modal ─────────────────── */}
      {showLeaderboard && spots && (
        <div className="leaderboard-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setShowLeaderboard(false);
        }} style={{
          position: "absolute", inset: 0, zIndex: 60,
          background: "rgba(15, 23, 42, 0.8)", backdropFilter: "blur(20px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div className="glass-panel leaderboard-panel" role="dialog" aria-modal="true" aria-labelledby="leaderboard-title" style={{
            background: "#0F172A", borderRadius: 28,
            border: "1px solid rgba(255,255,255,0.15)", padding: 28,
            boxShadow: "0 30px 100px rgba(0,0,0,0.6)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div id="leaderboard-title" style={{ fontSize: 22, fontWeight: 900 }}>🏆 Top Advertisers</div>
              <button onClick={() => setShowLeaderboard(false)} aria-label="Close leaderboard" style={iconBtnStyle}>×</button>
            </div>

            <div style={{ maxHeight: 360, overflowY: "auto" }}>
              {spots.filter((s) => s.adCompany).sort((a, b) => b.currentBid - a.currentBid).map((s, idx) => (
                <div key={s._id} style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "12px 16px",
                  background: idx === 0 ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.03)",
                  borderRadius: 14, marginBottom: 8, border: idx === 0 ? "1px solid #F59E0B" : "1px solid rgba(255,255,255,0.06)",
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 10, background: idx === 0 ? "#F59E0B" : "#334155",
                    color: "#FFF", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
                  }}>
                    #{idx + 1}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 900, color: "#FFF" }}>{s.adCompany}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8" }}>Landmark: {s.name}</div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: "#34D399" }}>${s.currentBid}</div>
                    <div style={{ fontSize: 10, color: "#FBBF24" }}>★ {s.prestigeScore || 9.0}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Hackathon Partners Modal ───────────── */}
      {showSponsors && (
        <div className="leaderboard-backdrop sponsors-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setShowSponsors(false);
        }} style={{
          position: "absolute", inset: 0, zIndex: 60,
          background: "rgba(15, 23, 42, 0.8)", backdropFilter: "blur(20px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <section className="glass-panel sponsors-panel" role="dialog" aria-modal="true" aria-labelledby="sponsors-title">
            <div className="sponsors-header">
              <div>
                <div className="eyebrow">HACKATHON PARTNERS</div>
                <h2 id="sponsors-title">Built for these challenges</h2>
                <p>SF Ad World is designed to be social, useful, and a little unexpected.</p>
              </div>
              <button onClick={() => setShowSponsors(false)} aria-label="Close partners" style={iconBtnStyle}>×</button>
            </div>

            <div className="sponsor-grid">
              {sponsors.map((sponsor) => (
                <article key={sponsor.name} className="sponsor-card" style={{ "--sponsor-color": sponsor.color } as React.CSSProperties}>
                  <div className="sponsor-mark" aria-hidden="true">{sponsor.mark}</div>
                  <div className="sponsor-copy">
                    <div className="sponsor-name-row">
                      <h3>{sponsor.name}</h3>
                      {sponsor.live && <span className="live-integration">LIVE IN APP</span>}
                    </div>
                    <div className="sponsor-challenge">{sponsor.challenge}</div>
                    <p>{sponsor.description}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className="sponsors-footer">
              <span aria-hidden="true">✦</span> Powered by real-time bidding, shared city moments, and playful experimentation.
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/* ── Inline Style Helpers ────────────────────────── */
const presetMeta: Record<PresetView, { icon: string; label: string }> = {
  overview: { icon: "◎", label: "Overview" },
  transamericacar: { icon: "🚘", label: "Pyramid drive" },
  cardrive: { icon: "🚗", label: "Embarcadero" },
  downtown: { icon: "▦", label: "Downtown" },
  financial: { icon: "$", label: "Financial" },
  waterfront: { icon: "≈", label: "Waterfront" },
  goldengate: { icon: "🌉", label: "Golden Gate" },
};

const sponsors = [
  {
    name: "RevenueCat",
    mark: "R",
    challenge: "Subscriptions",
    description: "Make a city experience people would want to return to.",
    color: "#7C5CFF",
    live: false,
  },
  {
    name: "Convex",
    mark: "C",
    challenge: "Multiplayer",
    description: "Real-time bids and landmark ownership stay in sync for everyone.",
    color: "#EE342F",
    live: true,
  },
  {
    name: "Linkup",
    mark: "L",
    challenge: "Deep research",
    description: "A path toward source-backed neighborhood and audience insights.",
    color: "#2DD4BF",
    live: false,
  },
  {
    name: "Nebius",
    mark: "N",
    challenge: "Applied AI",
    description: "A foundation for smarter campaign ideas and ad creative support.",
    color: "#FF8C42",
    live: false,
  },
  {
    name: "Render",
    mark: "R",
    challenge: "Workflows",
    description: "A natural fit for resilient campaign and city-event workflows.",
    color: "#46E3B7",
    live: false,
  },
  {
    name: "NERDCONF",
    mark: "N",
    challenge: "Fun build",
    description: "Because bidding on an animated virtual skyline should be fun.",
    color: "#F472B6",
    live: false,
  },
] as const;

const pillStyle = (bg: string): React.CSSProperties => ({
  background: `${bg}22`, color: bg, fontSize: 11, fontWeight: 800,
  padding: "5px 12px", borderRadius: 10, border: `1px solid ${bg}44`, whiteSpace: "nowrap",
});

const btnStyle: React.CSSProperties = {
  border: "none", borderRadius: 10, padding: "6px 14px",
  fontSize: 12, fontWeight: 800, cursor: "pointer", transition: "all .15s",
};

const iconBtnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)", color: "#FFF", border: "1px solid rgba(255,255,255,0.1)",
  width: 32, height: 32, borderRadius: 10, fontSize: 15, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
};

const themeBtnStyle = (active: boolean): React.CSSProperties => ({
  background: active ? "rgba(255,255,255,0.2)" : "transparent",
  border: "none", borderRadius: 8, padding: "4px 8px", fontSize: 12, cursor: "pointer",
});

const sidebarInputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px 10px 36px", border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12, fontSize: 12, outline: "none", boxSizing: "border-box",
  background: "rgba(0,0,0,0.3)", color: "#FFF", fontFamily: "inherit",
};

const drawerInputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.1)", fontSize: 12,
  outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  background: "rgba(0,0,0,0.3)", color: "#FFF",
};

const quickBidBtn: React.CSSProperties = {
  flex: 1, padding: "6px 0", background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
  color: "#818CF8", fontSize: 11, fontWeight: 800, cursor: "pointer",
};

const specCard: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: "10px 12px",
  border: "1px solid rgba(255,255,255,0.06)",
};
