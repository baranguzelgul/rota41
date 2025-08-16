const { driver } = require('../configs/neo4j');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

// Tüm hatları getir
exports.tumHatlariGetir = async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run('MATCH (h:Hat) RETURN h ORDER BY h.route_number');
    const hatlar = result.records.map(record => record.get('h').properties);
    res.json(hatlar);
  } catch (error) {
    res.status(500).json({ hata: 'Hatlar alınırken bir hata oluştu', detay: error.message });
  } finally {
    await session.close();
  }
};

// Hat ID'ye göre hat getir
exports.hatGetir = async (req, res) => {
  const session = driver.session();
  const { id } = req.params;
  
  try {
    const result = await session.run(
      'MATCH (h:Hat {route_id: $id}) RETURN h',
      { id }
    );
    
    if (result.records.length === 0) {
      return res.status(404).json({ hata: 'Hat bulunamadı' });
    }
    
    const hat = result.records[0].get('h').properties;

    // Eğer direction bilgisi hat nesnesinde yoksa, ayrıca schedules.txt'den alınan direction'ı da sorgulayalım
    if (!hat.direction) {
      try {
        const directionResult = await session.run(
          `MATCH (h:Hat {route_id: $id}) 
           RETURN h.direction as direction`,
          { id }
        );
        
        if (directionResult.records.length > 0 && directionResult.records[0].get('direction')) {
          hat.direction = directionResult.records[0].get('direction');
        }
      } catch (dirErr) {
        console.warn("Hat için direction bilgisi alınamadı:", dirErr);
      }
    }
    
    res.json(hat);
  } catch (error) {
    res.status(500).json({ hata: 'Hat alınırken bir hata oluştu', detay: error.message });
  } finally {
    await session.close();
  }
};

// Hat ismine göre hat ara
exports.hatAra = async (req, res) => {
  const session = driver.session();
  const { isim } = req.query;
  
  try {
    // İsim parametresi yoksa hata döndür
    if (!isim) {
      return res.status(400).json({ hata: 'Arama için hat ismi gerekli' });
    }
    
    console.log(`Arama yapılıyor: "${isim}"`);
    
    // Büyük/küçük harf duyarsız arama yapar
    // route_name, route_number ve route_long_name'de arama yapar
    const result = await session.run(
      `MATCH (h:Hat) 
       WHERE toLower(h.route_name) CONTAINS toLower($isim) OR 
             toLower(h.route_number) CONTAINS toLower($isim) OR
             toLower(h.route_long_name) CONTAINS toLower($isim)
       RETURN h 
       ORDER BY h.route_number`,
      { isim }
    );
    
    const hatlar = result.records.map(record => {
      const hat = record.get('h').properties;
      console.log(`Bulunan hat: ${hat.route_id}, ${hat.route_number}, ${hat.route_name}`);
      return hat;
    });
    
    console.log(`Toplam ${hatlar.length} hat bulundu.`);
    res.json(hatlar);
  } catch (error) {
    console.error('Hat arama hatası:', error);
    res.status(500).json({ hata: 'Hat araması yapılırken bir hata oluştu', detay: error.message });
  } finally {
    await session.close();
  }
};

// Bir hattın güzergahındaki tüm durakları getir
exports.hatGuzergahiniGetir = async (req, res) => {
  const session = driver.session();
  const { id } = req.params;
  const { yon } = req.query; // "Gidiş" veya "Dönüş"
  
  try {
    let query;
    
    if (yon) {
      // Belirli bir yöndeki güzergahı getir
      query = `
        MATCH (d)-[r:GÜZERGAH_ÜZERINDE {yön: $yon}]->(h:Hat {route_id: $id})
        RETURN d, r.sıra as sira
        ORDER BY r.sıra
      `;
    } else {
      // Tüm güzergahları getir (hem gidiş hem dönüş)
      query = `
        MATCH (d)-[r:GÜZERGAH_ÜZERINDE]->(h:Hat {route_id: $id})
        RETURN d, r.yön as yon, r.sıra as sira
        ORDER BY r.yön, r.sıra
      `;
    }
    
    const result = await session.run(query, { id, yon });
    
    if (result.records.length === 0) {
      return res.status(404).json({ hata: 'Hat veya güzergah bulunamadı' });
    }
    
    let duraklar;
    
    if (yon) {
      duraklar = result.records.map((record, index) => {
        const sira = record.get('sira');
        return {
          ...record.get('d').properties,
          sira: sira ? sira.toNumber() : index
        };
      });
    } else {
      duraklar = result.records.map((record, index) => {
        const sira = record.get('sira');
        return {
          ...record.get('d').properties,
          yon: record.get('yon'),
          sira: sira ? sira.toNumber() : index
        };
      });
    }
    
    res.json(duraklar);
  } catch (error) {
    res.status(500).json({ hata: 'Güzergah bilgileri alınırken bir hata oluştu', detay: error.message });
  } finally {
    await session.close();
  }
};

