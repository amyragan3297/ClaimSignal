// Weather Dashboard Application
// Uses OpenWeatherMap API (free tier)

const API_KEY = '82fd95fa9d878501efd5f7af0f4ea15f'; // Weather API key from OpenWeatherMap
const BASE_URL = 'https://api.openweathermap.org/data/2.5';
const GEO_URL = 'https://api.openweathermap.org/geo/1.0';

// DOM Elements
const cityInput = document.getElementById('cityInput');
const searchBtn = document.getElementById('searchBtn');
const geoBtn = document.getElementById('geoBtn');
const weatherContent = document.getElementById('weatherContent');
const loadingSpinner = document.getElementById('loadingSpinner');
const errorMessage = document.getElementById('errorMessage');
const forecastContainer = document.getElementById('forecastContainer');
const hourlyContainer = document.getElementById('hourlyContainer');
const recentCities = document.getElementById('recentCities');

// State
let currentWeather = null;
let weatherHistory = JSON.parse(localStorage.getItem('weatherHistory')) || [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadDefaultCity();
    displayRecentCities();
});

function setupEventListeners() {
    searchBtn.addEventListener('click', handleSearch);
    cityInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });
    geoBtn.addEventListener('click', getGeolocation);
}

function handleSearch() {
    const city = cityInput.value.trim();
    if (city) {
        fetchWeatherByCity(city);
        cityInput.value = '';
    }
}

function fetchWeatherByCity(city) {
    showLoading();
    
    Promise.all([
        fetch(`${BASE_URL}/weather?q=${city}&units=metric&appid=${API_KEY}`),
        fetch(`${BASE_URL}/forecast?q=${city}&units=metric&appid=${API_KEY}`)
    ])
    .then(async (responses) => {
        if (!responses[0].ok) throw new Error('City not found');
        const weather = await responses[0].json();
        const forecast = await responses[1].json();
        
        currentWeather = weather;
        addToHistory(weather.name);
        displayCurrentWeather(weather);
        displayForecast(forecast.list);
        displayHourlyForecast(forecast.list);
        hideError();
    })
    .catch((error) => {
        showError('Unable to fetch weather data. ' + error.message);
    })
    .finally(() => hideLoading());
}

function fetchWeatherByCoordinates(lat, lon) {
    showLoading();
    
    Promise.all([
        fetch(`${BASE_URL}/weather?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`),
        fetch(`${BASE_URL}/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`)
    ])
    .then(async (responses) => {
        if (!responses[0].ok) throw new Error('Unable to fetch weather');
        const weather = await responses[0].json();
        const forecast = await responses[1].json();
        
        currentWeather = weather;
        addToHistory(weather.name);
        displayCurrentWeather(weather);
        displayForecast(forecast.list);
        displayHourlyForecast(forecast.list);
        hideError();
    })
    .catch((error) => {
        showError('Unable to fetch weather data. ' + error.message);
    })
    .finally(() => hideLoading());
}

function displayCurrentWeather(data) {
    const { main, weather, wind, clouds, visibility, sys } = data;
    const iconUrl = `https://openweathermap.org/img/wn/${weather[0].icon}@4x.png`;
    const lastUpdated = new Date().toLocaleString();
    
    document.getElementById('cityName').textContent = `${data.name}, ${data.sys.country}`;
    document.getElementById('lastUpdated').textContent = `Last updated: ${lastUpdated}`;
    document.getElementById('temperature').textContent = `${Math.round(main.temp)}°C`;
    document.getElementById('weatherIcon').src = iconUrl;
    document.getElementById('weatherDescription').textContent = weather[0].description;
    document.getElementById('humidity').textContent = `${main.humidity}%`;
    document.getElementById('windSpeed').textContent = `${wind.speed} m/s`;
    document.getElementById('visibility').textContent = `${(visibility / 1000).toFixed(1)} km`;
    document.getElementById('pressure').textContent = `${main.pressure} hPa`;
    document.getElementById('feelsLike').textContent = `${Math.round(main.feels_like)}°C`;
    
    // UV Index (requires separate API call with One Call API)
    document.getElementById('uvIndex').textContent = 'N/A';
    
    weatherContent.style.display = 'block';
}

