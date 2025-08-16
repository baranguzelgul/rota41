const neo4j = require('../configs/neo4j');
const { int } = require('neo4j-driver');
const { getDayType, getCurrentTimeInMinutes, parseTime, formatTime, getDayTypeFromDate, getTimeInMinutesFromDate } = require('../utils/timeUtils');

// Grafiğin bellekteki adı
const GDS_GRAPH_NAME = 'kocaeliRouteGraph';

// İki coğrafi nokta arasındaki mesafeyi Haversine formülü ile hesaplar (metre cinsinden)
const getPointsDistance = (p1, p2) => {
    const toRad = (value) => (value * Math.PI) / 180;
    const R = 6371e3; // Dünya'nın yarıçapı (metre)
    const lat1 = p1[0]; const lon1 = p1[1];
    const lat2 = p2[0]; const lon2 = p2[1];

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Metre cinsinden mesafe
};

// Bir shape (polyline) verisinin toplam uzunluğunu hesaplar
const calculateShapeDistance = (shape) => {
    if (!shape || shape.length < 2) return 0;
    let totalDistance = 0;
    for (let i = 0; i < shape.length - 1; i++) {
        totalDistance += getPointsDistance(shape[i], shape[i+1]);
    }
    return totalDistance;
};

// Enlem ve boylama en yakın N durağı bulan fonksiyon
const findNearestStops = async (session, lat, lon, limit = 5) => {
    const query = `
        MATCH (d:Durak)
        WITH d, point.distance(
            point({latitude: $lat, longitude: $lon}),
            point({latitude: d.lat, longitude: d.lon})
        ) AS distance
        RETURN d, distance
        ORDER BY distance
        LIMIT $limit
    `;
    const result = await session.run(query, { lat: parseFloat(lat), lon: parseFloat(lon), limit: int(limit) });
    return result.records.map(record => ({
        stop: record.get('d').properties,
        distance: record.get('distance')
    }));
};

// GDS grafiğinin bellekte olup olmadığını kontrol eder, yoksa oluşturur.
const ensureGdsGraphExists = async (session) => {
    const graphExistsResult = await session.run(`CALL gds.graph.exists($graphName) YIELD exists RETURN exists`, { graphName: GDS_GRAPH_NAME });
    
    if (graphExistsResult.records[0]?.get('exists')) {
        // Graf zaten varsa, silip yeniden oluşturmak en güvenlisi.
        // Veri güncellenmiş olabilir.
        await session.run(`CALL gds.graph.drop($graphName)`, { graphName: GDS_GRAPH_NAME });
        console.log(`Mevcut GDS Grafiği '${GDS_GRAPH_NAME}' güncellenmek üzere silindi.`);
    }

    console.log(`GDS Grafiği '${GDS_GRAPH_NAME}' belleğe yansıtılıyor...`);
    
    // 1. Adım: İlişkiler üzerinde mesafe tabanlı 'weight' özelliğini oluştur.
    // Bu, GDS'in mesafeye göre en kısa yolu bulmasını sağlar.
    await session.run(`
        MATCH (d1:Durak)-[r:SONRAKI_DURAK]->(d2:Durak)
        SET r.weight = point.distance(point({latitude: d1.lat, longitude: d1.lon}), point({latitude: d2.lat, longitude: d2.lon}))
    `);

    // 2. Adım: GDS'e sadece topoloji ve ağırlık bilgisini yansıt.
    const projectResult = await session.run(`
        CALL gds.graph.project(
            $graphName,
            'Durak',
            {
                SONRAKI_DURAK: {
                    properties: 'weight'
                }
            }
        ) YIELD graphName, nodeCount, relationshipCount
        RETURN graphName, nodeCount, relationshipCount
    `, { graphName: GDS_GRAPH_NAME });

    console.log(`GDS Grafiği '${GDS_GRAPH_NAME}' başarıyla oluşturuldu:`, projectResult.records[0].toObject());
};