// Hat güzergahı için shape verilerini getir
exports.hatShapeGetir = async (req, res) => {
  const session = driver.session();
  const { id } = req.params;
  const { yon } = req.query; // "Gidiş" veya "Dönüş"
  
  try {
    // Find the correct shape for this route
    // First, check if there are direct shapes for this route ID
    const routeIdPrefix = id.slice(0, -1);  // Remove last digit
    const expectedYon = yon === 'Dönüş' ? '1' : '0';
    
    let query = `
      MATCH (p:ShapeNoktasi)
      WHERE p.shape_id STARTS WITH $routeIdPrefix 
      RETURN DISTINCT p.shape_id as shape_id
      LIMIT 10
    `;
    
    const shapeIdsResult = await session.run(query, { routeIdPrefix });
    let shapeId = null;
    
    if (shapeIdsResult.records.length > 0) {
      // Look for a shape ID that ends with the expected direction
      for (const record of shapeIdsResult.records) {
        const currentShapeId = record.get('shape_id');
        if (currentShapeId && currentShapeId.endsWith(expectedYon)) {
          shapeId = currentShapeId.slice(0, -1); // Remove last digit to get base shape
          break;
        }
      }
      
      // If we couldn't find an exact match, use the first one as base
      if (!shapeId && shapeIdsResult.records[0].get('shape_id')) {
        shapeId = shapeIdsResult.records[0].get('shape_id').slice(0, -1);
      }
    }
    
    if (!shapeId) {
      return res.status(404).json({ 
        hata: 'Shape verisi bulunamadı',
        message: `${id} numaralı hat için shape verisi bulunamadı.`
      });
    }
    
    // Now get all points for this shape with the expected direction
    const targetShapeId = `${shapeId}${expectedYon}`;
    
    query = `
      MATCH (p:ShapeNoktasi)
      WHERE p.shape_id = $targetShapeId
      RETURN p.lat as lat, p.lng as lng, p.sequence as sequence
      ORDER BY p.sequence
    `;
    
    const result = await session.run(query, { targetShapeId });
    
    if (result.records.length === 0) {
      return res.status(404).json({ 
        hata: 'Shape verisi bulunamadı',
        message: `${id} numaralı hat için ${yon} yönünde shape verisi bulunamadı.`
      });
    }
    
    const shapes = result.records.map(record => {
      const sequence = record.get('sequence');
      
      return {
        lat: record.get('lat'),
        lng: record.get('lng'),
        sequence: sequence ? sequence.toNumber() : 0
      };
    });
    
    // Sort by sequence
    shapes.sort((a, b) => a.sequence - b.sequence);
    
    res.json(shapes);
  } catch (error) {
    res.status(500).json({ 
      hata: 'Shape verileri alınırken bir hata oluştu', 
      detay: error.message 
    });
  } finally {
    await session.close();
  }
};

