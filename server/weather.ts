import type { Claim } from "@shared/schema";

export interface ClaimWeather {
  location: string;
  date: string;
  latitude: number;
  longitude: number;
  tempMaxC: number | null;
  tempMinC: number | null;
  tempMaxF: number | null;
  tempMinF: number | null;
  precipitationMm: number | null;
  precipitationIn: number | null;
  rainMm: number | null;
  snowfallCm: number | null;
  snowfallIn: number | null;
  windGustMaxKmh: number | null;
  windGustMaxMph: number | null;
  windSpeedMaxKmh: number | null;
  windSpeedMaxMph: number | null;
  weatherCode: number | null;
  isHail: boolean;
  summary: string;
}

// WMO weather codes that indicate hail events
const HAIL_CODES = new Set([96, 99]);

const WEATHER_CODE_LABELS: Record<number, string> = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Depositing rime fog",
  51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
  61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
  66: "Freezing rain", 67: "Heavy freezing rain",
  71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
  85: "Slight snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
};

const cToF = (c: number) => Math.round((c * 9) / 5 + 32);
const kmhToMph = (k: number) => Math.round(k * 0.621371);
const mmToIn = (mm: number) => Math.round(mm * 0.0393701 * 100) / 100;
const cmToIn = (cm: number) => Math.round(cm * 0.393701 * 100) / 100;

function buildSummary(w: Omit<ClaimWeather, "summary">): string {
  const parts: string[] = [];
  if (w.weatherCode != null && WEATHER_CODE_LABELS[w.weatherCode]) parts.push(WEATHER_CODE_LABELS[w.weatherCode]);
  if (w.isHail) parts.push("hail recorded");
  if (w.windGustMaxMph != null && w.windGustMaxMph >= 37) parts.push(`damaging wind gusts to ${w.windGustMaxMph} mph`);
  else if (w.windGustMaxMph != null) parts.push(`peak gusts ${w.windGustMaxMph} mph`);
  if (w.precipitationIn != null && w.precipitationIn > 0) parts.push(`${w.precipitationIn.toFixed(2)} in precipitation`);
  if (w.snowfallIn != null && w.snowfallIn > 0) parts.push(`${w.snowfallIn.toFixed(1)} in snowfall`);
  if (parts.length === 0) return "No significant weather recorded for this date.";
  return parts.join(", ") + ".";
}

const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
};

export interface GeoResult { lat: number; lon: number; label: string; }

// In-memory geocode caches — avoids repeated external API calls within a server session
const _zipCache = new Map<string, GeoResult | null>();
const _cityCache = new Map<string, GeoResult | null>();

// US ZIP code → coordinates via the keyless zippopotam.us API.
export async function geocodeZip(zip: string): Promise<GeoResult | null> {
  const clean = zip.trim().slice(0, 5);
  if (!/^\d{5}$/.test(clean)) return null;
  if (_zipCache.has(clean)) return _zipCache.get(clean)!;
  try {
    interface ZippoPlace { "place name": string; "state abbreviation": string; latitude: string; longitude: string; }
    interface ZippoData { places?: ZippoPlace[]; }
    const res = await fetch(`https://api.zippopotam.us/us/${clean}`);
    if (!res.ok) { _zipCache.set(clean, null); return null; }
    const data = await res.json() as ZippoData;
    const place = data?.places?.[0];
    if (!place) { _zipCache.set(clean, null); return null; }
    const label = `${place["place name"]}, ${place["state abbreviation"]} ${clean}`;
    const result = { lat: Number(place.latitude), lon: Number(place.longitude), label };
    _zipCache.set(clean, result);
    return result;
  } catch {
    _zipCache.set(clean, null);
    return null;
  }
}

