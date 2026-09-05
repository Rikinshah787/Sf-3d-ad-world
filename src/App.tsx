import { useState, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import SFMap, { type SFMapHandle, type Spot } from "./components/SFMap";

export default function App() {
  const spots = useQuery(api.spots.listSpots);
  const placeBid = useMutation(api.spots.placeBid);
  const seed = useMutation(api.seed.seedSpots);
  const reset = useMutation(api.seed.resetSpots);

  const mapRef = useRef<SFMapHandle>(null);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [bidder, setBidder] = useState("");
  const [bidAmount, setBidAmount] = useState("");
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [tagline, setTagline] = useState("");
  const [bidError, setBidError] = useState("");
  const [bidSuccess, setBidSuccess] = useState(false);
  const [search, setSearch] = useState("");
  const [showReset, setShowReset] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"all" | "claimed" | "open">("all");

  // Filter spots by search + tab
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
    if (sidebarTab === "claimed") result = result.filter((s) => s.adCompany);
    if (sidebarTab === "open") result = result.filter((s) => !s.adCompany);
    return result;
  }, [spots, search, sidebarTab]);

  const handleBid = async () => {
    if (!selectedSpot || !bidder.trim()) return;
    const amount = parseFloat(bidAmount);
    if (isNaN(amount) || amount <= selectedSpot.currentBid) {
      setBidError(`Must be higher than $${selectedSpot.currentBid}`);
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
      });
      setBidError("");
      setBidSuccess(true);
      setTimeout(() => {
        setBidSuccess(false);
        setBidAmount("");
        setCompany("");
        setWebsite("");
        setTagline("");
        setSelectedSpot(null);
      }, 1800);
    } catch (e: any) {
      setBidError(e.message || "Bid failed");
    }
  };

  const handleSpotClick = useCallback((spot: Spot) => {
    setSelectedSpot(spot);
    setBidAmount(String(Math.ceil(spot.currentBid * 1.1)));
    setBidError("");
    setBidSuccess(false);
    mapRef.current?.flyTo(spot.lng, spot.lat);
  }, []);

  const claimedCount = spots?.filter((s) => s.adCompany).length ?? 0;
  const totalBids = spots?.reduce((s, sp) => s + sp.currentBid, 0) ?? 0;
  const topBid = spots?.reduce((max, s) => Math.max(max, s.currentBid), 0) ?? 0;

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative", overflow: "hidden", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" }}>
      <SFMap ref={mapRef} spots={(spots ?? []) as Spot[]} onSpotClick={handleSpotClick} highlightId={selectedSpot?._id} />

      {/* ── Top Bar ──────────────────────────── */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        background: "linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.15) 70%, transparent 100%)",
        padding: "14px 20px 28px", display: "flex", alignItems: "center", gap: 14,
        pointerEvents: "none",
      }}>
        <div style={{ pointerEvents: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 26 }}>🏙️</span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: -0.5, lineHeight: 1 }}>SF Ad World</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 500, letterSpacing: 0.5 }}>REAL-TIME BILLBOARD BIDDING</div>
          </div>
        </div>

        {/* Live stats pills */}
        <div style={{ display: "flex", gap: 8, marginLeft: 8 }}>
          <span style={pillStyle("#4F46E5")}>{claimedCount}/{spots?.length ?? 0} claimed</span>
          <span style={pillStyle("#059669")}>${totalBids.toLocaleString()} total</span>
          <span style={pillStyle("#D97706")}>🔥 top ${topBid}</span>
        </div>

        <div style={{ flex: 1 }} />
        <div style={{ pointerEvents: "auto", fontSize: 14, color: "rgba(255,255,255,0.35)", cursor: "pointer" }} onClick={() => setShowReset(!showReset)}>⚙️</div>
        {showReset && (
          <button onClick={async () => { await reset(); await seed(); setShowReset(false); }}
            style={{ ...btnSmall, background: "#EF4444", pointerEvents: "auto" }}>
            Reset & Re-seed
          </button>
        )}
      </div>

      {/* ── Seed overlay ─────────────────────── */}
      {spots && spots.length === 0 && (
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          background: "rgba(255,255,255,0.97)", borderRadius: 28, padding: "48px 52px", textAlign: "center",
          boxShadow: "0 30px 100px rgba(0,0,0,0.4)",
          backdropFilter: "blur(24px)",
        }}>
          <div style={{ fontSize: 56, marginBottom: 4 }}>🏙️</div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5, marginBottom: 2 }}>SF Ad World</div>
          <div style={{ fontSize: 13, color: "#888", marginBottom: 24, maxWidth: 300, lineHeight: 1.6 }}>
            A virtual LEGO city of San Francisco. Bid on famous landmarks, advertise your company, and visitors can discover your brand.
          </div>
          <button onClick={() => seed()} style={{
            background: "linear-gradient(135deg,#4F46E5,#7C3AED)", color: "#fff", border: "none",
            borderRadius: 16, padding: "18px 52px", fontSize: 18, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 8px 24px rgba(79,70,229,0.4)",
          }}>
            Launch City →
          </button>
        </div>
      )}

      {/* ── Sidebar: Search + Spots List ──────── */}
      {spots && spots.length > 0 && (
        <div style={{
          position: "absolute", top: 72, left: 16, bottom: 16,
          width: 320, display: "flex", flexDirection: "column",
          pointerEvents: "none",
        }}>
          {/* Search bar */}
          <div style={{
            background: "rgba(255,255,255,0.95)", borderRadius: 16, padding: "10px 14px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
            pointerEvents: "auto",
            backdropFilter: "blur(16px)",
            marginBottom: 10,
          }}>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 10, top: 9, fontSize: 16, opacity: 0.4 }}>🔍</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search spots, neighborhoods, companies..."
                style={{
                  width: "100%", padding: "10px 12px 10px 36px", border: "2px solid #E5E7EB",
                  borderRadius: 12, fontSize: 13, outline: "none", boxSizing: "border-box",
                  background: "#F9FAFB", fontFamily: "inherit",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#4F46E5")}
                onBlur={(e) => (e.target.style.borderColor = "#E5E7EB")}
              />
            </div>
            {/* Tabs */}
            <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
              {(["all", "claimed", "open"] as const).map((tab) => (
                <button key={tab} onClick={() => setSidebarTab(tab)} style={{
                  flex: 1, padding: "6px 0", border: "none", borderRadius: 8,
                  fontSize: 11, fontWeight: 700, cursor: "pointer",
                  background: sidebarTab === tab ? "#4F46E5" : "#F3F4F6",
                  color: sidebarTab === tab ? "#fff" : "#888",
                  textTransform: "uppercase", letterSpacing: 0.5,
                }}>
                  {tab === "all" ? `All (${spots.length})` : tab === "claimed" ? `Claimed (${claimedCount})` : `Open (${spots.length - claimedCount})`}
                </button>
              ))}
            </div>
          </div>

          {/* Spot list */}
          <div style={{
            flex: 1, overflowY: "auto", pointerEvents: "auto",
            background: "rgba(255,255,255,0.92)",
            borderRadius: 16, padding: "6px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            backdropFilter: "blur(16px)",
          }}>
            {filteredSpots.length === 0 && (
              <div style={{ padding: 32, textAlign: "center", color: "#999", fontSize: 13 }}>
                No spots found for "{search}"
              </div>
            )}
            {filteredSpots.map((spot) => {
              const hasAd = !!spot.adCompany;
              const isSelected = selectedSpot?._id === spot._id;
              return (
                <div key={spot._id} onClick={() => handleSpotClick(spot as Spot)}
                  style={{
                    padding: "12px 14px", borderRadius: 14, cursor: "pointer",
                    marginBottom: 2, display: "flex", alignItems: "center", gap: 12,
                    transition: "all .15s",
                    background: isSelected ? "#EEF2FF" : "transparent",
                    border: isSelected ? "2px solid #4F46E5" : "2px solid transparent",
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "#F8FAFC"; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                >
                  {/* Color dot */}
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: `linear-gradient(135deg, ${spot.color || "#4F46E5"}, ${spot.color || "#4F46E5"}99)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 18, color: "#fff", fontWeight: 800,
                    boxShadow: `0 2px 8px ${spot.color || "#4F46E5"}44`,
                  }}>
                    {hasAd ? "📢" : "🏢"}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{spot.name}</span>
                      {hasAd && <span style={{
                        fontSize: 8, background: "#DCFCE7", color: "#166534",
                        padding: "2px 5px", borderRadius: 4, fontWeight: 800, flexShrink: 0,
                      }}>LIVE</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 1 }}>
                      {hasAd ? `${spot.adCompany} · ${spot.neighborhood}` : spot.neighborhood}
                    </div>
                  </div>

                  <div style={{
                    fontSize: 14, fontWeight: 800, color: "#4F46E5",
                    background: "#EEF2FF", padding: "5px 12px", borderRadius: 8, flexShrink: 0,
                  }}>
                    ${spot.currentBid}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Bid + Advertise Panel (right side) ── */}
      {selectedSpot && (
        <div style={{
          position: "absolute", bottom: 20, right: 20,
          width: 370, borderRadius: 24, overflow: "hidden",
          boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
          animation: "slideUp .35s ease-out",
        }}>
          <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>

          {/* Success overlay */}
          {bidSuccess && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 10,
              background: "rgba(255,255,255,0.95)", display: "flex",
              flexDirection: "column", alignItems: "center", justifyContent: "center",
              borderRadius: 24,
            }}>
              <div style={{ fontSize: 56, marginBottom: 8 }}>🎉</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#111" }}>Bid Placed!</div>
              <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>Your ad is now live on the map</div>
            </div>
          )}

          {/* Color header */}
          <div style={{
            background: `linear-gradient(135deg, ${selectedSpot.color || "#4F46E5"}, ${selectedSpot.color || "#4F46E5"}88)`,
            padding: "18px 22px", color: "#fff",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div>
                <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.3 }}>{selectedSpot.name}</div>
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 1 }}>📍 {selectedSpot.neighborhood}</div>
              </div>
              <button onClick={() => setSelectedSpot(null)} style={{
                background: "rgba(255,255,255,0.2)", border: "none", color: "#fff",
                width: 30, height: 30, borderRadius: 10, fontSize: 18, cursor: "pointer",
              }}>×</button>
            </div>
          </div>

          <div style={{ background: "#fff", padding: "18px 22px" }}>
            {/* Current ad info */}
            {selectedSpot.adCompany && (
              <div style={{
                background: "#F8FAFC", borderRadius: 14, padding: "14px 16px", marginBottom: 14,
                border: "1px solid #E2E8F0",
              }}>
                <div style={{ fontSize: 10, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>
                  Current Advertiser
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#111", marginTop: 3 }}>{selectedSpot.adCompany}</div>
                {selectedSpot.adTagline && <div style={{ fontSize: 11, color: "#64748B", marginTop: 1 }}>{selectedSpot.adTagline}</div>}
                {selectedSpot.adWebsite && (
                  <a href={selectedSpot.adWebsite} target="_blank" rel="noopener noreferrer" style={{
                    display: "inline-flex", alignItems: "center", gap: 4, marginTop: 8,
                    fontSize: 12, color: "#fff", fontWeight: 700, textDecoration: "none",
                    background: "#4F46E5", padding: "6px 14px", borderRadius: 8,
                  }}>
                    Visit {selectedSpot.adWebsite.replace("https://", "")} ↗
                  </a>
                )}
              </div>
            )}

            {/* Bid stats */}
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1, background: "#EEF2FF", borderRadius: 12, padding: "10px 14px" }}>
                <div style={{ fontSize: 9, color: "#6366F1", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Current Bid</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: "#4F46E5" }}>${selectedSpot.currentBid}</div>
              </div>
              <div style={{ flex: 1, background: "#F8FAFC", borderRadius: 12, padding: "10px 14px" }}>
                <div style={{ fontSize: 9, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Leader</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#111", marginTop: 5 }}>{selectedSpot.highestBidder || "None yet!"}</div>
              </div>
            </div>

            {/* Form */}
            <div style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 6 }}>🏷️ Place your bid & advertise</div>

            <input value={bidder} onChange={(e) => setBidder(e.target.value)}
              placeholder="Your name *" style={inputStyle} />
            <input value={company} onChange={(e) => setCompany(e.target.value)}
              placeholder="Company name" style={inputStyle} />
            <input value={website} onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://your-website.com" style={inputStyle} />
            <input value={tagline} onChange={(e) => setTagline(e.target.value)}
              placeholder="Short tagline (e.g. Build faster)" style={inputStyle} />

            <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
              <div style={{ position: "relative", flex: 1 }}>
                <span style={{ position: "absolute", left: 12, top: 11, fontSize: 14, color: "#999", fontWeight: 700 }}>$</span>
                <input type="number" value={bidAmount} onChange={(e) => setBidAmount(e.target.value)}
                  placeholder="0" style={{ ...inputStyle, paddingLeft: 26, marginBottom: 0 }} />
              </div>
              <button onClick={handleBid} disabled={!bidder.trim()} style={{
                background: bidder.trim() ? "linear-gradient(135deg,#4F46E5,#7C3AED)" : "#D1D5DB",
                color: "#fff", border: "none", borderRadius: 12,
                padding: "12px 28px", fontSize: 15, fontWeight: 700,
                cursor: bidder.trim() ? "pointer" : "default",
                boxShadow: bidder.trim() ? "0 4px 16px rgba(79,70,229,0.35)" : "none",
                transition: "all .2s",
              }}>
                Bid →
              </button>
            </div>
            {bidError && <div style={{ color: "#EF4444", fontSize: 11, marginTop: 5, fontWeight: 600 }}>⚠️ {bidError}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Styles ────────────────────────────── */
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "2px solid #E5E7EB", fontSize: 13, marginBottom: 6,
  outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  transition: "border-color .2s",
};

const pillStyle = (bg: string): React.CSSProperties => ({
  background: `${bg}22`, color: bg, fontSize: 11, fontWeight: 700,
  padding: "4px 10px", borderRadius: 8, whiteSpace: "nowrap",
});

const btnSmall: React.CSSProperties = {
  color: "#fff", border: "none", borderRadius: 8,
  padding: "6px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer",
};