function displayForecast(forecastList) {
    const dailyForecasts = {};
    
    // Group by day and get the first forecast for each day
    forecastList.forEach(item => {
        const date = new Date(item.dt * 1000).toLocaleDateString();
        if (!dailyForecasts[date]) {
            dailyForecasts[date] = item;
        }
    });
    
    forecastContainer.innerHTML = '';
    Object.entries(dailyForecasts)
        .slice(0, 5)
        .forEach(([date, data]) => {
            const card = createForecastCard(date, data);
            forecastContainer.appendChild(card);
        });
}

function createForecastCard(date, data) {
    const card = document.createElement('div');
    card.className = 'forecast-card';
    
    const dateObj = new Date(data.dt * 1000);
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    const iconUrl = `https://openweathermap.org/img/wn/${data.weather[0].icon}.png`;
    
    const highTemp = Math.round(data.main.temp_max);
    const lowTemp = Math.round(data.main.temp_min);
    
    card.innerHTML = `
        <div class="date">${dayName}</div>
        <div class="date" style="font-size: 0.8rem; color: #bdc3c7;">${date}</div>
        <img src="${iconUrl}" alt="weather icon" style="width: 50px; height: 50px;">
        <div class="temp">${highTemp}°</div>
        <div style="font-size: 0.9rem; color: #bdc3c7;">${lowTemp}°</div>
        <div class="description">${data.weather[0].description}</div>
    `;
    
    return card;
}

function displayHourlyForecast(forecastList) {
    hourlyContainer.innerHTML = '';
    
    // Show next 8 hours (3-hour intervals in free API)
    forecastList.slice(0, 8).forEach(item => {
        const card = createHourlyCard(item);
        hourlyContainer.appendChild(card);
    });
}

function createHourlyCard(data) {
    const card = document.createElement('div');
    card.className = 'hourly-card';
    
    const time = new Date(data.dt * 1000).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
    const temp = Math.round(data.main.temp);
    const iconUrl = `https://openweathermap.org/img/wn/${data.weather[0].icon}.png`;
    
    card.innerHTML = `
        <div class="time">${time}</div>
        <img src="${iconUrl}" alt="weather icon" style="width: 40px; height: 40px;">
        <div class="temp">${temp}°C</div>
    `;
    
    return card;
}

function getGeolocation() {
    if (!navigator.geolocation) {
        showError('Geolocation is not supported by your browser');
        return;
    }
    
    geoBtn.disabled = true;
    geoBtn.innerHTML = '<i class="fas fa-spinner"></i>';
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            fetchWeatherByCoordinates(latitude, longitude);
            geoBtn.disabled = false;
            geoBtn.innerHTML = '<i class="fas fa-location-dot"></i>';
        },
        (error) => {
            showError('Unable to get your location: ' + error.message);
            geoBtn.disabled = false;
            geoBtn.innerHTML = '<i class="fas fa-location-dot"></i>';
        }
    );
}

function addToHistory(city) {
    // Remove if already exists to avoid duplicates
    weatherHistory = weatherHistory.filter(c => c.toLowerCase() !== city.toLowerCase());
    
    // Add to beginning
    weatherHistory.unshift(city);
    
    // Keep only last 10
    weatherHistory = weatherHistory.slice(0, 10);
    
    // Save to localStorage
    localStorage.setItem('weatherHistory', JSON.stringify(weatherHistory));
    
    displayRecentCities();
}

function displayRecentCities() {
    recentCities.innerHTML = '';
    
    if (weatherHistory.length === 0) {
        recentCities.innerHTML = '<span class="no-recent">No recent searches</span>';
        return;
    }
    
    weatherHistory.forEach(city => {
        const btn = document.createElement('button');
        btn.className = 'recent-city-btn';
        btn.textContent = city;
        btn.addEventListener('click', () => fetchWeatherByCity(city));
        recentCities.appendChild(btn);
    });
}

function loadDefaultCity() {
    // Load last searched city or use default
    if (weatherHistory.length > 0) {
        fetchWeatherByCity(weatherHistory[0]);
    } else {
        fetchWeatherByCity('London');
    }
}

function showLoading() {
    loadingSpinner.style.display = 'flex';
    weatherContent.style.display = 'none';
}

function hideLoading() {
    loadingSpinner.style.display = 'none';
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    weatherContent.style.display = 'none';
}

function hideError() {
    errorMessage.style.display = 'none';
}

// Utility function to convert temperature
function celsiusToFahrenheit(celsius) {
    return (celsius * 9/5) + 32;
}

// Utility function to convert wind speed
function mpsToKmh(mps) {
    return (mps * 3.6).toFixed(1);
}