// Dönen bir rotayı işleyip adımlara dönüştüren yardımcı fonksiyon
const processPathToSteps = (pathRecord, startStop, endStop) => {
    const stopsInPath = pathRecord.get('stops').map(s => s.properties);
    const segmentsInPathRels = pathRecord.get('segments');

    // HATA AYIKLAMA KODU BAŞLANGIÇ
    console.log("--- DEBUG: Gelen RAW Rota Segmentleri (sadece properties) ---");
    segmentsInPathRels.forEach((segment, i) => {
        // segment.properties nesnesinin yapısını görmek için logla
        console.log(`Segment ${i} Properties:`, JSON.stringify(segment.properties, null, 2));
    });
    console.log("-------------------------------------------------");
    // HATA AYIKLAMA KODU BİTİŞ

    const segmentsInPath = segmentsInPathRels.map(s => s.properties);

    let steps = [];
    // İlk yürüme adımı
    steps.push({ type: 'WALK', from: 'Başlangıç Noktanız', to: startStop.stop.name, duration: startStop.distance / 80 });

    if (segmentsInPath.length > 0 && segmentsInPath[0].relationshipProperties) {
        let currentBusLeg = {
            type: 'BUS',
            line: segmentsInPath[0].relationshipProperties.hat,
            from: stopsInPath[0].name,
            to: '',
            stops: 1
        };

        for (let i = 0; i < segmentsInPath.length; i++) {
            if (segmentsInPath[i].relationshipProperties.hat !== currentBusLeg.line && i > 0) {
                currentBusLeg.to = stopsInPath[i].name;
                steps.push(currentBusLeg);
                steps.push({ type: 'TRANSFER', text: `${stopsInPath[i].name} durağında ${segmentsInPath[i].relationshipProperties.hat} hattına aktarma yapın.` });
                currentBusLeg = { type: 'BUS', line: segmentsInPath[i].relationshipProperties.hat, from: stopsInPath[i].name, to: '', stops: 1 };
            } else {
                currentBusLeg.stops++;
            }

            if (i === segmentsInPath.length - 1) {
                currentBusLeg.to = stopsInPath[i + 1].name;
                steps.push(currentBusLeg);
            }
        }
    }

    // Son yürüme adımı
    steps.push({ type: 'WALK', from: stopsInPath[stopsInPath.length - 1].name, to: 'Varış Noktanız', duration: endStop.distance / 80 });
    
    // Toplam süreyi hesapla
    const totalDuration = steps.reduce((total, step) => {
        if (step.type === 'WALK') return total + (step.duration || 0);
        if (step.type === 'BUS') return total + (step.stops * 2); // Durak başı ~2 dk
        if (step.type === 'TRANSFER') return total + 3; // Aktarma ~3 dk
        return total;
    }, 0);

    return { total_duration: totalDuration, steps, unique_path_id: steps.map(s => s.line || s.to).join('-') };
};

// YENİ YARDIMCI FONKSİYON: Shape (yol geometrisi) verisini çeker
const getShapeFor = async (session, shapeId) => {
    const result = await session.run(
      `MATCH (p:ShapeNoktasi {shape_id: $shapeId})
       RETURN p.lat as lat, p.lng as lon
       ORDER BY p.sequence
      `, { shapeId }
    );
    // Leaflet'in beklediği format: [enlem, boylam]
    return result.records.map(record => [record.get('lat'), record.get('lon')]);
};

