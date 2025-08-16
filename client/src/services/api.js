import axios from 'axios';

// API temel URL
const API_BASE_URL = 'http://localhost:3000/api';

// Axios instance oluşturma
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Durak ile ilgili API istekleri
const durakAPI = {
  // Tüm durakları getir
  getAllStops: async () => {
    try {
      const response = await apiClient.get('/duraklar');
      return response.data;
    } catch (error) {
      console.error('Tüm duraklar alınırken hata oluştu:', error);
      throw error;
    }
  },

  // Tüm durakları getir (eski fonksiyon, uyumluluk için kalabilir)
  tumDuraklariGetir: async () => {
    try {
      const response = await apiClient.get('/duraklar');
      return response.data;
    } catch (error) {
      console.error('Duraklar alınırken hata oluştu:', error);
      throw error;
    }
  },

  // İsme göre durak ara
  durakAra: async (searchTerm) => {
    try {
      const response = await apiClient.get(`/duraklar/ara?q=${searchTerm}`);
      return response.data;
    } catch (error) {
      console.error('Durak arama hatası:', error);
      throw error;
    }
  },

  // ID'ye göre durak getir
  durakGetir: async (id) => {
    try {
      const response = await apiClient.get(`/duraklar/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Durak ${id} alınırken hata oluştu:`, error);
      throw error;
    }
  },

  // Durağın üzerinden geçen hatları getir
  durakHatlariniGetir: async (stop_id) => {
    try {
      const response = await apiClient.get(`/duraklar/${stop_id}/hatlar`);
      return response.data;
    } catch (error) {
      console.error(`Durak ${stop_id} hatları alınırken hata oluştu:`, error);
      throw error;
    }
  },

  // İki durak arasındaki bağlantıyı bul
  durakBaglantiBul: async (baslangicId, bitisId, maxWalkingDistance = 500) => {
    try {
      console.log(`API isteği: /duraklar/${baslangicId}/baglantilar/${bitisId}?maxWalkingDistance=${maxWalkingDistance}`);
      const response = await apiClient.get(`/duraklar/${baslangicId}/baglantilar/${bitisId}?maxWalkingDistance=${maxWalkingDistance}`);
      console.log("API yanıtı:", response.data);
      return response.data;
    } catch (error) {
      console.error(`Durak bağlantısı bulunurken hata oluştu:`, error);
      if (error.response) {
        // Sunucudan gelen hata yanıtı
        console.error("Hata detayları:", error.response.data);
        console.error("Hata durumu:", error.response.status);
        console.error("Hata başlıkları:", error.response.headers);
      } else if (error.request) {
        // İstek yapıldı ama yanıt alınamadı
        console.error("İstek yapıldı ama yanıt alınamadı:", error.request);
      } else {
        // İstek oluşturulurken bir hata oluştu
        console.error("İstek hatası:", error.message);
      }
      throw error;
    }
  },
  
  // Belirli bir konuma en yakın durakları bul
  enYakinDurakBul: async (lat, lng, maxDistance = 500) => {
    try {
      const response = await apiClient.get(`/duraklar/yakin?lat=${lat}&lng=${lng}&maxDistance=${maxDistance}`);
      return response.data;
    } catch (error) {
      console.error('En yakın durak bulunurken hata oluştu:', error);
      throw error;
    }
  },
  
  // İki nokta arasında en iyi rotayı bul
  noktalarArasiRotaBul: async (baslangicLat, baslangicLng, bitisLat, bitisLng, maxWalkingDistance = 500) => {
    try {
      const response = await apiClient.get(
        `/duraklar/rota?baslangicLat=${baslangicLat}&baslangicLng=${baslangicLng}&bitisLat=${bitisLat}&bitisLng=${bitisLng}&maxWalkingDistance=${maxWalkingDistance}`
      );
      return response.data;
    } catch (error) {
      console.error('Noktalar arası rota bulunurken hata oluştu:', error);
      throw error;
    }
  },

  getYakinDuraklar: async (lat, lng, maxDistance) => {
    const response = await apiClient.get(`/duraklar/yakin`, { params: { lat, lng, maxDistance } });
    return response.data;
  },

  // Durağa Yaklaşan Hatları Getir
  getYaklasanHatlar: async (stop_id) => {
    try {
      const response = await apiClient.get(`/duraklar/${stop_id}/yaklasan-hatlar`);
      return response.data;
    } catch (error) {
      console.error(`Durak ${stop_id} için yaklaşan hatlar alınırken hata oluştu:`, error);
      throw error;
    }
  }
};

// Hat ile ilgili API istekleri
const hatAPI = {
  // Tüm hatları getir
  tumHatlariGetir: async () => {
    try {
      const response = await apiClient.get('/hatlar');
      return response.data;
    } catch (error) {
      console.error('Hatlar alınırken hata oluştu:', error);
      throw error;
    }
  },

  // İsme göre hat ara
  hatAra: async (isim) => {
    try {
      const response = await apiClient.get(`/hatlar/ara?isim=${encodeURIComponent(isim)}`);
      return response.data;
    } catch (error) {
      console.error('Hat arama hatası:', error);
      throw error;
    }
  },

  // ID'ye göre hat getir
  hatGetir: async (id) => {
    try {
      const response = await apiClient.get(`/hatlar/${id}`);
      return response.data;
    } catch (error) {
      console.error(`Hat ${id} alınırken hata oluştu:`, error);
      throw error;
    }
  },

  // Hat güzergahını getir
  hatGuzergahiniGetir: async (id, yon) => {
    try {
      let url = `/hatlar/${id}/guzergah`;
      if (yon) {
        url += `?yon=${encodeURIComponent(yon)}`;
      }
      const response = await apiClient.get(url);
      return response.data;
    } catch (error) {
      console.error(`Hat ${id} güzergahı alınırken hata oluştu:`, error);
      throw error;
    }
  },

  // Hat güzergahı için shape verilerini getir
  hatShapeGetir: async (id, yon) => {
    try {
      let url = `/hatlar/${id}/shape`;
      if (yon) {
        url += `?yon=${encodeURIComponent(yon)}`;
      }
      const response = await apiClient.get(url);
      return response.data;
    } catch (error) {
      console.error(`Hat ${id} shape verileri alınırken hata oluştu:`, error);
      throw error;
    }
  },
  
  // Hat saat bilgilerini getir
  hatSaatBilgileriGetir: async (id) => {
    try {
      const response = await apiClient.get(`/hatlar/${id}/saat-bilgileri`);
      return response.data;
    } catch (error) {
      console.error(`Hat ${id} saat bilgileri alınırken hata oluştu:`, error);
      throw error;
    }
  }
};

const rotaAPI = {
  findRoute: async (startPoint, endPoint, departureTime) => {
    try {
      const params = new URLSearchParams({
        startLat: startPoint.lat,
        startLng: startPoint.lon,
        endLat: endPoint.lat,
        endLng: endPoint.lon,
      });
      // Eğer departureTime varsa, onu da parametrelere ekle
      if (departureTime) {
        params.append('departureTime', departureTime);
      }
      const response = await apiClient.get(`/rota/bul?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.error('Rota bulunurken hata oluştu:', error);
      throw error;
    }
  }
};

export { durakAPI, hatAPI, rotaAPI }; 