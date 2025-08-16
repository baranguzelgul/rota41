const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000/api';
const testRouteId = '410800';

async function testApis() {
  try {
    console.log(`Testing hat details endpoint for route ${testRouteId}...`);
    const hatDetailsResponse = await axios.get(`${API_BASE_URL}/hatlar/${testRouteId}`);
    console.log("Hat details OK:", hatDetailsResponse.data.route_name);
    
    console.log(`\nTesting güzergah endpoint for route ${testRouteId} (Gidiş)...`);
    const guzergahResponse = await axios.get(`${API_BASE_URL}/hatlar/${testRouteId}/guzergah?yon=Gidiş`);
    console.log(`Güzergah OK: Found ${guzergahResponse.data.length} stops`);
    
    console.log(`\nTesting shape endpoint for route ${testRouteId} (Gidiş)...`);
    const shapeResponse = await axios.get(`${API_BASE_URL}/hatlar/${testRouteId}/shape?yon=Gidiş`);
    console.log(`Shape OK: Found ${shapeResponse.data.length} shape points`);
    
    console.log(`\nTesting saat-bilgileri endpoint for route ${testRouteId}...`);
    const saatResponse = await axios.get(`${API_BASE_URL}/hatlar/${testRouteId}/saat-bilgileri`);
    console.log(`Saat bilgileri OK:`, saatResponse.data.direction_1);
    
    console.log("\nAll API tests passed successfully!");
  } catch (error) {
    console.error("API Test Error:", error.message);
    if (error.response) {
      console.error("Error Response:", error.response.status);
      console.error("Error Data:", error.response.data);
    }
  }
}

testApis(); 