// YENİ YARDIMCI FONKSİYON: Shape'in sadece kullanılan kısmını kesip alır.
const sliceShape = (fullShape, startStop, endStop) => {
    if (!fullShape || fullShape.length === 0) return [];

    // Basit bir Öklid mesafesi karesi, karşılaştırma için yeterlidir.
    const getDistSq = (p1, p2) => Math.pow(p1[0] - p2.lat, 2) + Math.pow(p1[1] - p2.lon, 2);

    let startIndex = 0, endIndex = fullShape.length - 1;
    let minStartDist = Infinity, minEndDist = Infinity;

    fullShape.forEach((point, index) => {
        const distToStart = getDistSq(point, startStop);
        if (distToStart < minStartDist) {
            minStartDist = distToStart;
            startIndex = index;
        }
        const distToEnd = getDistSq(point, endStop);
        if (distToEnd < minEndDist) {
            minEndDist = distToEnd;
            endIndex = index;
        }
    });

    // Eğer başlangıç noktası bitiş noktasından sonra geliyorsa, tüm shape'i döndür (beklenmedik bir durum).
    if (startIndex >= endIndex) {
        return fullShape;
    }

    // Başlangıç ve bitiş noktalarını içeren kesiti döndür.
    return fullShape.slice(startIndex, endIndex + 1);
};

// YENİ YARDIMCI FONKSİYON: Bir hattın ilk durağını bulur.
const getFirstStopOfLine = async (session, routeId) => {
    const result = await session.run(
        `MATCH (h:Hat {route_id: $routeId})<-[r:GÜZERGAH_ÜZERINDE {sıra: 0}]-(d:Durak)
         RETURN d`,
        { routeId }
    );
    return result.records[0]?.get('d').properties;
};

// YENİ YARDIMCI FONKSİYON: Bir otobüsün durağa tahmini varış zamanını hesaplar.
const getBusArrivalTime = async (session, routeId, boardingStop, departureTime, walkDistance = 0) => {
    // 1. Gerekli bilgileri al (artık parametreden geliyor)
    const dayType = getDayTypeFromDate(departureTime);
    const desiredDepartureTime = getTimeInMinutesFromDate(departureTime);
    const timesField = `${dayType}_times`;

    // 2. Hattın sefer saatlerini ve ilk durağını çek
    const lineInfoResult = await session.run(
        `MATCH (h:Hat {route_id: $routeId})
         OPTIONAL MATCH (h)<-[r:GÜZERGAH_ÜZERINDE {sıra: 0}]-(d:Durak)
         RETURN h.${timesField} AS schedule, d`,
        { routeId }
    );

    if (lineInfoResult.records.length === 0) return null;

    const scheduleStr = lineInfoResult.records[0].get('schedule');
    const firstStop = lineInfoResult.records[0].get('d')?.properties;

    if (!scheduleStr || !firstStop) return null;

    // 3. Bir sonraki uygun seferi bul
    const departureTimes = scheduleStr.split(' ').map(parseTime).filter(t => t !== null);
    if (departureTimes.length === 0) return null;

    // 4. İlk duraktan bineceğin durağa olan mesafeyi ve süreyi hesapla
    const fullShape = await getShapeFor(session, routeId);
    const shapeToBoarding = sliceShape(fullShape, firstStop, boardingStop);
    const distanceToBoarding = calculateShapeDistance(shapeToBoarding);
    const timeToBoarding = distanceToBoarding / 400; // 400 m/dk hız

    // 5. Kullanıcının durağa varış zamanını hesapla
    const walkDuration = walkDistance / 80; // 80m/dk yürüme hızı
    const userArrivalTimeAtStop = desiredDepartureTime + walkDuration;
    
    // 6. Durağa, kullanıcı vardıktan sonra gelecek ilk otobüsü bul
    let bestDeparture = departureTimes.find(depTime => (depTime + timeToBoarding) >= userArrivalTimeAtStop);
    
    // 7. Eğer bugün için uygun sefer bulunamazsa, ertesi günün ilk seferini kontrol et
    if (bestDeparture === undefined) {
        // Bugün için yakalanabilecek bir otobüs kalmamış.
        // Ertesi günün ilk seferini, durağa varış süresini ekleyerek varış zamanı olarak alalım.
        bestDeparture = departureTimes[0];
        if (bestDeparture === undefined) return null; // Takvimde hiç sefer yoksa
    }

    // 8. Durağa varış zamanını ve bekleme süresini hesapla
    const arrivalTimeAtBoardingStop = bestDeparture + timeToBoarding;
    // Bekleme süresi = (Otobüsün durağa varışı) - (Kullanıcının durağa varışı)
    const waitTime = Math.max(0, arrivalTimeAtBoardingStop - userArrivalTimeAtStop);

    return {
        estimatedArrival: formatTime(arrivalTimeAtBoardingStop),
        waitTime: Math.round(waitTime),
    };
};

