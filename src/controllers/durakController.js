const neo4j = require('neo4j-driver');
const { driver } = require('../configs/neo4j');
const { getCurrentTime, getDayType, parseTime, formatTime, formatDuration } = require('../utils/timeUtils');

// İki koordinat arasındaki mesafeyi hesaplayan yardımcı fonksiyon
const calculateDistance = (lat1, lon1, lat2, lng2) => {
  // Derece cinsinden koordinatları radyana çevir
  const toRad = value => value * Math.PI / 180;
  
  const R = 6371; // Dünya'nın yarıçapı (km)
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lng2 - lon1);
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  // Mesafeyi metre cinsinden döndür
  return distance * 1000;
};

// Bir hat için sonraki kalkış zamanını bulan fonksiyon
const getNextDepartureTime = async (hatId, yon) => {
  const session = driver.session();
  try {
    console.log(`Hat ID ${hatId} için kalkış zamanı sorgulanıyor...`);
    
    // Hat için zaman çizelgesini al
    const result = await session.run(
      `MATCH (h:Hat {route_id: $hatId}) 
       RETURN h.route_id as route_id,
              h.weekday_times as weekday_times, 
              h.saturday_times as saturday_times, 
              h.sunday_times as sunday_times`,
      { hatId }
    );
    
    if (result.records.length === 0) {
      console.log(`Hat ID ${hatId} için kayıt bulunamadı.`);
      return null;
    }
    
    const record = result.records[0];
    const dayType = getDayType(); // Bugün haftaiçi mi, cumartesi mi, pazar mı?
    const currentTime = getCurrentTime(); // Şu anki saat (dakika cinsinden)
    
    // Gün tipine göre zaman alanını seç
    let timesField = `${dayType}_times`;
    
    const times = record.get(timesField);
    if (!times) {
      console.log(`Hat ID ${hatId} için ${dayType} zaman çizelgesi bulunamadı.`);
      return null;
    }
    
    console.log(`Hat ID ${hatId} için ${dayType} zaman çizelgesi: ${times}`);
    
    // Zaman çizelgesini parse et
    const timesList = times.trim().split(' ').filter(time => time.trim() !== '');
    
    // Saatleri dakika cinsine çevir
    const departureTimes = timesList.map(parseTime);
    
    // Şu andan sonraki ilk kalkışı bul
    const nextDeparture = departureTimes.find(time => time >= currentTime);
    
    // Eğer bugün kalan sefer yoksa, yarının ilk seferini döndür
    const result_time = nextDeparture || departureTimes[0];
    console.log(`Hat ID ${hatId} için sonraki kalkış zamanı: ${formatTime(result_time)}`);
    return result_time;
  } catch (error) {
    console.error('Kalkış zamanı sorgulama hatası:', error);
    return null;
  } finally {
    await session.close();
  }
};

// Rota üzerindeki duraklara varış zamanlarını hesapla
const calculateStopArrivalTimes = (departureTime, routeStops) => {
  if (!routeStops || routeStops.length < 2) {
    return [];
  }
  
  // İlk durakta kalkış zamanı
  const arrivalTimes = [{ 
    stopId: routeStops[0].stop_id || routeStops[0].durak?.stop_id, 
    time: departureTime, 
    formattedTime: formatTime(departureTime) 
  }];
  
  let cumulativeTime = 0;
  
  // Her durak için varış zamanı hesapla
  for (let i = 1; i < routeStops.length; i++) {
    const prevStop = routeStops[i-1];
    const currentStop = routeStops[i];
    
    // Koordinat eksikse atla
    if (!prevStop || !currentStop || !prevStop.lat || !prevStop.lon || !currentStop.lat || !currentStop.lon) {
      continue;
    }
    
    // İki durak arasındaki mesafeyi hesapla
    const distance = calculateDistance(
      parseFloat(prevStop.lat), parseFloat(prevStop.lon),
      parseFloat(currentStop.lat), parseFloat(currentStop.lon)
    );
    
    // Yeni hesaplama: Her 500 metre için yaklaşık 1 dakika, 1.1 ile çarp (trafik faktörü)
    const baseTravelTime = Math.ceil(distance / 500);
    const travelTime = Math.ceil(baseTravelTime * 1.1);
    
    cumulativeTime += travelTime;
    
    // Bu durağa varış zamanını hesapla
    const arrivalTime = departureTime + cumulativeTime;
    
    arrivalTimes.push({
      stopId: currentStop.stop_id || currentStop.durak?.stop_id,
      time: arrivalTime,
      formattedTime: formatTime(arrivalTime),
      distanceFromPrevious: Math.round(distance),
      timeFromPrevious: travelTime
    });
  }
  
  return arrivalTimes;
};

