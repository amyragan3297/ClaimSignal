import { useEffect, useRef, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Map, AlertTriangle, Info, X, Filter } from "lucide-react";
import { Link } from "wouter";
import "leaflet/dist/leaflet.css";

export interface MapPoint {
  id: string;
  lat: number;
  lon: number;
  frictionScore: number | null;
  riskScore: number | null;
  status: string;
  lossType: string | null;
  carrier: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  lifecyclePhase: string | null;
  dateOfLoss: string | null;
  claimIdentifier: string;
}

// 4-band risk score coloring: 0-30 low, 31-60 moderate, 61-80 elevated, 81+ high
function riskColor(score: number | null): string {
  if (score == null) return "#6b7280";
  if (score > 80) return "#ef4444";
  if (score > 60) return "#f97316";
  if (score > 30) return "#f59e0b";
  return "#22c55e";
}

function riskLabel(score: number | null): string {
  if (score == null) return "No Score";
  if (score > 80) return "High Risk";
  if (score > 60) return "Elevated";
  if (score > 30) return "Moderate";
  return "Low Risk";
}

// Safe HTML escaping to prevent XSS in Leaflet popup content
function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function buildPopupHtml(p: MapPoint, origin: string): string {
  const color = riskColor(p.riskScore);
  const scoreStr = p.riskScore != null ? `${p.riskScore}/100` : "N/A";
  const location = [p.city, p.state].filter(Boolean).join(", ") || p.zipCode || "";
  return `
    <div style="font-family:system-ui,sans-serif;font-size:12px;min-width:180px;line-height:1.6">
      <div style="font-weight:700;margin-bottom:4px;font-size:13px">${esc(p.claimIdentifier)}</div>
      <div style="color:#9ca3af">Status: <span style="color:#e5e7eb;text-transform:capitalize">${esc(p.status.replace(/_/g, " "))}</span></div>
      ${p.carrier ? `<div style="color:#9ca3af">Carrier: <span style="color:#e5e7eb">${esc(p.carrier)}</span></div>` : ""}
      ${p.lossType ? `<div style="color:#9ca3af">Loss Type: <span style="color:#e5e7eb">${esc(p.lossType)}</span></div>` : ""}
      ${location ? `<div style="color:#9ca3af">Location: <span style="color:#e5e7eb">${esc(location)}</span></div>` : ""}
      ${p.dateOfLoss ? `<div style="color:#9ca3af">Date of Loss: <span style="color:#e5e7eb">${esc(p.dateOfLoss)}</span></div>` : ""}
      ${p.lifecyclePhase ? `<div style="color:#9ca3af">Phase: <span style="color:#e5e7eb">${esc(p.lifecyclePhase.replace(/_/g, " "))}</span></div>` : ""}
      <div style="color:#9ca3af;margin-top:4px">
        Risk Score: <span style="color:${color};font-weight:700">${esc(scoreStr)}</span>
        <span style="color:${color}"> · ${esc(riskLabel(p.riskScore))}</span>
      </div>
      <div style="margin-top:8px">
        <a href="${origin}/claims/${esc(p.id)}" style="color:#3b82f6;text-decoration:underline;font-size:11px">View Claim →</a>
      </div>
    </div>
  `;
}