// YENİ ALGORİTMA: 0 Aktarmalı Rotaları Bul
const findDirectRoutes = async (session, startStops, endStops, departureTime) => {
    const startStopIds = startStops.map(s => s.stop.stop_id);
    const endStopIds = endStops.map(s => s.stop.stop_id);

    const query = `
        // 1. Başlangıç ve bitiş duraklarından geçen ortak hatları bul
        MATCH (startDurak:Durak)-[r1:GÜZERGAH_ÜZERINDE]->(hat:Hat)<-[r2:GÜZERGAH_ÜZERINDE]-(endDurak:Durak)
        WHERE startDurak.stop_id IN $startStopIds 
          AND endDurak.stop_id IN $endStopIds
          // 2. Durakların hat üzerinde doğru sırada olduğundan emin ol (başlangıç bitişten önce gelmeli)
          AND r1.sıra < r2.sıra
        
        // 3. Rota üzerindeki tüm ara durakları topla
        MATCH (hat)<-[r_ara:GÜZERGAH_ÜZERINDE]-(araDurak:Durak)
        WHERE r_ara.sıra >= r1.sıra AND r_ara.sıra <= r2.sıra
        
        WITH startDurak, endDurak, hat, r1.sıra AS startSira, r2.sıra AS endSira, COLLECT({durak: araDurak, sira: r_ara.sıra}) AS araDuraklarData
        
        // 4. Ara durakları sıraya göre diz
        UNWIND araDuraklarData AS data
        WITH startDurak, endDurak, hat, startSira, endSira, data
        ORDER BY data.sira ASC
        WITH startDurak, endDurak, hat, startSira, endSira, COLLECT(data.durak) AS pathStops

        RETURN startDurak, endDurak, hat, pathStops, (endSira - startSira) AS durakSayisi
    `;

    const result = await session.run(query, { startStopIds, endStopIds });
    
    if (result.records.length === 0) {
        return [];
    }

    const allDirectRoutes = [];
    for (const record of result.records) {
        const startDurak = record.get('startDurak').properties;
        const endDurak = record.get('endDurak').properties;
        const hat = record.get('hat').properties;
        const pathStops = record.get('pathStops').map(p => p.properties);
        const durakSayisi = record.get('durakSayisi').toNumber();

        // Rota için yol geometrisini (shape) al ve sadece ilgili kısmı kes
        const fullShape = await getShapeFor(session, hat.route_id);
        const shape = sliceShape(fullShape, startDurak, endDurak);

        // Otobüs güzergahının mesafesini ve süresini hesapla
        const busDistance = calculateShapeDistance(shape);
        const busDuration = busDistance / 400; // Ortalama hız 24km/s (400m/dk) varsayılarak

        // Bu rota için doğru başlangıç ve bitiş yürüme mesafelerini bul
        const initialWalk = startStops.find(s => s.stop.stop_id === startDurak.stop_id);
        const finalWalk = endStops.find(s => s.stop.stop_id === endDurak.stop_id);

        const steps = [];
        // İlk yürüme adımı
        steps.push({ type: 'WALK', from: 'Başlangıç Noktanız', to: startDurak.name, duration: initialWalk.distance / 80, distance: initialWalk.distance });

        // Otobüs adımı
        steps.push({
            type: 'BUS',
            line: hat.route_number,
            from: startDurak.name,
            to: endDurak.name,
            stops: pathStops.map(p => p.name), // Tüm durakların listesi
            shape: shape,
            duration: busDuration,
            distance: busDistance
        });

        // Son yürüme adımı
        steps.push({ type: 'WALK', from: endDurak.name, to: 'Varış Noktanız', duration: finalWalk.distance / 80, distance: finalWalk.distance });

        const arrivalInfo = await getBusArrivalTime(session, hat.route_id, startDurak, departureTime, initialWalk.distance);
        const total_walk_duration = steps.filter(s => s.type === 'WALK').reduce((sum, step) => sum + step.duration, 0);

        // Toplam süreyi hesapla (mesafe bazlı)
        const total_duration = (initialWalk.distance / 80) + (arrivalInfo ? arrivalInfo.waitTime : 0) + busDuration + (finalWalk.distance / 80);

        allDirectRoutes.push({
            total_duration,
            steps,
            arrivalInfo,
            total_walk_duration: Math.round(total_walk_duration),
            unique_path_id: `DIRECT-${hat.route_number}`
        });
    }

    return allDirectRoutes;
};