// Varış zamanı hesaplama (trafik faktörü ile)
const calculateArrivalTime = async (hatId, yon, startStopIndex, endStopIndex, startStop, endStop, routeStops = []) => {
  // İlk duraktan sonraki kalkış zamanını al
  const departureTimeMinutes = await getNextDepartureTime(hatId, yon);
  if (!departureTimeMinutes) return null;
  
  const session = driver.session();
  try {
    // Hat için shape bilgilerini al
    const shapeResult = await session.run(
      `MATCH (h:Hat {route_id: $hatId})-[:SHAPE_ICERIYOR]->(s:ShapeNoktasi)
       WHERE s.sequence = 1
       RETURN s.lat AS lat, s.lng AS lng`,
      { hatId }
    );
    
    // İlk duraktan binilecek durağa kadar olan mesafeyi hesapla
    let distanceToBoarding = 0;
    
    // Eğer shape bilgisi varsa, ilk şekil noktasından binilecek durağa kadar olan mesafeyi hesapla
    if (shapeResult.records.length > 0 && startStop && startStop.lat && startStop.lon) {
      const firstShapePoint = shapeResult.records[0];
      const shapeLat = parseFloat(firstShapePoint.get('lat'));
      const shapeLng = parseFloat(firstShapePoint.get('lng'));
      
      // İlk şekil noktasından binilecek durağa olan mesafe
      distanceToBoarding = calculateDistance(
        shapeLat, shapeLng,
        parseFloat(startStop.lat), parseFloat(startStop.lon)
      );
      
      console.log(`İlk duraktan binilecek durağa mesafe: ${Math.round(distanceToBoarding)}m`);
    } else if (routeStops.length > 0 && startStop && startStop.lat && startStop.lon) {
      // Shape bilgisi yoksa, rota üzerindeki ilk duraktan itibaren hesapla
      const firstStop = routeStops[0];
      if (firstStop && firstStop.lat && firstStop.lon) {
        for (let i = 0; i < routeStops.length; i++) {
          const currentStop = routeStops[i];
          if (currentStop.stop_id === startStop.stop_id || 
              (currentStop.durak && currentStop.durak.stop_id === startStop.stop_id)) {
            break;
          }
          
          if (i > 0) {
            const prevStop = routeStops[i-1];
            
            if (currentStop && currentStop.lat && currentStop.lon && 
                prevStop && prevStop.lat && prevStop.lon) {
              distanceToBoarding += calculateDistance(
                parseFloat(prevStop.lat), parseFloat(prevStop.lon),
                parseFloat(currentStop.lat), parseFloat(currentStop.lon)
              );
            }
          }
        }
        
        console.log(`Duraklar üzerinden hesaplanan mesafe: ${Math.round(distanceToBoarding)}m`);
      }
    }
    
    // İlk duraktan binilecek durağa olan süreyi hesapla (250 metre için 1 dakika)
    const timeToReachBoardingStop = Math.ceil(distanceToBoarding / 250);
    
    // Binilecek durağa varış zamanı (ilk duraktan kalkış + yolda geçen süre)
    const boardingStopTimeMinutes = departureTimeMinutes + timeToReachBoardingStop;
    const boardingStopTime = formatTime(boardingStopTimeMinutes);
    
  // Duraklar arası mesafeyi hesapla (koordinat bilgisi varsa)
  let totalDistance = 0;
  
  if (startStop && endStop && startStop.lat && startStop.lon && endStop.lat && endStop.lon) {
    if (routeStops.length > 0) {
      // Rota üzerindeki tüm duraklar üzerinden mesafeyi hesapla
      let prevStop = routeStops[0];
      for (let i = 1; i < routeStops.length; i++) {
        const currentStop = routeStops[i];
        if (currentStop && currentStop.lat && currentStop.lon && 
            prevStop && prevStop.lat && prevStop.lon) {
          totalDistance += calculateDistance(
            parseFloat(prevStop.lat), parseFloat(prevStop.lon),
            parseFloat(currentStop.lat), parseFloat(currentStop.lon)
          );
        }
        prevStop = currentStop;
      }
    } else {
      // Rota bilgisi yoksa, direkt mesafeyi hesapla
      totalDistance = calculateDistance(
        parseFloat(startStop.lat), parseFloat(startStop.lon),
        parseFloat(endStop.lat), parseFloat(endStop.lon)
      );
    }
  }
  
  // Seyahat süresini hesapla
  let baseTravelTime;
  if (totalDistance > 0) {
      // Mesafe bazlı hesaplama: her 250m için 1dk
      baseTravelTime = Math.ceil(totalDistance / 250);
      console.log(`Mesafe bazlı seyahat süresi: ${totalDistance.toFixed(0)}m → ${baseTravelTime} dakika (250m/dk)`);
  } else {
    // Durak sayısı bazlı hesaplama (mesafe hesaplanamadığında)
    const stopsBetween = Math.abs(endStopIndex - startStopIndex);
      baseTravelTime = Math.ceil(stopsBetween * 2); // Durak başına 2dk
      console.log(`Durak sayısı bazlı seyahat süresi: ${stopsBetween} durak → ${baseTravelTime} dakika`);
  }
  
    // Varış zamanını hesapla (binilecek duraktan itibaren)
    const arrivalTime = boardingStopTimeMinutes + baseTravelTime;
  
  // Rota üzerindeki her durak için varış zamanlarını hesapla
  const stopArrivalTimes = calculateStopArrivalTimes(departureTimeMinutes, routeStops);
  
  // Binilecek durak varış zamanını bul
    let boardingStopInfo = null;
  if (startStop && startStop.stop_id) {
      boardingStopInfo = stopArrivalTimes.find(stop => stop.stopId === startStop.stop_id);
      // Eğer hesaplanan varış zamanı bilgisi varsa, yeni hesapladığımız değerle güncelle
    if (boardingStopInfo) {
        boardingStopInfo.time = boardingStopTimeMinutes;
        boardingStopInfo.formattedTime = boardingStopTime;
    }
  }
  
  return {
    departureTime: formatTime(departureTimeMinutes),  // İlk duraktan kalkış zamanı
    arrivalTime: formatTime(arrivalTime),             // Son durağa varış zamanı
      boardingTime: boardingStopTime,                   // Binilecek durağa varış zamanı
    waitTime: Math.max(0, departureTimeMinutes - getCurrentTime()), // Bekleme süresi
      timeToReachBoardingStop: timeToReachBoardingStop, // İlk duraktan biniş durağına seyahat süresi
    travelTime: baseTravelTime,                       // Seyahat süresi
    routeDistance: totalDistance > 0 ? Math.round(totalDistance) : null, // Toplam mesafe
    stopTimes: stopArrivalTimes                       // Tüm durak varış zamanları
  };
  } catch (error) {
    console.error('Varış zamanı hesaplama hatası:', error);
    return null;
  }
};

// Tüm durakları getir
exports.tumDuraklariGetir = async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run('MATCH (d:Durak) RETURN d ORDER BY d.name');
    const duraklar = result.records.map(record => record.get('d').properties);
    res.json(duraklar);
  } catch (error) {
    res.status(500).json({ hata: 'Duraklar alınırken bir hata oluştu', detay: error.message });
  } finally {
    await session.close();
  }
};

// Durak ID'ye göre durak getir
exports.durakGetir = async (req, res) => {
  const session = driver.session();
  const { id } = req.params;
  
  try {
    const result = await session.run(
      'MATCH (d:Durak {stop_id: $id}) RETURN d',
      { id }
    );
    
    if (result.records.length === 0) {
      return res.status(404).json({ hata: 'Durak bulunamadı' });
    }
    
    const durak = result.records[0].get('d').properties;
    res.json(durak);
  } catch (error) {
    res.status(500).json({ hata: 'Durak alınırken bir hata oluştu', detay: error.message });
  } finally {
    await session.close();
  }
};

// İsme veya koda göre durak ara
exports.durakAra = async (req, res) => {
  const session = driver.session();
  const searchTerm = req.query.q; 

  if (!searchTerm || searchTerm.trim().length < 2) {
    return res.json([]);
  }

  try {
    const result = await session.run(
      `
      MATCH (d:Durak)
      WHERE toLower(d.name) CONTAINS toLower($term) OR d.stop_id CONTAINS $term
      RETURN d.stop_id AS stop_id, d.name AS name, d.lat AS lat, d.lon AS lon
      LIMIT 15
      `,
      { term: searchTerm }
    );

    const duraklar = result.records.map(record => ({
      stop_id: record.get('stop_id'),
      name: record.get('name'),
      lat: record.get('lat'),
      lon: record.get('lon')
    }));

    res.json(duraklar);
  } catch (error) {
    console.error('Durak arama sırasında hata:', error);
    res.status(500).json({ message: 'Arama sırasında bir sunucu hatası oluştu.' });
  } finally {
    await session.close();
  }
};