// Open-Meteo geocoder needs a bare place name; pass the city only and prefer a
// result whose region matches the claim's state.
export async function geocodeCity(city: string, state?: string | null): Promise<GeoResult | null> {
  const cacheKey = `${city.trim().toLowerCase()}|${(state || "").toUpperCase()}`;
  if (_cityCache.has(cacheKey)) return _cityCache.get(cacheKey)!;
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city.trim())}&count=10&language=en&format=json`;
  interface GeoItem { name?: string; latitude?: number; longitude?: number; admin1?: string; admin1_code?: string; country_code?: string; }
  interface GeoData { results?: GeoItem[]; }
  try {
    const res = await fetch(url);
    if (!res.ok) { _cityCache.set(cacheKey, null); return null; }
    const data = await res.json() as GeoData;
    const results: GeoItem[] = Array.isArray(data?.results) ? data.results : [];
    if (results.length === 0) { _cityCache.set(cacheKey, null); return null; }

    let chosen = results[0];
    if (state) {
      const st = state.trim().toUpperCase();
      const full = (US_STATE_NAMES[st] || state).toLowerCase();
      const match = results.find(
        (r) => String(r.admin1 || "").toLowerCase() === full || String(r.admin1_code || "").toUpperCase() === st,
      );
      if (match) {
        chosen = match;
      } else {
        // State didn't match any result — prefer a US result rather than a global fallback
        const usOnly = results.find((r) => r.country_code === "US");
        if (usOnly) chosen = usOnly;
      }
    }
    if (chosen.latitude == null || chosen.longitude == null) {
      _cityCache.set(cacheKey, null);
      return null;
    }
    const label = [chosen.name, chosen.admin1, chosen.country_code].filter(Boolean).join(", ");
    const result = { lat: chosen.latitude, lon: chosen.longitude, label };
    _cityCache.set(cacheKey, result);
    return result;
  } catch {
    _cityCache.set(cacheKey, null);
    return null;
  }
}

/**
 * Fetch historical weather for a claim's date of loss and location using the
 * keyless Open-Meteo archive + geocoding APIs. Returns null when the claim has
 * insufficient location/date data or the location can't be resolved.
 */
export async function getClaimWeather(claim: Claim): Promise<{ weather: ClaimWeather; reason?: string } | null> {
  const lossDate = claim.dateOfLoss || claim.lossDate;
  if (!lossDate) return null;
  const date = new Date(lossDate);
  if (isNaN(date.getTime())) return null;
  const dateStr = date.toISOString().slice(0, 10);

  // Resolve coordinates: prefer ZIP (most precise + keyless), fall back to city + state.
  let geo: GeoResult | null = null;
  if (claim.zipCode && claim.zipCode.trim()) {
    geo = await geocodeZip(claim.zipCode);
  }
  if (!geo && claim.city) {
    geo = await geocodeCity(claim.city, claim.state);
  }
  if (!geo) {
    return null;
  }

  const dailyVars = "temperature_2m_max,temperature_2m_min,precipitation_sum,rain_sum,snowfall_sum,wind_gusts_10m_max,wind_speed_10m_max,weather_code";
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${geo.lat}&longitude=${geo.lon}&start_date=${dateStr}&end_date=${dateStr}&daily=${dailyVars}&timezone=auto`;
  interface MeteoDaily { time?: unknown[]; temperature_2m_max?: (number|null)[]; temperature_2m_min?: (number|null)[]; precipitation_sum?: (number|null)[]; rain_sum?: (number|null)[]; snowfall_sum?: (number|null)[]; wind_gusts_10m_max?: (number|null)[]; wind_speed_10m_max?: (number|null)[]; weather_code?: (number|null)[]; }
  interface MeteoData { daily?: MeteoDaily; }
  const res = await fetch(url);
  if (!res.ok) {
    return null;
  }
  const data = await res.json() as MeteoData;
  const d = data?.daily;
  if (!d || !Array.isArray(d.time) || d.time.length === 0) {
    return null;
  }

  const pick = (arr: (number | null)[] | undefined): number | null => (Array.isArray(arr) && arr[0] != null ? Number(arr[0]) : null);

  const tempMaxC = pick(d.temperature_2m_max);
  const tempMinC = pick(d.temperature_2m_min);
  const precipitationMm = pick(d.precipitation_sum);
  const snowfallCm = pick(d.snowfall_sum);
  const windGustMaxKmh = pick(d.wind_gusts_10m_max);
  const windSpeedMaxKmh = pick(d.wind_speed_10m_max);
  const weatherCode = pick(d.weather_code);

  const base: Omit<ClaimWeather, "summary"> = {
    location: geo.label,
    date: dateStr,
    latitude: geo.lat,
    longitude: geo.lon,
    tempMaxC,
    tempMinC,
    tempMaxF: tempMaxC != null ? cToF(tempMaxC) : null,
    tempMinF: tempMinC != null ? cToF(tempMinC) : null,
    precipitationMm,
    precipitationIn: precipitationMm != null ? mmToIn(precipitationMm) : null,
    rainMm: pick(d.rain_sum),
    snowfallCm,
    snowfallIn: snowfallCm != null ? cmToIn(snowfallCm) : null,
    windGustMaxKmh,
    windGustMaxMph: windGustMaxKmh != null ? kmhToMph(windGustMaxKmh) : null,
    windSpeedMaxKmh,
    windSpeedMaxMph: windSpeedMaxKmh != null ? kmhToMph(windSpeedMaxKmh) : null,
    weatherCode,
    isHail: weatherCode != null && HAIL_CODES.has(weatherCode),
  };
  return { weather: { ...base, summary: buildSummary(base) } };
}