// YENİ ALGORİTMA: 1 Aktarmalı Rotaları Bul
const findOneTransferRoutes = async (session, startStops, endStops, departureTime) => {
    const startStopIds = startStops.map(s => s.stop.stop_id);
    const endStopIds = endStops.map(s => s.stop.stop_id);
    
    // Aktarma için ek süre (dk) - Bu, algoritmanın aktarmasız rotaları tercih etmesi için bir ceza puanıdır.
    const TRANSFER_PENALTY = 5;

    const query = `
        // 1. Başlangıç durağından geçen bir hat (hat1) bul
        MATCH (startDurak:Durak)-[r1:GÜZERGAH_ÜZERINDE]->(hat1:Hat)
        WHERE startDurak.stop_id IN $startStopIds

        // 2. Bitiş durağından geçen bir hat (hat2) bul (hat1 ile aynı olmamalı)
        MATCH (endDurak:Durak)-[r2:GÜZERGAH_ÜZERINDE]->(hat2:Hat)
        WHERE endDurak.stop_id IN $endStopIds AND hat1 <> hat2

        // 3. Bu iki hattın kesiştiği bir aktarma durağı bul
        MATCH (hat1)<-[r_aktarma1:GÜZERGAH_ÜZERINDE]-(aktarmaDuragi:Durak)-[r_aktarma2:GÜZERGAH_ÜZERINDE]->(hat2)

        // 4. Durak sıralamalarını kontrol et
        // Başlangıç durağı, aktarma durağından önce gelmeli (hat1 üzerinde)
        WHERE r1.sıra < r_aktarma1.sıra
        // Aktarma durağı, bitiş durağından önce gelmeli (hat2 üzerinde)
          AND r_aktarma2.sıra < r2.sıra

        // 5. Rota bilgilerini ve segmentlerini topla
        // İlk bacak (başlangıç -> aktarma)
        MATCH (hat1)<-[r_segment1:GÜZERGAH_ÜZERINDE]-(segment1Durak:Durak)
        WHERE r_segment1.sıra >= r1.sıra AND r_segment1.sıra <= r_aktarma1.sıra
        
        // İkinci bacak (aktarma -> bitiş)
        MATCH (hat2)<-[r_segment2:GÜZERGAH_ÜZERINDE]-(segment2Durak:Durak)
        WHERE r_segment2.sıra >= r_aktarma2.sıra AND r_segment2.sıra <= r2.sıra

        WITH startDurak, endDurak, aktarmaDuragi, hat1, hat2,
             r1.sıra AS startSira1, r_aktarma1.sıra AS endSira1,
             r_aktarma2.sıra AS startSira2, r2.sıra AS endSira2,
             COLLECT(DISTINCT {durak: segment1Durak, sira: r_segment1.sıra}) AS segment1Data,
             COLLECT(DISTINCT {durak: segment2Durak, sira: r_segment2.sıra}) AS segment2Data

        RETURN startDurak, endDurak, aktarmaDuragi, hat1, hat2,
               (endSira1 - startSira1) AS durakSayisi1,
               (endSira2 - startSira2) AS durakSayisi2,
               segment1Data,
               segment2Data
        LIMIT 15 // Olası kombinasyonları sınırla
    `;

    const result = await session.run(query, { startStopIds, endStopIds });
    
    if (result.records.length === 0) {
        return [];
    }
    
    const allTransferRoutes = [];
    for (const record of result.records) {
        const startDurak = record.get('startDurak').properties;
        const endDurak = record.get('endDurak').properties;
        const aktarmaDuragi = record.get('aktarmaDuragi').properties;
        const hat1 = record.get('hat1').properties;
        const hat2 = record.get('hat2').properties;
        
        // Her iki otobüs bacağı için de yol geometrilerini ve mesafelerini hesapla
        const fullShape1 = await getShapeFor(session, hat1.route_id);
        const shape1 = sliceShape(fullShape1, startDurak, aktarmaDuragi);
        const busDistance1 = calculateShapeDistance(shape1);
        const busDuration1 = busDistance1 / 400; // Ortalama hız 24km/s (400m/dk)
        
        const fullShape2 = await getShapeFor(session, hat2.route_id);
        const shape2 = sliceShape(fullShape2, aktarmaDuragi, endDurak);
        const busDistance2 = calculateShapeDistance(shape2);
        const busDuration2 = busDistance2 / 400; // Ortalama hız 24km/s (400m/dk)

        // Segment verilerini al ve sıraya diz
        const segment1Stops = record.get('segment1Data').sort((a,b) => a.sira.toNumber() - b.sira.toNumber()).map(d => d.durak.properties);
        const segment2Stops = record.get('segment2Data').sort((a,b) => a.sira.toNumber() - b.sira.toNumber()).map(d => d.durak.properties);

        const initialWalk = startStops.find(s => s.stop.stop_id === startDurak.stop_id);
        const finalWalk = endStops.find(s => s.stop.stop_id === endDurak.stop_id);
        const initialWalkDuration = initialWalk.distance / 80;
        const finalWalkDuration = finalWalk.distance / 80;

        // 1. İlk otobüs için varış zamanını hesapla
        const arrivalInfo1 = await getBusArrivalTime(session, hat1.route_id, startDurak, departureTime, initialWalk.distance);
        if (!arrivalInfo1) continue; // İlk hatta servis yoksa bu rotayı atla

        // 2. Kullanıcının aktarma durağına varış zamanını hesapla (dakika cinsinden)
        const timeInMinutesAtStartOfJourney = getTimeInMinutesFromDate(departureTime);
        const timeOfArrivalAtTransferStop = timeInMinutesAtStartOfJourney + initialWalkDuration + arrivalInfo1.waitTime + busDuration1;
        
        // Aktarma durağına varış zamanını Date objesine çevir
        const departureTimeForSecondBus = new Date(departureTime);
        departureTimeForSecondBus.setHours(0, 0, 0, 0); // Günü sıfırla
        departureTimeForSecondBus.setMinutes(timeOfArrivalAtTransferStop); // Yeni dakikayı ayarla

        // 3. İkinci otobüs için varış zamanını hesapla (yürüme mesafesi 0)
        const arrivalInfo2 = await getBusArrivalTime(session, hat2.route_id, aktarmaDuragi, departureTimeForSecondBus, 0);
        if (!arrivalInfo2) continue; // İkinci hatta servis yoksa bu rotayı atla

        // 4. Adımları oluştur
        const steps = [
            { type: 'WALK', from: 'Başlangıç Noktanız', to: startDurak.name, duration: initialWalkDuration, distance: initialWalk.distance },
            { type: 'BUS', line: hat1.route_number, from: startDurak.name, to: aktarmaDuragi.name, stops: segment1Stops.map(s => s.name), shape: shape1, duration: busDuration1, distance: busDistance1 },
            { 
                type: 'TRANSFER', 
                text: `${aktarmaDuragi.name} durağında ${hat2.route_number} hattına aktarma yapın.`,
                duration: arrivalInfo2.waitTime, // Gerçek bekleme süresi
                arrivalInfo: arrivalInfo2 // Tahmini biniş bilgisini frontend'e gönder
            },
            { type: 'BUS', line: hat2.route_number, from: aktarmaDuragi.name, to: endDurak.name, stops: segment2Stops.map(s => s.name), shape: shape2, duration: busDuration2, distance: busDistance2 },
            { type: 'WALK', from: endDurak.name, to: 'Varış Noktanız', duration: finalWalkDuration, distance: finalWalk.distance }
        ];

        const total_walk_duration = steps.filter(s => s.type === 'WALK').reduce((sum, step) => sum + step.duration, 0);

        // 5. Toplam süreyi yeniden hesapla
        const total_duration = initialWalkDuration + arrivalInfo1.waitTime + busDuration1 + arrivalInfo2.waitTime + busDuration2 + finalWalkDuration + TRANSFER_PENALTY;

        allTransferRoutes.push({
            total_duration,
            steps,
            arrivalInfo: arrivalInfo1, // Ana varış bilgisi ilk otobüs için
            total_walk_duration: Math.round(total_walk_duration),
            unique_path_id: `TRANSFER-${hat1.route_number}-${hat2.route_number}`
        });
    }
    return allTransferRoutes;
};