// Koordinatlara göre en yakın durakları bul
exports.enYakinDuraklar = async (req, res) => {
  const session = driver.session();
  const { lat, lng, maxDistance } = req.query;
  
  // Yürüme mesafesi (metre) - varsayılan 500m
  const maxWalking = maxDistance ? parseInt(maxDistance) : 500;
  
  try {
    // Koordinat parametreleri yoksa hata döndür
    if (!lat || !lng) {
      return res.status(400).json({ hata: 'Konum bilgisi (lat, lng) gerekli' });
    }
    
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    
    // Neo4j noktalar arası mesafe sorgusu
    const result = await session.run(
      `MATCH (d:Durak)
       WHERE d.lat IS NOT NULL AND d.lon IS NOT NULL
       WITH d, 
            point.distance(
              point({latitude: toFloat(d.lat), longitude: toFloat(d.lon)}), 
              point({latitude: $latitude, longitude: $longitude})
            ) as mesafe
       WHERE mesafe <= $maxWalking
       RETURN d, mesafe
       ORDER BY mesafe
       LIMIT 5`,
      { 
        latitude,
        longitude,
        maxWalking
      }
    );
    
    // Durakları ve mesafeleri formatla
    const duraklar = result.records.map(record => ({
      ...record.get('d').properties,
      mesafe: record.get('mesafe')
    }));
    
    res.json(duraklar);
  } catch (error) {
    res.status(500).json({ hata: 'En yakın duraklar aranırken bir hata oluştu', detay: error.message });
  } finally {
    await session.close();
  }
};