export default function RiskMapPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const [filterLossType, setFilterLossType] = useState<string | null>(null);
  const [filterDateMin, setFilterDateMin] = useState("");
  const [filterDateMax, setFilterDateMax] = useState("");

  const { data: allPoints, isLoading, error } = useQuery<MapPoint[]>({
    queryKey: ["/api/claims/map-points"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/claims/map-points");
      return res.json();
    },
  });

  const lossTypes = useMemo(() => {
    if (!allPoints) return [];
    return Array.from(new Set(allPoints.map((p) => p.lossType).filter(Boolean) as string[])).sort();
  }, [allPoints]);

  const points = useMemo(() => {
    if (!allPoints) return [];
    return allPoints.filter((p) => {
      if (filterLossType && p.lossType !== filterLossType) return false;
      if (filterDateMin && p.dateOfLoss && p.dateOfLoss < filterDateMin) return false;
      if (filterDateMax && p.dateOfLoss && p.dateOfLoss > filterDateMax) return false;
      return true;
    });
  }, [allPoints, filterLossType, filterDateMin, filterDateMax]);

  const hasFilters = !!filterLossType || !!filterDateMin || !!filterDateMax;

  useEffect(() => {
    if (!mapRef.current) return;

    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapRef.current) return;

      // Destroy and recreate when filters change
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove();
        mapInstanceRef.current = null;
      }

      const map = L.map(mapRef.current, {
        center: [39.5, -98.35],
        zoom: 4,
        zoomControl: true,
      });
      mapInstanceRef.current = map;

      // CartoDB Dark Matter — works well with dark UI
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 19,
        }
      ).addTo(map);

      const origin = window.location.origin;
      const validPoints = points.filter((p) => p.lat && p.lon);

      if (validPoints.length > 0) {
        const group = L.featureGroup();

        for (const p of validPoints) {
          const color = riskColor(p.riskScore);
          const marker = L.circleMarker([p.lat, p.lon], {
            radius: 9,
            fillColor: color,
            color: "#0f172a",
            weight: 1.5,
            opacity: 1,
            fillOpacity: 0.85,
          });

          marker.bindPopup(buildPopupHtml(p, origin), {
            maxWidth: 260,
            className: "leaflet-popup-dark",
          });

          marker.addTo(group);
        }

        group.addTo(map);
        try {
          map.fitBounds(group.getBounds().pad(0.15));
        } catch {
          // bounds too small — keep default US center
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [points]);

  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const geocodedCount = points.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-risk-map-title">
            <Map className="w-6 h-6 text-primary" />
            Risk Map
          </h1>
          <p className="text-sm text-muted-foreground">
            Geographic distribution of claims colored by risk score.
          </p>
        </div>
        {!isLoading && (
          <div className="flex items-center gap-2 text-xs rounded-md border border-border bg-card/50 px-3 py-2">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" />Low (0–30)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />Moderate (31–60)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-orange-500 inline-block" />Elevated (61–80)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" />High (&gt;80)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-500 inline-block" />No Score</span>
          </div>
        )}
      </div>

      {/* Filter bar */}
      {!isLoading && allPoints && allPoints.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap rounded-md border border-border bg-card/30 px-3 py-2" data-testid="section-map-filters">
          <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

          {/* Loss type chips */}
          {lossTypes.map((lt) => (
            <button
              key={lt}
              onClick={() => setFilterLossType(filterLossType === lt ? null : lt)}
              data-testid={`filter-losstype-${lt}`}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                filterLossType === lt
                  ? "border-primary bg-primary/15 text-primary font-medium"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {lt}
              {filterLossType === lt && <X className="w-2.5 h-2.5" />}
            </button>
          ))}

          {/* Date range */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto">
            <span>Loss date:</span>
            <Input
              type="date"
              value={filterDateMin}
              onChange={(e) => setFilterDateMin(e.target.value)}
              className="h-6 w-[130px] text-xs px-1.5"
              data-testid="input-filter-date-min"
            />
            <span>–</span>
            <Input
              type="date"
              value={filterDateMax}
              onChange={(e) => setFilterDateMax(e.target.value)}
              className="h-6 w-[130px] text-xs px-1.5"
              data-testid="input-filter-date-max"
            />
            {hasFilters && (
              <button
                onClick={() => { setFilterLossType(null); setFilterDateMin(""); setFilterDateMax(""); }}
                className="text-xs text-primary hover:underline ml-1"
                data-testid="button-clear-map-filters"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-[600px] w-full rounded-xl" data-testid="map-loading" />
      ) : error ? (
        <Card>
          <CardContent className="py-10 text-center">
            <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Failed to load map data.</p>
          </CardContent>
        </Card>
      ) : (allPoints ?? []).length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3" data-testid="map-empty">
            <Map className="w-10 h-10 mx-auto opacity-30" />
            <p className="text-sm text-muted-foreground">No claims with geocodable location data found.</p>
            <p className="text-xs text-muted-foreground/70">Add a ZIP code or city to your claims to see them on the map.</p>
          </CardContent>
        </Card>
      ) : geocodedCount === 0 ? (
        <Card>
          <CardContent className="py-10 text-center" data-testid="map-filtered-empty">
            <p className="text-sm text-muted-foreground">No claims match the active filters.</p>
            <button onClick={() => { setFilterLossType(null); setFilterDateMin(""); setFilterDateMax(""); }} className="mt-2 text-xs text-primary hover:underline">Clear filters</button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <div
            ref={mapRef}
            className="w-full rounded-xl overflow-hidden border border-border"
            style={{ height: 580 }}
            data-testid="map-container"
          />
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="w-3 h-3" />
            <span>{geocodedCount} claim{geocodedCount === 1 ? "" : "s"} plotted{hasFilters ? " (filtered)" : ""}. Click a marker for details.</span>
            <Badge variant="outline" className="text-[10px] ml-1">ZIP/city geocoded</Badge>
            <span className="ml-auto">
              <Link href="/claims" className="text-primary hover:underline text-xs">← Back to Claims</Link>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
