# Weather Dashboard

A modern, responsive weather dashboard application that fetches real-time weather data from the OpenWeatherMap API.

## Features

### Core Features
- **Current Weather Display**: Shows real-time temperature, humidity, wind speed, pressure, visibility, and "feels like" temperature
- **5-Day Forecast**: View weather predictions for the next 5 days
- **Hourly Forecast**: Check weather conditions for the next 8 hours
- **Search by City**: Search for weather in any city worldwide
- **Geolocation**: Get weather for your current location
- **Recent Searches**: Quick access to previously searched cities
- **Local Storage**: Automatically saves search history

### Weather Information
- Temperature (in Celsius, convertible to Fahrenheit)
- Weather description with icons
- Humidity percentage
- Wind speed (m/s, convertible to km/h)
- Atmospheric pressure (hPa)
- Visibility (km)
- "Feels like" temperature
- UV Index (where available)

### User Interface
- Modern dark theme with gradient backgrounds
- Responsive design (works on desktop, tablet, mobile)
- Smooth animations and transitions
- Loading states and error handling
- Icons from Font Awesome 6
- Weather icons from OpenWeatherMap

## Setup Instructions

### 1. Get an API Key
1. Visit [OpenWeatherMap](https://openweathermap.org/api)
2. Sign up for a free account
3. Go to your API keys section
4. Copy your API key

### 2. Configure the Application
1. Open `app.js`
2. Find line: `const API_KEY = 'YOUR_API_KEY_HERE';`
3. Replace `'YOUR_API_KEY_HERE'` with your actual API key
4. Save the file

### 3. Run the Application
Simply open `index.html` in your web browser. No server or build process required!

## File Structure

```
weather-dashboard/
├── index.html      # HTML structure
├── styles.css      # CSS styling and responsive design
├── app.js          # JavaScript functionality
└── README.md       # Documentation
```

## Usage

### Search for a City
1. Type a city name in the search box
2. Press Enter or click the search button
3. Weather data will load automatically

### Use Geolocation
1. Click the location icon (top right)
2. Allow browser location access when prompted
3. Weather for your current location will load

### View Recent Searches
- Click any city button in the "Recent Searches" section
- Up to 10 most recent searches are saved

### View Forecast
- 5-Day Forecast: Shows daily high/low temperatures and conditions
- Hourly Forecast: Shows weather for the next 8 hours (3-hour intervals)

## API Information

### OpenWeatherMap Free Tier Limits
- **Calls**: 60 calls/minute, 1,000 calls/day
- **Data**: Current weather and 5-day forecast
- **Update Frequency**: Every 10 minutes

### API Endpoints Used
- `/weather`: Current weather data
- `/forecast`: 5-day forecast (3-hour intervals)
- Icons: OpenWeatherMap CDN

### Sample API Response
```json
{
  "coord": { "lon": 10.99, "lat": 44.34 },
  "weather": [
    { "id": 804, "main": "Clouds", "description": "overcast clouds", "icon": "04d" }
  ],
  "main": {
    "temp": 288.16,
    "feels_like": 287.15,
    "humidity": 69,
    "pressure": 1013,
    "visibility": 10000
  },
  "wind": { "speed": 4.1, "deg": 80 },
  "sys": { "country": "IT", "sunrise": 1606350627, "sunset": 1606384175 }
}
```

## Responsive Design

### Desktop (1200px+)
- Full-width layout with all details visible
- Side-by-side weather information
- Large weather icons

### Tablet (768px - 1199px)
- Adjusted grid layouts
- Stacked weather details
- Optimized spacing

### Mobile (< 768px)
- Single column layout
- Touch-friendly buttons
- Optimized font sizes
- Horizontal scrolling for hourly forecast

## Browser Compatibility

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support
- IE 11: ❌ Not supported (uses modern JavaScript)

## Features to Add

Future enhancements:
- [ ] Temperature unit toggle (°C/°F)
- [ ] Wind speed unit conversion (m/s, km/h, mph)
- [ ] Favorites/pinned cities
- [ ] Multiple weather providers comparison
- [ ] Air quality index
- [ ] Precipitation alerts
- [ ] Weather maps
- [ ] Historical weather data

## Troubleshooting

### "City not found" Error
- Check spelling of city name
- Try using country code (e.g., "London, UK")

### "Unable to fetch weather data" Error
- Verify your API key is correct
- Check your internet connection
- Ensure you haven't exceeded API rate limits

### Geolocation Not Working
- Check browser privacy settings
- Ensure HTTPS is used (some browsers require it)
- Verify location services are enabled

## API Documentation
- [OpenWeatherMap Current Weather API](https://openweathermap.org/current)
- [OpenWeatherMap Forecast API](https://openweathermap.org/forecast5)

## License
This project is open source and available for personal and commercial use.

## Notes
- Weather data is cached for 10 minutes by OpenWeatherMap
- Search history is stored locally in browser localStorage
- No backend server is required
- All data is fetched client-side