// İki nokta arasında rota bul
exports.noktalarArasiRotaBul = async (req, res) => {
  const { baslangicLat, baslangicLng, bitisLat, bitisLng } = req.query;
  const maxWalkingDistance = req.query.maxWalkingDistance ? parseInt(req.query.maxWalkingDistance) : 500;
  
  try {
    console.log(`(${baslangicLat}, ${baslangicLng}) ve (${bitisLat}, ${bitisLng}) noktaları arasında rota aranıyor...`);
    
    // Başlangıç ve bitiş noktalarına en yakın durakları bul
    const session = driver.session();
    
    try {
      // 1. A noktasına en yakın 5 durak bul
      const baslangicDuraklar = await session.run(
        `MATCH (d:Durak)
         WHERE d.lat IS NOT NULL AND d.lon IS NOT NULL
         RETURN d, 
                point.distance(point({latitude: toFloat(d.lat), longitude: toFloat(d.lon)}), 
                               point({latitude: toFloat($lat), longitude: toFloat($lng)})) as mesafe
         ORDER BY mesafe
         LIMIT 5`,
        { lat: baslangicLat, lng: baslangicLng }
      );
      
      // 2. B noktasına en yakın 5 durak bul
      const bitisDuraklar = await session.run(
        `MATCH (d:Durak)
         WHERE d.lat IS NOT NULL AND d.lon IS NOT NULL
         RETURN d, 
                point.distance(point({latitude: toFloat(d.lat), longitude: toFloat(d.lon)}), 
                               point({latitude: toFloat($lat), longitude: toFloat($lng)})) as mesafe
         ORDER BY mesafe
         LIMIT 5`,
        { lat: bitisLat, lng: bitisLng }
      );
      
      // Mesafe sınırı içindeki durakları filtrele
      const yakinBaslangicDuraklar = baslangicDuraklar.records.filter(
        record => record.get('mesafe') <= maxWalkingDistance
      );
      
      const yakinBitisDuraklar = bitisDuraklar.records.filter(
        record => record.get('mesafe') <= maxWalkingDistance
      );
      
      console.log(`Başlangıç noktasına ${yakinBaslangicDuraklar.length} yakın durak, bitiş noktasına ${yakinBitisDuraklar.length} yakın durak bulundu`);
      
      if (yakinBaslangicDuraklar.length === 0) {
        return res.status(404).json({ hata: 'Başlangıç noktasına yakın durak bulunamadı' });
      }
      
      if (yakinBitisDuraklar.length === 0) {
        return res.status(404).json({ hata: 'Bitiş noktasına yakın durak bulunamadı' });
      }
      
      // Potansiyel rotaları topla
      const rotalar = [];
      
      // Başlangıç ve bitiş için en yakın 5 durak arasındaki tüm kombinasyonları değerlendir
      for (const baslangicRecord of yakinBaslangicDuraklar) {
        const baslangicDurak = baslangicRecord.get('d').properties;
        const baslangicMesafe = baslangicRecord.get('mesafe');
        
        for (const bitisRecord of yakinBitisDuraklar) {
          const bitisDurak = bitisRecord.get('d').properties;
          const bitisMesafe = bitisRecord.get('mesafe');
          
          // 3. Bu durak çifti arasındaki en kısa yolu giden hatları bul
          // NOT: Kuş uçuşu mesafeye göre değil, hatların gittiği gerçek mesafeye göre
          const ortakHatlar = await session.run(
            `MATCH path=(baslangic:Durak {stop_id: $baslangicId})-[r1:GÜZERGAH_ÜZERINDE]->(hat:Hat)<-[r2:GÜZERGAH_ÜZERINDE]-(bitis:Durak {stop_id: $bitisId})
             WHERE r1.yön = r2.yön AND r1.sıra < r2.sıra
             // Aynı rotada olması ve sıralı olması gerekli
             RETURN hat.route_id AS hatId, 
                    hat.route_name AS hatAdi, 
                    hat.route_number AS hatNo, 
                    r1.yön AS yon,
                    r2.sıra - r1.sıra AS durakFarki // Duraklar arası adım sayısı
             ORDER BY durakFarki ASC`,  // En az durak içeren güzergahı seç
            { baslangicId: baslangicDurak.stop_id, bitisId: bitisDurak.stop_id }
          );
          
          console.log(`Durak çifti: ${baslangicDurak.name} -> ${bitisDurak.name}, ortak hat sayısı: ${ortakHatlar.records.length}`);
          
          // Ortak hat varsa, bu hat üzerinden direkt rota oluştur
          for (const record of ortakHatlar.records) {
            const hatId = record.get('hatId');
            const hatAdi = record.get('hatAdi');
            const hatNo = record.get('hatNo') || hatAdi; // Hat numarası yoksa hat adını kullan
            const yon = record.get('yon');
            
            // Bu hat üzerindeki tüm durakları al
            const hatDuraklari = await session.run(
              `MATCH (h:Hat {route_id: $hatId})<-[r:GÜZERGAH_ÜZERINDE {yön: $yon}]-(d:Durak)
               RETURN d.stop_id AS durakId, d AS durakObj, r.sıra AS sira`,
              { hatId, yon }
            );
            
            // Durakları listeye dönüştür ve sıraya göre düzenle
            const duraklar = hatDuraklari.records.map(r => ({
              durak: r.get('durakObj').properties,
              hat: hatId,
              yon,
              sira: Number(r.get('sira'))
            })).sort((a, b) => a.sira - b.sira);
            
            // Başlangıç ve bitiş duraklarının indekslerini bul
            const baslangicIndex = duraklar.findIndex(d => d.durak.stop_id === baslangicDurak.stop_id);
            const bitisIndex = duraklar.findIndex(d => d.durak.stop_id === bitisDurak.stop_id);
            
            if (baslangicIndex !== -1 && bitisIndex !== -1 && baslangicIndex < bitisIndex) {
              // Başlangıç ve bitiş arasındaki durakları al
              const rotaDuraklar = duraklar.slice(baslangicIndex, bitisIndex + 1);
              
              // Toplam gerçek mesafeyi hesapla (duraklar arası mesafeler toplamı)
              let toplamMesafe = 0;
              for (let i = 0; i < rotaDuraklar.length - 1; i++) {
                const durak1 = rotaDuraklar[i].durak;
                const durak2 = rotaDuraklar[i + 1].durak;
                
                // İki durak arasındaki mesafeyi hesapla
                const durakMesafe = calculateDistance(
                  parseFloat(durak1.lat), parseFloat(durak1.lon),
                  parseFloat(durak2.lat), parseFloat(durak2.lon)
                );
                
                toplamMesafe += durakMesafe;
              }
              
              // Tahmini süre hesapla
              const durakSayisi = rotaDuraklar.length - 1; // Geçilen durak sayısı
              const tahminSure = durakSayisi * 2; // Her durak arası 2 dakika
              
              // Yürüme sürelerini hesapla
              const baslangicYurumeSuresi = Math.ceil(baslangicMesafe / 100 * 1.5); // 100m başına 1.5 dakika
              const bitisYurumeSuresi = Math.ceil(bitisMesafe / 100 * 1.5);
              
              // Toplam yolculuk süresi (otobüs + yürüme)
              const toplamSure = tahminSure + baslangicYurumeSuresi + bitisYurumeSuresi;
              
              // Varış zamanı bilgilerini hesapla
              const varisZamanBilgisi = await calculateArrivalTime(
                hatId,
                yon,
                baslangicIndex,
                bitisIndex,
                baslangicDurak,
                bitisDurak,
                rotaDuraklar.map(d => d.durak)
              );
              
              // Başlangıç ve bitiş koordinatlarını ekleyerek adımları oluştur
              const adimlar = [
                // A noktasından başlangıç durağına yürüme
                  {
                    tip: 'yürüme',
                  baslangic: { lat: baslangicLat, lng: baslangicLng, name: 'A Noktası' },
                    bitis: baslangicDurak,
                  mesafe: baslangicMesafe,
                  süre: baslangicYurumeSuresi,
                  baslangicNokta: true
                  },
                // Otobüs yolculuğu
                  {
                    tip: 'otobüs',
                    hat: hatId,
                    hatNo: hatNo,
                  hatAdi: hatAdi,
                  yon: yon,
                  baslangic: baslangicDurak,
                  bitis: bitisDurak,
                  durakSayisi: durakSayisi,
                    süre: tahminSure,
                  mesafe: toplamMesafe,
                  timeEstimate: varisZamanBilgisi,
                  binisZamanFormatli: varisZamanBilgisi?.boardingTime,
                  biniseKalanSure: varisZamanBilgisi?.waitTime,
                  varisZamanFormatli: varisZamanBilgisi?.arrivalTime
                },
                // Bitiş durağından B noktasına yürüme
                  {
                    tip: 'yürüme',
                    baslangic: bitisDurak,
                  bitis: { lat: bitisLat, lng: bitisLng, name: 'B Noktası' },
                  mesafe: bitisMesafe,
                  süre: bitisYurumeSuresi,
                  bitisNokta: true
                }
              ];
              
              // Rotayı ekle
              rotalar.push({
                rotaId: `direkt-${hatId}-${baslangicDurak.stop_id}-${bitisDurak.stop_id}`,
                rotaTipi: 'direkt',
                hatAdi: hatAdi,
                hatNo: hatNo,
                toplamSure: toplamSure,
                toplamMesafe: toplamMesafe + baslangicMesafe + bitisMesafe,
                adimlar: adimlar,
                duraklar: rotaDuraklar,
                haritaKoordinatlari: [
                  [parseFloat(baslangicLat), parseFloat(baslangicLng)],
                  ...rotaDuraklar.map(d => [parseFloat(d.durak.lat), parseFloat(d.durak.lon)]),
                  [parseFloat(bitisLat), parseFloat(bitisLng)]
                ],
                otobusZamanlama: varisZamanBilgisi ? {
                  ilkDuraktanKalkis: varisZamanBilgisi.departureTime,
                  duragaVaris: varisZamanBilgisi.boardingTime,
                  biniseKalanSure: varisZamanBilgisi.waitTime,
                  ilkDuraktanBinisDuragina: varisZamanBilgisi.timeToReachBoardingStop || 0
                } : null
              });
            }
          }
        }
      }
      
      // Eğer direkt hat yoksa, aktarmalı rotaları hesapla
      if (rotalar.length === 0 && yakinBaslangicDuraklar.length > 0 && yakinBitisDuraklar.length > 0) {
        // En yakın başlangıç ve bitiş duraklarını ve mesafeleri al
        const baslangicDurak = yakinBaslangicDuraklar[0].get('d').properties;
        const bitisDurak = yakinBitisDuraklar[0].get('d').properties;
        const baslangicMesafe = yakinBaslangicDuraklar[0].get('mesafe');
        const bitisMesafe = yakinBitisDuraklar[0].get('mesafe');
        const bitisId = bitisDurak.stop_id;

        // Önemli aktarma noktalarını bul (en fazla hat geçen duraklar)
        const session4 = driver.session();
        try {
          console.log("Direkt hat bulunamadı, aktarmalı rotalar hesaplanıyor...");
          
          const aktarmaNoktasiAdaylari = await session4.run(
            `MATCH (d:Durak)-[r:GÜZERGAH_ÜZERINDE]->(h:Hat)
             WHERE d.stop_id <> $baslangicId AND d.stop_id <> $bitisId
             WITH d, COUNT(DISTINCT h) as hat_sayisi
             RETURN d, hat_sayisi
             ORDER BY hat_sayisi DESC
             LIMIT 5`,
            { 
              baslangicId: baslangicDurak.stop_id, 
              bitisId: bitisDurak.stop_id
            }
          );

          console.log(`Aktarma noktası olabilecek ${aktarmaNoktasiAdaylari.records.length} durak bulundu`);

          // Her bir aktarma noktası adayı için rota oluştur
          for (const aktarmaRecord of aktarmaNoktasiAdaylari.records) {
            const aktarmaDurak = aktarmaRecord.get('d').properties;
            const hatSayisi = aktarmaRecord.get('hat_sayisi').toNumber();
            
            console.log(`Potansiyel aktarma noktası: ${aktarmaDurak.name} (${hatSayisi} hat geçiyor)`);

            // Başlangıçtan aktarma noktasına hat var mı kontrol et
                const baslangicToAktarma = await session4.run(
              `MATCH (baslangic:Durak {stop_id: $baslangicId})-[r1:GÜZERGAH_ÜZERINDE]->(hat:Hat)<-[r2:GÜZERGAH_ÜZERINDE]-(aktarma:Durak {stop_id: $aktarmaId})
                   WHERE r1.yön = r2.yön AND r1.sıra < r2.sıra
                RETURN hat.route_id AS hatId, hat.route_name AS hatAdi, hat.route_number AS hatNo, r1.yön AS yon`,
                  { baslangicId: baslangicDurak.stop_id, aktarmaId: aktarmaDurak.stop_id }
                );

            // Aktarma noktasından bitişe hat var mı kontrol et
                const aktarmaToBitis = await session4.run(
              `MATCH (aktarma:Durak {stop_id: $aktarmaId})-[r1:GÜZERGAH_ÜZERINDE]->(hat:Hat)<-[r2:GÜZERGAH_ÜZERINDE]-(bitis:Durak {stop_id: $bitisId})
                   WHERE r1.yön = r2.yön AND r1.sıra < r2.sıra
                RETURN hat.route_id AS hatId, hat.route_name AS hatAdi, hat.route_number AS hatNo, r1.yön AS yon`,
              { aktarmaId: aktarmaDurak.stop_id, bitisId }
                );

                // Eğer her iki segment için de hat bulunduysa
                if (baslangicToAktarma.records.length > 0 && aktarmaToBitis.records.length > 0) {
                  const baslangicHat = baslangicToAktarma.records[0];
                  const baslangicHatId = baslangicHat.get('hatId');
                  const baslangicHatAdi = baslangicHat.get('hatAdi');
                  const baslangicHatNo = baslangicHat.get('hatNo') || baslangicHatAdi;
                  const baslangicYon = baslangicHat.get('yon');

                  const bitisHat = aktarmaToBitis.records[0];
                  const bitisHatId = bitisHat.get('hatId');
                  const bitisHatAdi = bitisHat.get('hatAdi');
                  const bitisHatNo = bitisHat.get('hatNo') || bitisHatAdi;
                  const bitisYon = bitisHat.get('yon');

                  console.log(`Aktarmalı rota: ${baslangicDurak.name} (${baslangicHatNo}) -> ${aktarmaDurak.name} (Aktarma) -> ${bitisDurak.name} (${bitisHatNo})`);

                  // İlk segment için durak sayısını ve sürelerini hesapla
                  const ilkSegmentSonuc = await getRotaSegmenti(session4, baslangicHatId, baslangicYon, baslangicDurak.stop_id, aktarmaDurak.stop_id);
                  
                  // İkinci segment için durak sayısını ve sürelerini hesapla
                  const ikinciSegmentSonuc = await getRotaSegmenti(session4, bitisHatId, bitisYon, aktarmaDurak.stop_id, bitisDurak.stop_id);
                  
                  if (ilkSegmentSonuc && ikinciSegmentSonuc) {
                    // İlk segmentin toplam mesafesini hesapla
                    let ilkSegmentMesafe = 0;
                    for (let i = 0; i < ilkSegmentSonuc.duraklar.length - 1; i++) {
                      const durak1 = ilkSegmentSonuc.duraklar[i].durak;
                      const durak2 = ilkSegmentSonuc.duraklar[i + 1].durak;
                      ilkSegmentMesafe += calculateDistance(
                        parseFloat(durak1.lat), parseFloat(durak1.lon),
                        parseFloat(durak2.lat), parseFloat(durak2.lon)
                      );
                    }
                    
                    // İkinci segmentin toplam mesafesini hesapla
                    let ikinciSegmentMesafe = 0;
                    for (let i = 0; i < ikinciSegmentSonuc.duraklar.length - 1; i++) {
                      const durak1 = ikinciSegmentSonuc.duraklar[i].durak;
                      const durak2 = ikinciSegmentSonuc.duraklar[i + 1].durak;
                      ikinciSegmentMesafe += calculateDistance(
                        parseFloat(durak1.lat), parseFloat(durak1.lon),
                        parseFloat(durak2.lat), parseFloat(durak2.lon)
                      );
                    }
                    
                    // İlk segmentin varış zamanı bilgilerini hesapla
                    const ilkSegmentVarisZamani = await calculateArrivalTime(
                      baslangicHatId,
                      baslangicYon,
                      ilkSegmentSonuc.baslangicIndex,
                      ilkSegmentSonuc.bitisIndex,
                      baslangicDurak,
                      aktarmaDurak,
                      ilkSegmentSonuc.duraklar.map(d => d.durak)
                    );
                    
                    // İkinci segmentin varış zamanı bilgilerini hesapla (aktarma süresi eklenmiş)
                    const aktarmaSuresi = 5; // dakika
                    let ikinciSegmentVarisZamani = null;
                    
                    if (ilkSegmentVarisZamani) {
                      // İlk segmentin varış zamanından aktarma süresini ekle
                      const ikinciSegmentBaslangicZamani = ilkSegmentVarisZamani.time + aktarmaSuresi;
                      
                      // İkinci segment için varış zamanı hesapla
                      ikinciSegmentVarisZamani = await calculateArrivalTime(
                        bitisHatId,
                        bitisYon,
                        ikinciSegmentSonuc.baslangicIndex,
                        ikinciSegmentSonuc.bitisIndex,
                        aktarmaDurak,
                        bitisDurak,
                        ikinciSegmentSonuc.duraklar.map(d => d.durak)
                      );
                    }

                    // Yürüme sürelerini hesapla
                    const baslangicYurumeSuresi = Math.ceil(baslangicMesafe / 100 * 1.5);
                    const bitisYurumeSuresi = Math.ceil(bitisMesafe / 100 * 1.5);
                    
                    // Toplam süre ve mesafeyi hesapla
                    const toplamSure = ilkSegmentSonuc.sure + aktarmaSuresi + ikinciSegmentSonuc.sure + baslangicYurumeSuresi + bitisYurumeSuresi;
                    const toplamMesafe = ilkSegmentMesafe + ikinciSegmentMesafe + baslangicMesafe + bitisMesafe;
                    
                    // Adımları oluştur
                    const adimlar = [
                      // A noktasından başlangıç durağına yürüme
                      {
                        tip: 'yürüme',
                        baslangic: { lat: baslangicLat, lng: baslangicLng, name: 'A Noktası' },
                        bitis: baslangicDurak,
                        mesafe: baslangicMesafe,
                        süre: baslangicYurumeSuresi,
                        baslangicNokta: true
                      },
                      // İlk otobüs yolculuğu
                      {
                        tip: 'otobüs',
                        hat: baslangicHatId,
                        hatNo: baslangicHatNo,
                        hatAdi: baslangicHatAdi,
                        yon: baslangicYon,
                        baslangic: baslangicDurak,
                        bitis: aktarmaDurak,
                        durakSayisi: ilkSegmentSonuc.durakSayisi,
                        süre: ilkSegmentSonuc.sure,
                        mesafe: ilkSegmentMesafe,
                        timeEstimate: ilkSegmentVarisZamani,
                        binisZamanFormatli: ilkSegmentVarisZamani?.boardingTime,
                        biniseKalanSure: ilkSegmentVarisZamani?.waitTime,
                        varisZamanFormatli: ilkSegmentVarisZamani?.arrivalTime
                      },
                      // Aktarma
                      {
                        tip: 'aktarma',
                        baslangic: aktarmaDurak,
                        bitis: aktarmaDurak,
                        süre: aktarmaSuresi
                      },
                      // İkinci otobüs yolculuğu
                      {
                        tip: 'otobüs',
                        hat: bitisHatId,
                        hatNo: bitisHatNo,
                        hatAdi: bitisHatAdi,
                        yon: bitisYon,
                        baslangic: aktarmaDurak,
                        bitis: bitisDurak,
                        durakSayisi: ikinciSegmentSonuc.durakSayisi,
                        süre: ikinciSegmentSonuc.sure,
                        mesafe: ikinciSegmentMesafe,
                        timeEstimate: ikinciSegmentVarisZamani,
                        binisZamanFormatli: ikinciSegmentVarisZamani?.boardingTime,
                        biniseKalanSure: ikinciSegmentVarisZamani?.waitTime,
                        varisZamanFormatli: ikinciSegmentVarisZamani?.arrivalTime
                      },
                      // Bitiş durağından B noktasına yürüme
                      {
                        tip: 'yürüme',
                        baslangic: bitisDurak,
                        bitis: { lat: bitisLat, lng: bitisLng, name: 'B Noktası' },
                        mesafe: bitisMesafe,
                        süre: bitisYurumeSuresi,
                        bitisNokta: true
                      }
                    ];
                    
                    // Rotayı oluştur
                    rotalar.push({
                      rotaId: `aktarmali-${baslangicHatId}-${aktarmaDurak.stop_id}-${bitisHatId}-${bitisDurak.stop_id}`,
                      rotaTipi: 'aktarmali',
                      aktarmaDurakAdi: aktarmaDurak.name,
                      toplamSure: toplamSure,
                      toplamMesafe: toplamMesafe,
                      varisZamani: {
                        ilkSegment: ilkSegmentVarisZamani,
                        ikinciSegment: ikinciSegmentVarisZamani,
                        toplamBeklemeSuresi: ilkSegmentVarisZamani ? ilkSegmentVarisZamani.waitTime : 0,
                        toplamSeyahatSuresi: toplamSure,
                        ilkDuraktanBinisDuragina: ilkSegmentVarisZamani ? ilkSegmentVarisZamani.timeToReachBoardingStop : 0
                      },
                      adimlar: adimlar,
                      duraklar: [
                        ...ilkSegmentSonuc.duraklar,
                        ...ikinciSegmentSonuc.duraklar.slice(1)
                      ],
                      haritaKoordinatlari: [
                        [parseFloat(baslangicLat), parseFloat(baslangicLng)],
                        ...ilkSegmentSonuc.duraklar.map(d => [parseFloat(d.durak.lat), parseFloat(d.durak.lon)]),
                        ...ikinciSegmentSonuc.duraklar.slice(1).map(d => [parseFloat(d.durak.lat), parseFloat(d.durak.lon)]),
                        [parseFloat(bitisLat), parseFloat(bitisLng)]
                      ]
                    });
              }
            }
          }
        } catch (err) {
          console.error("Aktarmalı rota arama hatası:", err);
        }
      }
      
      if (rotalar.length === 0) {
        // Rota bulunamazsa 404 yerine boş dizi döndür
        return res.json([]);
      }
      
      // Rotaları toplamSure'ye göre sırala (en hızlı önce)
      rotalar.sort((a, b) => a.toplamSure - b.toplamSure);
      
      console.log(`Toplam ${rotalar.length} rota bulundu. En hızlı: ${rotalar[0].toplamSure} dakika.`);
      res.json(rotalar);
      
    } catch (error) {
      console.error("Rota hesaplama hatası:", error);
      res.status(500).json({ hata: 'Rota hesaplanırken bir hata oluştu', detay: error.message });
    }
  } catch (error) {
    console.error("Rota hesaplama hatası:", error);
    res.status(500).json({ hata: 'Rota hesaplanırken bir hata oluştu', detay: error.message });
  }
};

