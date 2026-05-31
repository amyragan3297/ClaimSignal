---
name: Open-Meteo geocoding quirks
description: How to resolve a US claim location to coordinates for weather lookups
---

# Resolving claim location → coordinates (weather feature)

Open-Meteo's geocoding API (`geocoding-api.open-meteo.com/v1/search`) only accepts a
**bare place name**. It returns NO results for `"City, State"` (comma + state) or for
ZIP codes. Querying `"Dallas, TX"` or `"75201 TX"` silently returns an empty result set.

**How to apply (used in `server/weather.ts`):**
- For a ZIP, use the keyless `api.zippopotam.us/us/<zip>` endpoint to get lat/lon + city/state directly.
- For a city, query the bare city name with `count=10`, then pick the result whose `admin1`
  matches the claim's state (map 2-letter state code → full name, since `admin1` is the full name).
- Historical daily data comes from `archive-api.open-meteo.com/v1/archive` (keyless), which
  has a few-days lag, so very recent dates may return no rows.
