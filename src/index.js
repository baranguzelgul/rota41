const express = require('express');
const cors = require('cors');
const { testConnection } = require('./configs/neo4j');
const durakRoutes = require('./routes/durakRoutes');
const hatRoutes = require('./routes/hatRoutes');
const rotaRoutes = require('./routes/rotaRoutes');
const path = require('path');

// Express uygulamasını başlat
const app = express();

// Middleware'leri tanımla
app.use(cors());
app.use(express.json());

// Neo4j bağlantısını kontrol et
testConnection()
  .then(success => {
    if (!success) {
      console.error("Neo4j bağlantısı başarısız oldu. Lütfen veritabanı bağlantısını kontrol edin.");
      process.exit(1);
    }
  })
  .catch(error => {
    console.error("Neo4j bağlantı hatası:", error);
    process.exit(1);
  });

// Ana rota
app.get('/', (req, res) => {
  res.json({ mesaj: 'Kocaeli Ulaşım API çalışıyor.' });
});

// API rotalarını tanımla
app.use('/api/hatlar', hatRoutes);
app.use('/api/duraklar', durakRoutes);
app.use('/api/rota', rotaRoutes);

// Frontend build'ini sun
app.use(express.static(path.join(__dirname, '../../client/build')));

// Hata yakalama middleware
app.use((req, res, next) => {
  res.status(404).json({ hata: 'Sayfa bulunamadı' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ hata: 'Sunucu hatası', detay: err.message });
});

// Sunucuyu başlat
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor.`);
}); 