// Bir durağın üzerinden geçen hatları getirir
exports.durakHatlariniGetir = async (req, res) => {
  const session = driver.session();
  const { id } = req.params;
  
  try {
    const result = await session.run(
      `MATCH (d:Durak {stop_id: $id})-[:GÜZERGAH_ÜZERINDE]->(h:Hat) 
       RETURN h.route_number as hat_no, 
              h.route_long_name as hat_adi, 
              h.route_id as route_id,
              h.route_color as route_color,
              h.yön as yon
       ORDER BY h.route_number`,
      { id }
    );
    
    if (result.records.length === 0) {
      // Hat bulunamayınca hata vermek yerine boş dizi döndürmek daha iyi bir UX olabilir
      return res.json([]);
    }
    
    const hatlar = result.records.map(record => ({
      hat_no: record.get('hat_no'),
      hat_adi: record.get('hat_adi'),
      route_id: record.get('route_id'),
      route_color: record.get('route_color'),
      yon: record.get('yon')
    }));
    
    res.json(hatlar);
  } catch (error) {
    console.error(`Duraktan geçen hatlar getirilirken hata oluştu: ${error}`);
    res.status(500).json({ hata: 'Hat bilgileri alınırken bir hata oluştu', detay: error.message });
  } finally {
    await session.close();
  }
};