// Hat saat bilgilerini getir
exports.hatSaatBilgileriGetir = async (req, res) => {
  const session = driver.session();
  const { id } = req.params;
  
  try {
    // Get the current route's schedule
    const result = await session.run(
      `MATCH (h:Hat {route_id: $id}) 
       RETURN h.weekday_times as weekday_times, 
              h.saturday_times as saturday_times, 
              h.sunday_times as sunday_times,
              h.schedule_notes as schedule_notes,
              h.direction as direction,
              h.route_short_name as route_short_name`,
      { id }
    );
    
    if (result.records.length === 0) {
      return res.status(404).json({ hata: 'Hat bulunamadı veya zaman çizelgesi bilgisi yok' });
    }
    
    const record = result.records[0];
    
    // Saat bilgilerini daha kullanışlı bir formata çevirelim
    const formatTimes = (times) => {
      if (!times) return [];
      return times.trim().split(' ').filter(time => time.trim() !== '');
    };
    
    // Schedule.txt'den alınan direction bilgisini kullan
    // Eğer veritabanında direction yoksa, route_id'nin son hanesine göre varsayılan değer belirle
    const direction = record.get('direction') || (id.endsWith('0') ? 'Gidiş' : 'Dönüş');
    const route_short_name = record.get('route_short_name') || '';
    
    // Parse notes if available
    const scheduleNotes = record.get('schedule_notes') || '';
    let parsedNotes = [];
    
    if (scheduleNotes) {
      // Schedule notes are in the format: "#color:description | #color:description"
      const noteSegments = scheduleNotes.split('|');
      
      parsedNotes = noteSegments
        .map(segment => {
          segment = segment.trim();
          const hashIndex = segment.indexOf('#');
          
          if (hashIndex !== -1) {
            const colonIndex = segment.indexOf(':', hashIndex);
            
            if (colonIndex !== -1) {
              const color = segment.substring(hashIndex + 1, colonIndex).trim();
              const description = segment.substring(colonIndex + 1).trim();
              
              return { color, description };
            }
          }
          
          // If we can't parse as color:description, just return the whole segment as description
          return { color: '', description: segment };
        })
        .filter(note => note.description.trim() !== '');
    }
    
    // Get the paired route
    // If this route ID ends with 0, its pair ends with 1 and vice versa
    let pairedRouteId;
    if (id.endsWith('0')) {
      pairedRouteId = id.slice(0, -1) + '1';
    } else {
      pairedRouteId = id.slice(0, -1) + '0';
    }
    
    // Get the paired route's schedule
    let pairedSchedule = null;
    try {
      const pairedResult = await session.run(
        `MATCH (h:Hat {route_id: $pairedId}) 
         RETURN h.weekday_times as weekday_times, 
                h.saturday_times as saturday_times, 
                h.sunday_times as sunday_times,
                h.direction as direction,
                h.route_short_name as route_short_name`,
        { pairedId: pairedRouteId }
      );
      
      if (pairedResult.records.length > 0) {
        const pairedRecord = pairedResult.records[0];
        
        // Eşleşen hat için de direction bilgisini al, yoksa route_id'ye göre varsayılan kullan
        const pairedDirection = pairedRecord.get('direction') || (pairedRouteId.endsWith('0') ? 'Gidiş' : 'Dönüş');
        const pairedRouteShortName = pairedRecord.get('route_short_name') || '';
        
        pairedSchedule = {
          weekday_times: formatTimes(pairedRecord.get('weekday_times')),
          saturday_times: formatTimes(pairedRecord.get('saturday_times')),
          sunday_times: formatTimes(pairedRecord.get('sunday_times')),
          direction: pairedDirection,
          route_short_name: pairedRouteShortName
        };
      }
    } catch (err) {
      console.warn('Paired route schedule fetch error:', err);
    }
    
    // Anahtar bilgileri de ekleyelim - hat bilgisini de ekleyerek HatDetay.js'de doğru gösterilmesini sağlayabiliriz
    const saatBilgileri = {
      direction_1: direction,  // Bu hatın direction bilgisi
      direction_2: pairedSchedule ? pairedSchedule.direction : (id.endsWith('0') ? 'Dönüş' : 'Gidiş'), // Eşleşen hatın direction bilgisi
      route_short_name_1: route_short_name,  // Bu hatın kısa adı
      route_short_name_2: pairedSchedule ? pairedSchedule.route_short_name : '',  // Eşleşen hatın kısa adı
      notes: parsedNotes,
      weekday_times: {
        direction_1: formatTimes(record.get('weekday_times')),
        direction_2: pairedSchedule ? pairedSchedule.weekday_times : []
      },
      saturday_times: {
        direction_1: formatTimes(record.get('saturday_times')),
        direction_2: pairedSchedule ? pairedSchedule.saturday_times : []
      },
      sunday_times: {
        direction_1: formatTimes(record.get('sunday_times')),
        direction_2: pairedSchedule ? pairedSchedule.sunday_times : []
      }
    };
    
    res.json(saatBilgileri);
  } catch (error) {
    console.error('Saat bilgileri alınırken hata:', error);
    res.status(500).json({ 
      hata: 'Saat bilgileri alınırken bir hata oluştu', 
      detay: error.message,
      stack: error.stack 
    });
  } finally {
    await session.close();
  }
}; 