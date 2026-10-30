import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

const WEATHER_CACHE_KEY = '@field_weather_cache';

const WEATHER_CODE_MAP = {
  0: { condition: 'Clear Sky', icon: 'sunny-outline' },
  1: { condition: 'Mainly Clear', icon: 'sunny-outline' },
  2: { condition: 'Partly Cloudy', icon: 'partly-sunny-outline' },
  3: { condition: 'Cloudy', icon: 'cloudy-outline' },
  45: { condition: 'Foggy', icon: 'cloud-outline' },
  48: { condition: 'Depositing Fog', icon: 'cloud-outline' },
  51: { condition: 'Light Drizzle', icon: 'rainy-outline' },
  53: { condition: 'Drizzle', icon: 'rainy-outline' },
  55: { condition: 'Heavy Drizzle', icon: 'rainy-outline' },
  61: { condition: 'Light Rain', icon: 'rainy-outline' },
  63: { condition: 'Moderate Rain', icon: 'rainy-outline' },
  65: { condition: 'Heavy Rain', icon: 'rainy-outline' },
  71: { condition: 'Light Snow', icon: 'snow-outline' },
  73: { condition: 'Snow', icon: 'snow-outline' },
  75: { condition: 'Heavy Snow', icon: 'snow-outline' },
  80: { condition: 'Rain Showers', icon: 'rainy-outline' },
  81: { condition: 'Heavy Showers', icon: 'rainy-outline' },
  82: { condition: 'Violent Showers', icon: 'rainy-outline' },
  95: { condition: 'Thunderstorm', icon: 'thunderstorm-outline' },
  96: { condition: 'Thunderstorm w/ Hail', icon: 'thunderstorm-outline' },
  99: { condition: 'Severe Storm', icon: 'thunderstorm-outline' },
};

/**
 * Fetch current weather forecast based on coordinates or device location
 */
export async function fetchCurrentWeather(fallbackCoords = null) {
  try {
    // 1. Try to get cached weather first for instant UI rendering
    let cached = null;
    try {
      const rawCache = await AsyncStorage.getItem(WEATHER_CACHE_KEY);
      if (rawCache) {
        cached = JSON.parse(rawCache);
      }
    } catch {}

    // 2. Resolve coordinates
    let lat = fallbackCoords?.latitude;
    let lng = fallbackCoords?.longitude;

    if (!lat || !lng) {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getLastKnownPositionAsync({});
          if (loc?.coords) {
            lat = loc.coords.latitude;
            lng = loc.coords.longitude;
          }
        }
      } catch (locErr) {
        // Location permission or query error
      }
    }

    // Default fallback to Manila coordinates if no position is available
    if (!lat || !lng) {
      lat = 14.5995;
      lng = 120.9842;
    }

    // 3. Fetch current weather from Open-Meteo
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) {
      if (cached) return cached;
      return getDefaultWeather();
    }

    const data = await res.json();
    const current = data.current_weather;
    if (!current) {
      return cached || getDefaultWeather();
    }

    const codeInfo = WEATHER_CODE_MAP[current.weathercode] || {
      condition: current.is_day ? 'Clear' : 'Clear Night',
      icon: current.is_day ? 'partly-sunny-outline' : 'moon-outline',
    };

    // 4. Reverse geocode location name
    let locationName = '';
    try {
      const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (geo && geo.length > 0) {
        const item = geo[0];
        locationName = item.city || item.subregion || item.region || item.name || '';
      }
    } catch {}

    const roundedTemp = Math.round(current.temperature);
    const weatherResult = {
      temp: `${roundedTemp}°C`,
      condition: codeInfo.condition,
      icon: codeInfo.icon,
      location: locationName,
      timestamp: Date.now(),
    };

    // Cache weather result
    try {
      await AsyncStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(weatherResult));
    } catch {}

    return weatherResult;
  } catch (err) {
    console.warn('Weather fetch error:', err);
    try {
      const rawCache = await AsyncStorage.getItem(WEATHER_CACHE_KEY);
      if (rawCache) return JSON.parse(rawCache);
    } catch {}
    return getDefaultWeather();
  }
}

export function getDefaultWeather() {
  return {
    temp: '29°C',
    condition: 'Partly Cloudy',
    icon: 'partly-sunny-outline',
    location: '',
  };
}