// İki durak arasındaki bağlantıyı bul
exports.durakBaglantiBul = async (req, res) => {
  const { baslangicId, bitisId } = req.params;
  const session = driver.session();

  try {
    console.log(`"${baslangicId}" ve "${bitisId}" durakları arasında bağlantı aranıyor...`);

    const baslangicResult = await session.run('MATCH (d:Durak {stop_id: $id}) RETURN d', { id: baslangicId });
    if (baslangicResult.records.length === 0) {
      return res.status(404).json({ hata: 'Başlangıç durağı bulunamadı' });
    }
    const baslangicDurak = baslangicResult.records[0].get('d').properties;

    const bitisResult = await session.run('MATCH (d:Durak {stop_id: $id}) RETURN d', { id: bitisId });
    if (bitisResult.records.length === 0) {
      return res.status(404).json({ hata: 'Bitiş durağı bulunamadı' });
    }
    const bitisDurak = bitisResult.records[0].get('d').properties;

    // Rota bulma mantığını burada yeniden uygula, ama yürüme adımları olmadan
    req.query.baslangicLat = baslangicDurak.lat;
    req.query.baslangicLng = baslangicDurak.lon;
    req.query.bitisLat = bitisDurak.lat;
    req.query.bitisLng = bitisDurak.lon;
    req.query.maxWalkingDistance = 1; // Yürüme adımlarını engellemek için

    // noktalarArasiRotaBul'u çağır, ancak cevabı işle ve yeniden formatla
    const originalJson = res.json;
    let responseSent = false;
    res.json = (data) => {
      if (responseSent) return;
      responseSent = true;

      if (Array.isArray(data)) {
        const rotalar = data.map(rota => {
          const filteredAdimlar = rota.adimlar.filter(adim => adim.tip !== 'yürüme');
          const yurumeSuresi = rota.adimlar
            .filter(adim => adim.tip === 'yürüme')
            .reduce((total, adim) => total + adim.süre, 0);

          return {
            ...rota,
            adimlar: filteredAdimlar,
            toplamSure: rota.toplamSure - yurumeSuresi,
            rotaAdi: `${filteredAdimlar[0]?.hatNo || ''} Hattı ile Rota`,
          };
        }).filter(rota => rota.adimlar.length > 0);

        originalJson.call(res, rotalar);
      } else {
        originalJson.call(res, data);
      }
    };
    
    await exports.noktalarArasiRotaBul(req, res);

  } catch (error) {
    console.error("Durak bağlantısı hesaplama hatası:", error);
    if (!res.headersSent) {
      res.status(500).json({ hata: 'Durak bağlantısı hesaplanırken bir hata oluştu', detay: error.message });
    }
  } finally {
    // Session burada kapatılmamalı çünkü `noktalarArasiRotaBul` kapatıyor.
  }
};

