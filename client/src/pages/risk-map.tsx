import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Map, AlertTriangle, Info } from "lucide-react";
import "leaflet/dist/leaflet.css";

export interface MapPoint {
  id: string;
  lat: number;
  lon: number;
  frictionScore: number | null;
  status: string;
  lossType: string | null;
  carrier: string | null;
  claimIdentifier: string;
}

function frictionColor(score: number | null): string {
  if (score == null) return "#6b7280";
  if (score >= 60) return "#ef4444";
  if (score >= 30) return "#f59e0b";
  return "#22c55e";
}

function frictionLabel(score: number | null): string {
  if (score == null) return "Unknown";
  if (score >= 60) return "High Risk";
  if (score >= 30) return "Moderate";
  return "Low Risk";
}

export default function RiskMapPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);

  const { data: points, isLoading, error } = useQuery<MapPoint[]>({
    queryKey: ["/api/claims/map-points"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/claims/map-points");
      return res.json();
    },
  });

  useEffect(() => {
    if (!mapRef.current || !points || points.length === 0) return;

    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;

      if (cancelled || !mapRef.current) return;

      // Destroy previous instance if hot-reloading
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove();
        mapInstanceRef.current = null;
      }

      // Center on US by default; fit to points if available
      const map = L.map(mapRef.current, {
        center: [39.5, -98.35],
        zoom: 4,
        zoomControl: true,
      });
      mapInstanceRef.current = map;

      // CartoDB Dark Matter tiles — works well with dark UI
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 19,
        }
      ).addTo(map);

      const validPoints = points.filter((p) => p.lat && p.lon);

      if (validPoints.length > 0) {
        const group = L.featureGroup();

        for (const p of validPoints) {
          const color = frictionColor(p.frictionScore);
          const marker = L.circleMarker([p.lat, p.lon], {
            radius: 8,
            fillColor: color,
            color: "#1a1a2e",
            weight: 1.5,
            opacity: 1,
            fillOpacity: 0.85,
          });

          const scoreStr = p.frictionScore != null ? `${p.frictionScore}/100` : "N/A";
          marker.bindPopup(`
            <div style="font-family:system-ui,sans-serif;font-size:12px;min-width:160px;line-height:1.5">
              <div style="font-weight:600;margin-bottom:4px">${p.claimIdentifier}</div>
              <div style="color:#9ca3af">Status: <span style="color:#e5e7eb">${p.status.replace(/_/g, " ")}</span></div>
              ${p.carrier ? `<div style="color:#9ca3af">Carrier: <span style="color:#e5e7eb">${p.carrier}</span></div>` : ""}
              ${p.lossType ? `<div style="color:#9ca3af">Loss Type: <span style="color:#e5e7eb">${p.lossType}</span></div>` : ""}
              <div style="color:#9ca3af">Friction Score: <span style="color:${color};font-weight:600">${scoreStr}</span></div>
              <div style="color:#9ca3af">Risk: <span style="color:${color}">${frictionLabel(p.frictionScore)}</span></div>
            </div>
          `);

          marker.addTo(group);
        }

        group.addTo(map);

        // Fit map to markers with padding
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

  // Clean up map on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const geocodedCount = points?.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-risk-map-title">
            <Map className="w-6 h-6 text-primary" />
            Risk Map
          </h1>
          <p className="text-sm text-muted-foreground">
            Geographic distribution of claims colored by friction score.
          </p>
        </div>
        {!isLoading && (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-4 text-xs rounded-md border border-border bg-card/50 px-3 py-2">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" />Low Risk (&lt;30)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block" />Moderate (30–60)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" />High Risk (&gt;60)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-500 inline-block" />No Score</span>
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-[600px] w-full rounded-xl" data-testid="map-loading" />
      ) : error ? (
        <Card>
          <CardContent className="py-10 text-center">
            <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Failed to load map data.</p>
          </CardContent>
        </Card>
      ) : geocodedCount === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3" data-testid="map-empty">
            <Map className="w-10 h-10 mx-auto opacity-30" />
            <p className="text-sm text-muted-foreground">No claims with geocodable location data found.</p>
            <p className="text-xs text-muted-foreground/70">Add a ZIP code or city to your claims to see them on the map.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <div
            ref={mapRef}
            className="w-full rounded-xl overflow-hidden border border-border"
            style={{ height: 600 }}
            data-testid="map-container"
          />
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="w-3 h-3" />
            <span>{geocodedCount} claim{geocodedCount === 1 ? "" : "s"} plotted. Click a marker for details.</span>
            {points && points.length > 0 && <Badge variant="outline" className="text-[10px] ml-1">ZIP/city geocoded</Badge>}
          </div>
        </div>
      )}
    </div>
  );
}
