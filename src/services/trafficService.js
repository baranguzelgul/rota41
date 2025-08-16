const axios = require('axios');

// API keys for traffic data service
// In production, these should be stored in environment variables
const TRAFFIC_API_KEY = process.env.TRAFFIC_API_KEY || 'your-api-key';

// Cache traffic data to avoid excessive API calls
let trafficCache = {
  lastUpdated: 0,
  data: null
};

// Traffic levels and their impact factors
const TRAFFIC_FACTORS = {
  'LOW': 1.0,      // Normal traffic
  'MODERATE': 1.3, // Moderate traffic
  'HIGH': 1.8,     // Heavy traffic
  'VERY_HIGH': 2.5 // Severe congestion
};

// Default if no API is available - weekday patterns
const getDefaultTrafficLevel = () => {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0 = Sunday, 6 = Saturday
  
  // Weekend traffic patterns
  if (day === 0 || day === 6) {
    if (hour >= 10 && hour <= 18) return 'MODERATE';
    return 'LOW';
  }
  
  // Weekday rush hours
  if ((hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19)) {
    return 'HIGH';
  }
  
  // Weekday non-rush hours
  if (hour >= 10 && hour <= 15) return 'MODERATE';
  
  // Early morning or late evening
  return 'LOW';
};

/**
 * Get traffic factor for a specific route
 * @param {number} startLat - Starting latitude
 * @param {number} startLon - Starting longitude
 * @param {number} endLat - Ending latitude
 * @param {number} endLon - Ending longitude
 * @returns {Promise<number>} - Traffic factor to multiply travel time by
 */
const getTrafficFactor = async (startLat, startLon, endLat, endLon) => {
  try {
    // Cache expires after 10 minutes
    const CACHE_TTL = 10 * 60 * 1000; // 10 minutes in milliseconds
    
    // Check if cache is valid
    if (trafficCache.data && (Date.now() - trafficCache.lastUpdated < CACHE_TTL)) {
      console.log('Using cached traffic data');
      return processTrafficData(trafficCache.data, startLat, startLon, endLat, endLon);
    }
    
    // In a real implementation, we would call an actual traffic API
    // For example: TomTom, Google Maps, HERE Maps, etc.
    /*
    const response = await axios.get(
      `https://api.example.com/traffic?key=${TRAFFIC_API_KEY}&startLat=${startLat}&startLon=${startLon}&endLat=${endLat}&endLon=${endLon}`
    );
    
    // Update cache
    trafficCache = {
      lastUpdated: Date.now(),
      data: response.data
    };
    
    return processTrafficData(response.data, startLat, startLon, endLat, endLon);
    */
    
    // Since we don't have a real API, use the default pattern
    console.log('Using default traffic patterns');
    const trafficLevel = getDefaultTrafficLevel();
    return TRAFFIC_FACTORS[trafficLevel];
    
  } catch (error) {
    console.error('Error fetching traffic data:', error);
    // Default factor if API fails
    return 1.3;
  }
};

/**
 * Process traffic API response and extract the relevant traffic factor
 * This function would parse the specific format of your chosen traffic API
 */
const processTrafficData = (data, startLat, startLon, endLat, endLon) => {
  // In a real implementation, we would parse the API response
  // For now, just return a default factor based on time of day
  const trafficLevel = getDefaultTrafficLevel();
  return TRAFFIC_FACTORS[trafficLevel];
};

module.exports = {
  getTrafficFactor
}; 