// Bir hat üzerindeki iki durak arasındaki rota segmentini hesapla
async function getRotaSegmenti(session, hatId, yon, baslangicId, bitisId) {
  // Bu hat üzerindeki tüm durakları al
  const hatDuraklari = await session.run(
    `MATCH (h:Hat {route_id: $hatId})<-[r:GÜZERGAH_ÜZERINDE {yön: $yon}]-(d:Durak)
     RETURN d.stop_id AS durakId, d AS durakObj, r.sıra AS sira`,
    { hatId, yon }
  );
  
  // Durakları listeye dönüştür ve sıraya göre düzenle
  const duraklar = hatDuraklari.records.map(r => ({
    durak: r.get('durakObj').properties,
    hat: hatId,
    yon,
    sira: Number(r.get('sira'))
  })).sort((a, b) => a.sira - b.sira);
  
  // Başlangıç ve bitiş duraklarının indekslerini bul
  const baslangicIndex = duraklar.findIndex(d => d.durak.stop_id === baslangicId);
  const bitisIndex = duraklar.findIndex(d => d.durak.stop_id === bitisId);
  
  if (baslangicIndex !== -1 && bitisIndex !== -1) {
    // Başlangıç ve bitiş arasındaki durakları al
    let rotaDuraklar;
    if (baslangicIndex < bitisIndex) {
      rotaDuraklar = duraklar.slice(baslangicIndex, bitisIndex + 1);
    } else {
      rotaDuraklar = duraklar.slice(bitisIndex, baslangicIndex + 1).reverse();
    }
    
    // Durak sayısı ve tahmini süre hesapla
    const durakSayisi = rotaDuraklar.length - 1;
    const sure = durakSayisi * 2; // Her durak arası 2 dakika
    
    return {
      duraklar: rotaDuraklar,
      durakSayisi,
      sure,
      baslangicIndex,
      bitisIndex
    };
  }
  
  return {
    duraklar: [],
    durakSayisi: 0,
    sure: 0,
    baslangicIndex: -1,
    bitisIndex: -1
  };
}

// Belirli bir konuma yakın olan durakları getirir
exports.getYakinDuraklar = async (req, res) => {
  const { lat, lng, maxDistance } = req.query;

  if (!lat || !lng || !maxDistance) {
    return res.status(400).send('Eksik parametre: lat, lng ve maxDistance gereklidir.');
  }

  const session = driver.session();
  try {
    const result = await session.run(
      `
      MATCH (d:Durak)
      WHERE d.lat IS NOT NULL AND d.lon IS NOT NULL
       WITH d, point.distance(
         point({latitude: toFloat($lat), longitude: toFloat($lng)}),
        point({latitude: toFloat(d.lat), longitude: toFloat(d.lon)})
       ) AS distance
      WHERE distance <= toFloat($maxDistance)
       RETURN d.stop_id AS stop_id, d.name AS name, d.lat AS lat, d.lon AS lon, distance
       ORDER BY distance
      LIMIT 100
      `,
      { lat: parseFloat(lat), lng: parseFloat(lng), maxDistance: parseFloat(maxDistance) }
    );

    const stops = result.records.map(record => ({
      stop_id: record.get('stop_id'),
      name: record.get('name'),
      lat: record.get('lat'),
      lon: record.get('lon'),
      distance: record.get('distance'),
    }));

    res.json(stops);
  } catch (error) {
    console.error('Yakın duraklar alınırken hata oluştu:', error);
    res.status(500).send('Sunucu hatası');
  } finally {
    await session.close();
  }
};