// YENİ ALGORİTMA: Rota Adımlarını Hesaplayan ve Birleştiren Ana Fonksiyon
const calculateRouteFromSegments = (startStop, endStop, segments) => {
    // TODO: Veritabanından gelen segmentlere göre adımları (WALK, BUS, TRANSFER) oluşturan mantık yazılacak.
    // Bu fonksiyon, findDirectRoutes ve findOneTransferRoutes tarafından kullanılabilir.
    // Toplam süreyi de hesaplamalı.
    return {
        total_duration: 0,
        steps: [],
        unique_path_id: ''
    };
}

// Rota bulma ana fonksiyonu
exports.findRoute = async (req, res) => {
    const session = neo4j.driver.session();
    const { startLat, startLng, endLat, endLng, departureTime } = req.query;

    if (!startLat || !startLng || !endLat || !endLng) {
        return res.status(400).json({ error: 'Başlangıç ve bitiş koordinatları gereklidir.' });
    }

    // Gelen zamanı Date objesine çevir, yoksa şimdiki zamanı kullan
    const desiredDepartureTime = departureTime ? new Date(departureTime) : new Date();

    try {
        const startStops = await findNearestStops(session, startLat, startLng);
        const endStops = await findNearestStops(session, endLat, endLng);

        if (startStops.length === 0 || endStops.length === 0) {
            return res.status(404).json({ error: 'Başlangıç veya bitiş noktasına yakın durak bulunamadı.' });
        }
        
        const directRoutes = await findDirectRoutes(session, startStops, endStops, desiredDepartureTime);
        const oneTransferRoutes = await findOneTransferRoutes(session, startStops, endStops, desiredDepartureTime);

        let allRoutes = [...directRoutes, ...oneTransferRoutes];

        if (allRoutes.length === 0) {
            return res.status(404).json({ error: 'Bu iki nokta arasında toplu taşıma rotası bulunamadı.' });
        }

        // Rotaları toplam süreye göre sırala
        allRoutes.sort((a, b) => a.total_duration - b.total_duration);
        
        // En kısa süreyi referans al ve mantıksız derecede uzun rotaları filtrele
        const shortestDuration = allRoutes[0].total_duration;
        const filteredRoutes = allRoutes.filter(route => route.total_duration <= shortestDuration * 3);

        // Benzersiz rotaları al (adım dizilimi aynı olanları ele)
        const uniqueRoutes = [];
        const seenPaths = new Set();
        for (const route of filteredRoutes) {
            if (!seenPaths.has(route.unique_path_id)) {
                uniqueRoutes.push(route);
                seenPaths.add(route.unique_path_id);
            }
        }
        
        res.json({ route_options: uniqueRoutes.slice(0, 10) });

    } catch (error) {
        console.error('Rota bulunurken hata:', error);
        res.status(500).json({ error: 'Sunucu hatası: ' + error.message });
    } finally {
        await session.close();
    }
}; 