// Yeni fonksiyon: Belirli bir duraktan geçen hatları getirir
exports.getHatlarGecenDurak = async (req, res) => {
  const { stop_id } = req.params;
  const session = driver.session();

  try {
    const result = await session.run(
      `MATCH (d:Durak {stop_id: $stop_id})-[r:GÜZERGAH_ÜZERINDE]->(h:Hat)
       RETURN h.route_number as hat_no, h.route_long_name as hat_adi, h.route_id as route_id
       ORDER BY h.route_number`,
      { stop_id }
    );

    const hatlar = result.records.map(record => ({
      hat_no: record.get('hat_no'),
      hat_adi: record.get('hat_adi'),
      route_id: record.get('route_id')
    }));

    res.json(hatlar);
  } catch (error) {
    console.error(`Duraktan geçen hatlar getirilirken hata oluştu: ${error}`);
    res.status(500).json({ message: 'Duraktan geçen hatlar alınamadı.' });
  } finally {
    await session.close();
  }
};

// Tüm durakları getiren yeni fonksiyon
exports.getAllStops = async (req, res) => {
    const session = driver.session();
    try {
        const result = await session.run(
            `MATCH (d:Durak) 
             RETURN d.stop_id AS value, d.name AS label, d.lat AS lat, d.lon AS lon 
             ORDER BY d.name`
        );
        const stops = result.records.map(record => ({
            value: record.get('value'),
            label: record.get('label'),
            lat: record.get('lat'),
            lon: record.get('lon')
        }));
        res.json(stops);
    } catch (error) {
        console.error('Tüm duraklar alınırken hata:', error);
        res.status(500).json({ error: 'Duraklar alınırken bir sunucu hatası oluştu.' });
  } finally {
    await session.close();
  }
};

// Belirli bir durağa yaklaşan hatları ve tahmini varış sürelerini getirir (Yeniden yapılandırıldı)
exports.getYaklasanHatlar = async (req, res) => {
  const session = driver.session();
  const { id: stopId } = req.params;
  const dayType = getDayType();
  const currentTimeInMinutes = getCurrentTime();

  try {
    // 1. Duraktan geçen tüm hatları ve bu duraktaki sıra numaralarını al (Doğru ilişki yönü ve özellik adlarıyla)
    const hatlarResult = await session.run(`
      MATCH (d:Durak {stop_id: $stopId})-[r:GÜZERGAH_ÜZERINDE]->(h:Hat)
      RETURN h.route_id AS route_id,
             h.route_number AS hat_no,
             h.route_long_name AS hat_adi,
             h.${dayType}_times AS schedule,
             r.sıra AS stop_sequence
    `, { stopId });

    if (hatlarResult.records.length === 0) {
      return res.json([]);
    }

    const yaklasanHatlarPromises = hatlarResult.records.map(async (record) => {
      const hat = {
        route_id: record.get('route_id'),
        hat_no: record.get('hat_no'),
        hat_adi: record.get('hat_adi'),
        schedule: record.get('schedule'),
        stop_sequence: record.get('stop_sequence')?.toNumber()
      };

      // Gerekli bilgiler eksikse bu hattı atla
      if (!hat.schedule || hat.stop_sequence === undefined || hat.stop_sequence <= 0) {
        return null;
      }
      
      // 2. Sonraki kalkış saatini bul
      const seferSaatleri = hat.schedule.trim().split(' ').map(parseTime).filter(t => t !== null);
      if(seferSaatleri.length === 0) return null;

      // Durağa tahmini varış süresini hesaba katarak bir sonraki kalkışı bul.
      // Bu, "otobüs çoktan kalktı ama daha durağa varmadı" durumunu doğru ele almamızı sağlar.
      const seyahatSuresi = hat.stop_sequence * 0.85; // Dakika

      // Kalkış saati + seyahat süresi > şimdiki zaman olan ilk seferi bul
      const sonrakiUygunSefer = seferSaatleri.find(kalkisSaati => (kalkisSaati + seyahatSuresi) > currentTimeInMinutes);

      if (sonrakiUygunSefer === undefined) {
        return null; // Bugün için yakalanabilecek sefer yok
      }

      // 3. Tahmini varış süresini hesapla
      const tahminiVarisZamani = sonrakiUygunSefer + seyahatSuresi;
      const kalanSure = Math.round(tahminiVarisZamani - currentTimeInMinutes);

      if (kalanSure >= 0 && kalanSure < 15) { // 15 dakikadan az kalanları listele
        return {
          ...hat,
          tahmini_varis: formatTime(tahminiVarisZamani),
          kalan_sure: kalanSure,
        };
      }
      return null;
    });

    // Tüm hatların hesaplamaları tamamlandıktan sonra null olanları filtrele
    const sonuclar = (await Promise.all(yaklasanHatlarPromises)).filter(Boolean);

    // Sonuçları kalan süreye göre sırala
    sonuclar.sort((a, b) => a.kalan_sure - b.kalan_sure);

    res.json(sonuclar);

  } catch (error) {
    console.error('Yaklaşan hatlar alınırken hata oluştu:', error);
    res.status(500).json({ message: 'Sunucu hatası oluştu.' });
  } finally {
    await session.close();
  }
};

/**
 * Belirli bir durağın detaylarını getirir.
 */
exports.getDurakDetay = async (req, res) => {
  const session = driver.session();
  const { id } = req.params;

  try {
    const result = await session.run(
      'MATCH (d:Durak {stop_id: $id}) RETURN d',
      { id }
    );

    if (result.records.length === 0) {
      return res.status(404).json({ hata: 'Durak bulunamadı' });
    }

    const durak = result.records[0].get('d').properties;
    res.json(durak);
  } catch (error) {
    res.status(500).json({ hata: 'Durak detayı alınırken bir hata oluştu', detay: error.message });
  } finally {
    await session.close();
  }
};