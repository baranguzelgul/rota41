import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Card, Row, Col, ListGroup, Button, Badge, Spinner, Tabs, Tab, Table, Form } from 'react-bootstrap';
import { MapContainer, TileLayer, Marker, Popup, Polyline, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { hatAPI } from '../../services/api';
import L from 'leaflet';
import { debounce } from 'lodash';
import './HatDetay.scss';  // Modern tasarım için SCSS dosyası

// Leaflet icon sorunu için çözüm
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Duraklar için özel ikonlar
const stopIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const terminalIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const HatDetay = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [hat, setHat] = useState(null);
  const [gidisDuraklar, setGidisDuraklar] = useState([]);
  const [donusDuraklar, setDonusDuraklar] = useState([]);
  const [gidisShape, setGidisShape] = useState([]);
  const [donusShape, setDonusShape] = useState([]);
  const [saatBilgileri, setSaatBilgileri] = useState(null);
  const [activeTab, setActiveTab] = useState('guzergah'); // Varsayılan olarak güzergah ve haritayı göster
  const [guzergahYon, setGuzergahYon] = useState('gidis'); // Güzergah yönü için ayrı state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [aramaMetni, setAramaMetni] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const fetchHatDetay = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Determine corresponding route ID for the other direction
        // If ID ends with 0, its pair ends with 1 and vice versa
        const isPrimaryGidis = id.endsWith('0');
        const otherRouteId = isPrimaryGidis ? 
          id.substring(0, id.length - 1) + '1' : 
          id.substring(0, id.length - 1) + '0';
        
        console.log(`Current route ID: ${id}, Other route ID: ${otherRouteId}`);
        
        // Hat bilgilerini al - current route
        try {
        const hatData = await hatAPI.hatGetir(id);
        setHat(hatData);
          console.log("Current hat data:", hatData);
        } catch (hatErr) {
          console.error("Hat bilgileri alınamadı:", hatErr);
          throw new Error(`Hat bilgileri alınamadı: ${hatErr.response?.data?.hata || hatErr.message}`);
        }
        
        // Set the current direction for the UI based on route ID
        // Adjust guzergahYon state based on the route ID
        setGuzergahYon(isPrimaryGidis ? 'gidis' : 'donus');
              
        // Fetch durak data for both directions regardless of current route
        try {
          const gidisData = await hatAPI.hatGuzergahiniGetir(
            isPrimaryGidis ? id : otherRouteId, 
            'Gidiş'
          );
        setGidisDuraklar(gidisData);
        } catch (gidisErr) {
          console.warn("Gidiş güzergahı durakları alınamadı:", gidisErr);
          setGidisDuraklar([]);
        }
        
        try {
          const donusData = await hatAPI.hatGuzergahiniGetir(
            isPrimaryGidis ? otherRouteId : id, 
            'Dönüş'
          );
        setDonusDuraklar(donusData);
        } catch (donusErr) {
          console.warn("Dönüş güzergahı durakları alınamadı:", donusErr);
          setDonusDuraklar([]);
        }
        
        // For the saat bilgileri (timetables), we need both directions
        try {
          // Fetch current route schedule
          const currentSaatData = await hatAPI.hatSaatBilgileriGetir(id);
          
          try {
            // Also fetch the other direction's schedule
            const otherSaatData = await hatAPI.hatSaatBilgileriGetir(otherRouteId);
            
            // Combine the schedules, with the current route's direction being primary
            // Veritabanından gelen direction bilgilerini kullan
            const combinedSaatData = {
              // Veritabanından gelen direction bilgilerini kullan
              direction_1: currentSaatData?.direction_1 || (isPrimaryGidis ? 'Gidiş' : 'Dönüş'),
              direction_2: otherSaatData?.direction_1 || (isPrimaryGidis ? 'Dönüş' : 'Gidiş'),
              weekday_times: {
                direction_1: currentSaatData?.weekday_times?.direction_1 || [],
                direction_2: otherSaatData?.weekday_times?.direction_1 || []
              },
              saturday_times: {
                direction_1: currentSaatData?.saturday_times?.direction_1 || [],
                direction_2: otherSaatData?.saturday_times?.direction_1 || []
              },
              sunday_times: {
                direction_1: currentSaatData?.sunday_times?.direction_1 || [],
                direction_2: otherSaatData?.sunday_times?.direction_1 || []
              },
              route_short_name_1: currentSaatData?.route_short_name_1 || '',
              route_short_name_2: otherSaatData?.route_short_name_1 || ''
            };
            
            setSaatBilgileri(combinedSaatData);
          } catch (otherSaatErr) {
            console.warn("Diğer yön için saat bilgileri alınamadı:", otherSaatErr);
            setSaatBilgileri(currentSaatData); // Just use current route schedule
          }
        } catch (saatErr) {
          console.warn("Saat bilgileri alınamadı:", saatErr);
          setSaatBilgileri(null);
        }
        
        // Shape verileri for both directions
        try {
          const gidisShapeData = await hatAPI.hatShapeGetir(
            isPrimaryGidis ? id : otherRouteId, 
            'Gidiş'
          );
          setGidisShape(gidisShapeData);
        } catch (shapeErr) {
          console.warn("Gidiş güzergahı shape verileri alınamadı:", shapeErr);
          setGidisShape([]);
        }
        
        try {
          const donusShapeData = await hatAPI.hatShapeGetir(
            isPrimaryGidis ? otherRouteId : id, 
            'Dönüş'
          );
          setDonusShape(donusShapeData);
        } catch (shapeErr) {
          console.warn("Dönüş güzergahı shape verileri alınamadı:", shapeErr);
          setDonusShape([]);
        }
        
        setLoading(false);
      } catch (err) {
        setError(`Hat bilgileri yüklenirken bir hata oluştu: ${err.message}`);
        console.error('Hat detayı hatası:', err);
        setLoading(false);
      }
    };

    fetchHatDetay();
  }, [id]);

  // Otobüs hatlarını arama fonksiyonu
  const searchHatlar = async (searchTerm) => {
    if (searchTerm.length < 1) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    try {
      const results = await hatAPI.hatAra(searchTerm);
      
      // Sadece Gidiş yönündeki hatları filtrele
      const gidisHatlari = results.filter(hat => hat.yön === 'Gidiş');
      
      // Eğer Gidiş yönünde hat yoksa, tüm sonuçlardan her hat numarası için tek bir hat göster
      let filteredResults = gidisHatlari.length > 0 ? gidisHatlari : [];
      
      // Eğer Gidiş yönünde hat yoksa, her hat numarası için tek bir hat göster
      if (filteredResults.length === 0) {
        // Hat numaralarına göre grupla ve her gruptan sadece ilk hatı al
        const routeGroups = {};
        results.forEach(hat => {
          const routeNumber = hat.route_number || hat.route_name;
          if (!routeGroups[routeNumber]) {
            routeGroups[routeNumber] = hat;
          }
        });
        
        filteredResults = Object.values(routeGroups);
      }
      
      setSearchResults(filteredResults);
      setShowResults(true);
    } catch (error) {
      console.error("Hat arama hatası:", error);
    }
  };

  const handleArama = async (e) => {
    const value = e.target.value;
    setAramaMetni(value);

    if (value.trim().length > 0) {
      try {
        const sonuclar = await hatAPI.hatAra(value);
        
        // Sadece Gidiş yönündeki hatları filtrele
        const gidisHatlari = sonuclar.filter(hat => hat.yön === 'Gidiş');
        
        // Eğer Gidiş yönünde hat yoksa, her hat numarası için tek bir hat göster
        let filteredResults = gidisHatlari.length > 0 ? gidisHatlari : [];
        
        if (filteredResults.length === 0) {
          // Hat numaralarına göre grupla ve her gruptan sadece ilk hatı al
          const routeGroups = {};
          sonuclar.forEach(hat => {
            const routeNumber = hat.route_number || hat.route_name;
            if (!routeGroups[routeNumber]) {
              routeGroups[routeNumber] = hat;
            }
          });
          
          filteredResults = Object.values(routeGroups);
        }
        
        setSearchResults(filteredResults);
        setShowResults(true);
      } catch (err) {
        console.error('Hat arama hatası:', err);
        setSearchResults([]);
      }
    } else {
      setSearchResults([]);
      setShowResults(false);
    }
  };

  const handleSelectResult = (hatId) => {
    if (hatId !== id) {
      setLoading(true);
      setError(null);
      setHat(null);
      setGidisDuraklar([]);
      setDonusDuraklar([]);
      setGidisShape([]);
      setDonusShape([]);
      setSaatBilgileri(null);
    }
    setAramaMetni('');
    setSearchResults([]);
    setShowResults(false);
    navigate(`/hatlar/${hatId}`);
  };

  // Click outside to close results
  useEffect(() => {
    const handleClickOutside = () => {
      setShowResults(false);
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  if (loading) {
    return (
      <div className="text-center my-5">
        <Spinner animation="border" role="status" variant="primary">
          <span className="visually-hidden">Yükleniyor...</span>
        </Spinner>
        <p className="mt-2">Hat bilgileri yükleniyor...</p>
      </div>
    );
  }

  if (error || !hat) {
    return (
      <Card className="text-center my-5">
        <Card.Body>
          <Card.Title className="text-danger">Hata</Card.Title>
          <Card.Text>{error || 'Hat bulunamadı.'}</Card.Text>
          <Button as={Link} to="/hatlar" variant="primary">Hat Listesine Dön</Button>
        </Card.Body>
      </Card>
    );
  }

  const getHatStyle = () => {
    let style = {};
    if (hat.route_color) {
      style.backgroundColor = `#${hat.route_color}`;
      // Koyu renkli arka planlarda metin beyaz olsun
      const hexColor = parseInt(hat.route_color, 16);
      const r = (hexColor >> 16) & 255;
      const g = (hexColor >> 8) & 255;
      const b = hexColor & 255;
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      if (brightness < 128) {
        style.color = 'white';
      }
    }
    return style;
  };
  
  // Sıralama fonksiyonu
  const sortDuraksBySequence = (duraklar) => {
    return [...duraklar].sort((a, b) => {
      if (a.sira !== undefined && b.sira !== undefined) return a.sira - b.sira;
      return 0;
    });
  };
  
  // Ensure duraklar are sorted by sequence if available
  const sortedGidisDuraklar = sortDuraksBySequence(gidisDuraklar);
  const sortedDonusDuraklar = sortDuraksBySequence(donusDuraklar);
  const activeDuraklar = guzergahYon === 'gidis' ? sortedGidisDuraklar : sortedDonusDuraklar;
  
  // Harita merkezi için
  const defaultPosition = [40.766666, 29.916668]; // Kocaeli merkez
  let mapCenter = defaultPosition;
  let polylinePositions = [];
  
  // Güzergah için shape verilerini veya durak konumlarını kullan
  const activeShape = guzergahYon === 'gidis' ? gidisShape : donusShape;
  
  // Map safe check
  if (!Array.isArray(activeShape)) {
    console.warn("activeShape is not an array:", activeShape);
  }

  if (Array.isArray(activeShape) && activeShape.length > 0) {
    // Shape verileri varsa onları kullan
    polylinePositions = activeShape
      .filter(point => point && typeof point.lat === 'number' && typeof point.lng === 'number')
      .map(point => [point.lat, point.lng]);
    
    if (polylinePositions.length > 0) {
      // Orta noktayı harita merkezi olarak belirle
      const middleIndex = Math.floor(polylinePositions.length / 2);
      mapCenter = polylinePositions[middleIndex];
    }
  } else if (Array.isArray(activeDuraklar) && activeDuraklar.length > 0) {
    // Shape verisi yoksa durak konumlarını kullan
    const filteredDuraklar = activeDuraklar.filter(durak => 
      durak && durak.lat && durak.lon && 
      !isNaN(parseFloat(durak.lat)) && !isNaN(parseFloat(durak.lon))
    );
    
    polylinePositions = filteredDuraklar.map(durak => [parseFloat(durak.lat), parseFloat(durak.lon)]);
    
    if (polylinePositions.length > 0) {
      // İlk ve son durak arasındaki orta nokta
      const firstDurak = polylinePositions[0];
      const lastDurak = polylinePositions[polylinePositions.length - 1];
      mapCenter = [
        (firstDurak[0] + lastDurak[0]) / 2,
        (firstDurak[1] + lastDurak[1]) / 2
      ];
    }
  }
  
  const polylineOptions = { 
    color: hat.route_color ? `#${hat.route_color}` : '#0066cc', 
    weight: 5 
  };

  // Güzergah listesini ve haritasını birlikte gösteren fonksiyon
  const renderGuzergahListesi = () => {
    // Kullanılacak yön bilgilerini veritabanından gelen direction bilgisiyle belirle
    let gidisLabel = 'Gidiş';
    let donusLabel = 'Dönüş';
    
    // Eğer saatBilgileri varsa, veritabanındaki direction bilgisini kullan
    if (saatBilgileri && saatBilgileri.direction_1) {
      gidisLabel = saatBilgileri.direction_1;
      donusLabel = saatBilgileri.direction_2 || 'Dönüş';
    }
    
    const hasGidisDuraklar = Array.isArray(sortedGidisDuraklar) && sortedGidisDuraklar.length > 0;
    const hasDonusDuraklar = Array.isArray(sortedDonusDuraklar) && sortedDonusDuraklar.length > 0;
    
    const currentLabel = guzergahYon === 'gidis' ? gidisLabel : donusLabel;
    const currentDurakCount = guzergahYon === 'gidis' ? 
      (hasGidisDuraklar ? sortedGidisDuraklar.length : 0) : 
      (hasDonusDuraklar ? sortedDonusDuraklar.length : 0);
    
    // Only show map if we have valid positions
    const hasValidPositions = Array.isArray(polylinePositions) && polylinePositions.length > 0;
    const hasValidDuraklar = Array.isArray(activeDuraklar) && activeDuraklar.length > 0;
    
    return (
      <div className="guzergah-container">
        <div className="direction-tabs">
          <Tabs 
            activeKey={guzergahYon} 
            onSelect={(key) => setGuzergahYon(key)} 
            className="direction-nav"
          >
            <Tab eventKey="gidis" title={
              <div className="direction-tab">
                <i className="bi bi-arrow-right-circle"></i>
                <span>{gidisLabel}</span>
              </div>
            }>
            </Tab>
            <Tab eventKey="donus" title={
              <div className="direction-tab">
                <i className="bi bi-arrow-left-circle"></i>
                <span>{donusLabel}</span>
              </div>
            }>
            </Tab>
          </Tabs>
        </div>

        <div className="guzergah-content">
          <Row>
            {/* Durak Listesi - Sol Kolon */}
            <Col md={4} className="mb-4 mb-md-0">
              <div className="section-header">
                <div className="title-with-counter">
                  <h5>Güzergah Bilgisi</h5>
                  <div className="durak-counter">
                    <i className="bi bi-geo-alt-fill"></i>
                    <span>{currentDurakCount} Durak</span>
                  </div>
                </div>
              </div>
              <div className="durak-list-container">
                {Array.isArray(activeDuraklar) && activeDuraklar.length > 0 ? (
                  <ListGroup variant="flush" className="custom-list-group">
                    {activeDuraklar.map((durak, index) => (
                      <ListGroup.Item
                        key={durak?.stop_id || `durak-${index}`}
                        as={Link}
                        to={durak?.stop_id ? `/duraklar/${durak.stop_id}` : '#'}
                        action
                        className="custom-list-item"
                      >
                        <div className="durak-info">
                          <div className="durak-number">{durak?.sira !== undefined ? durak.sira + 1 : index + 1}</div>
                          <div className="durak-details">
                            <div className="durak-name">{durak?.name || `Durak ${index + 1}`}</div>
                            {durak?.stop_desc && <div className="durak-desc">{durak.stop_desc}</div>}
                          </div>
                        </div>
                      </ListGroup.Item>
                    ))}
                  </ListGroup>
                ) : (
                  <div className="no-data">
                    <i className="bi bi-exclamation-triangle"></i>
                    <p>Bu yönde güzergah bilgisi bulunamadı.</p>
                  </div>
                )}
              </div>
            </Col>
            
            {/* Harita - Sağ Kolon */}
            <Col md={8}>
              <div className="section-header">
                <h5>Güzergah Haritası</h5>
                <Badge bg="primary" className="direction-badge-map">{currentLabel}</Badge>
              </div>
              <div className="map-wrapper">
                {hasValidPositions || hasValidDuraklar ? (
                  <MapContainer
                    center={mapCenter}
                    zoom={13}
                    className="custom-map"
                  >
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                    
                    {hasValidPositions && (
                      <Polyline positions={polylinePositions} {...polylineOptions} />
                    )}
                    
                    {/* Durak noktaları */}
                    {hasValidDuraklar && activeDuraklar
                      .filter(durak => durak && durak.lat && durak.lon && 
                             !isNaN(parseFloat(durak.lat)) && !isNaN(parseFloat(durak.lon)))
                      .map((durak, index) => (
                        <Marker 
                          key={durak.stop_id || `durak-${index}`} 
                          position={[parseFloat(durak.lat), parseFloat(durak.lon)]}
                          icon={index === 0 || index === activeDuraklar.length - 1 ? terminalIcon : stopIcon}
                        >
                          <Popup className="custom-popup">
                            <div className="popup-content">
                              <div className="popup-header">{durak.name || `Durak ${index + 1}`}</div>
                              <div className="popup-details">
                                <div>Durak No: {durak.sira !== undefined ? durak.sira + 1 : index + 1}</div>
                                <div className="popup-direction"><strong>{currentLabel}</strong> Hattı</div>
                                <Link to={`/duraklar/${durak.stop_id}`} className="popup-link">
                                  <i className="bi bi-info-circle"></i> Durak Detayı
                                </Link>
                              </div>
                            </div>
                          </Popup>
                        </Marker>
                      ))
                    }
                    <ZoomControl position="topright" />
                  </MapContainer>
                ) : (
                  <div className="no-data">
                    <i className="bi bi-map-fill"></i>
                    <p>Bu hat için harita verisi bulunamadı.</p>
                  </div>
                )}
              </div>
            </Col>
          </Row>
        </div>
      </div>
    );
  };

  // Yazdırma fonksiyonu
  const handlePrint = () => {
    // Yazdırma için yeni bir pencere aç
    const printWindow = window.open('', '_blank', 'height=600,width=800');
    
    // Hat bilgisi ve stil tanımları
    const routeColor = hat.route_color ? `#${hat.route_color}` : '#0066cc';
    const routeTextColor = getHatStyle().color || 'black';
    
    // Direction labels
    let direction1Label = saatBilgileri?.direction_1 || 'Gidiş';
    let direction2Label = saatBilgileri?.direction_2 || 'Dönüş';
    let route_short_name_1 = saatBilgileri?.route_short_name_1 || '';
    let route_short_name_2 = saatBilgileri?.route_short_name_2 || '';
    
    // Tam başlıklar
    const fullDirection1Label = route_short_name_1 ? `${route_short_name_1} - ${direction1Label}` : direction1Label;
    const fullDirection2Label = route_short_name_2 ? `${route_short_name_2} - ${direction2Label}` : direction2Label;
    
    // Saat bilgilerini al
    const gidisWeekdayTimes = saatBilgileri?.weekday_times?.direction_1 || [];
    const gidisSaturdayTimes = saatBilgileri?.saturday_times?.direction_1 || [];
    const gidisSundayTimes = saatBilgileri?.sunday_times?.direction_1 || [];
    
    const donusWeekdayTimes = saatBilgileri?.weekday_times?.direction_2 || [];
    const donusSaturdayTimes = saatBilgileri?.saturday_times?.direction_2 || [];
    const donusSundayTimes = saatBilgileri?.sunday_times?.direction_2 || [];
    
    // Fallback saat bilgileri
    const parseTimesFromString = (timeStr) => {
      try {
        if (typeof timeStr === 'string' && timeStr.trim() !== '') {
          return timeStr.trim().split(/\s+/);
        }
        return [];
      } catch (err) {
        console.error("Error parsing time string:", err);
        return [];
      }
    };
    
    const fallbackGidisWeekdayTimes = gidisWeekdayTimes.length === 0 && hat.weekday_times ? 
      parseTimesFromString(hat.weekday_times) : gidisWeekdayTimes;
    
    const fallbackGidisSaturdayTimes = gidisSaturdayTimes.length === 0 && hat.saturday_times ? 
      parseTimesFromString(hat.saturday_times) : gidisSaturdayTimes;
    
    const fallbackGidisSundayTimes = gidisSundayTimes.length === 0 && hat.sunday_times ? 
      parseTimesFromString(hat.sunday_times) : gidisSundayTimes;
    
    // Tablo oluşturma fonksiyonu
    const createScheduleTable = (weekdayTimes, saturdayTimes, sundayTimes) => {
      const maxLength = Math.max(
        weekdayTimes.length,
        saturdayTimes.length,
        sundayTimes.length
      );
      
      let tableRows = '';
      for (let i = 0; i < maxLength; i++) {
        tableRows += `
          <tr>
            <td style="text-align: center; padding: 8px; border: 1px solid #ddd;">${i + 1}</td>
            <td style="padding: 8px; border: 1px solid #ddd; ${i < weekdayTimes.length ? '' : 'color: #ccc;'}">${i < weekdayTimes.length ? weekdayTimes[i] : '-'}</td>
            <td style="padding: 8px; border: 1px solid #ddd; ${i < saturdayTimes.length ? '' : 'color: #ccc;'}">${i < saturdayTimes.length ? saturdayTimes[i] : '-'}</td>
            <td style="padding: 8px; border: 1px solid #ddd; ${i < sundayTimes.length ? '' : 'color: #ccc;'}">${i < sundayTimes.length ? sundayTimes[i] : '-'}</td>
          </tr>
        `;
      }
      
      return `
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
          <thead>
            <tr style="background-color: #f8f9fa;">
              <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">#</th>
              <th style="padding: 10px; border: 1px solid #ddd;">Hafta İçi</th>
              <th style="padding: 10px; border: 1px solid #ddd;">Cumartesi</th>
              <th style="padding: 10px; border: 1px solid #ddd;">Pazar</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      `;
    };
    
    // Notlar için HTML
    let notesHtml = '';
    if (saatBilgileri?.notes && Array.isArray(saatBilgileri.notes) && saatBilgileri.notes.length > 0) {
      let notesRows = '';
      saatBilgileri.notes.forEach(note => {
        const colorCode = note.color || '';
        let backgroundColor = '#FFFFFF';
        
        if (colorCode.match(/^[0-9A-F]{6}$/i)) {
          backgroundColor = `#${colorCode}`;
        }
        
        notesRows += `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd; width: 60px; text-align: center;">
              ${colorCode ? `<div style="width: 20px; height: 20px; background-color: ${backgroundColor}; display: inline-block; border: 1px solid #ddd;"></div>` : ''}
            </td>
            <td style="padding: 8px; border: 1px solid #ddd;">${note.description}</td>
          </tr>
        `;
      });
      
      notesHtml = `
        <div style="margin-top: 30px;">
          <h4 style="font-size: 16px; margin-bottom: 10px;">Notlar:</h4>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="background-color: #f8f9fa;">
                <th style="padding: 8px; border: 1px solid #ddd;">Renk</th>
                <th style="padding: 8px; border: 1px solid #ddd;">Açıklama</th>
              </tr>
            </thead>
            <tbody>
              ${notesRows}
            </tbody>
          </table>
        </div>
      `;
    }
    
    // Yazdırma sayfası HTML'i
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${hat.route_number || ''} ${hat.route_name || ''} - Saat Bilgileri</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .header { display: flex; align-items: center; margin-bottom: 20px; }
          .route-number { 
            background-color: ${routeColor}; 
            color: ${routeTextColor}; 
            padding: 8px 16px; 
            border-radius: 4px; 
            font-size: 20px; 
            font-weight: bold; 
            margin-right: 15px;
          }
          h1 { margin: 0; font-size: 24px; }
          h2 { font-size: 20px; margin-top: 30px; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px; }
          .footer { margin-top: 30px; font-size: 12px; color: #666; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="route-number">${hat.route_number || hat.route_name}</div>
          <h1>${hat.route_name}</h1>
        </div>
        
        <h2>${fullDirection1Label} Saatleri</h2>
        ${createScheduleTable(fallbackGidisWeekdayTimes, fallbackGidisSaturdayTimes, fallbackGidisSundayTimes)}
        
        <h2>${fullDirection2Label} Saatleri</h2>
        ${createScheduleTable(donusWeekdayTimes, donusSaturdayTimes, donusSundayTimes)}
        
        ${notesHtml}
        
        <div class="footer">
          <p>Kocaeli Büyükşehir Belediyesi Otobüs Hat Saatleri - ${new Date().toLocaleDateString('tr-TR')}</p>
        </div>
        
        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `;
    
    // İçeriği yazdırma penceresine yaz ve yazdır
    printWindow.document.open();
    printWindow.document.write(printContent);
    printWindow.document.close();
  };

  // Saat bilgilerini gösterme fonksiyonu
  const renderSaatTablosu = () => {
    if (!saatBilgileri) return null;
    
    // Saatleri parse ederek doğru formatta gösterelim
    const parseScheduleTimes = (timesObj, directionKey) => {
      if (!timesObj || !timesObj[directionKey] || !Array.isArray(timesObj[directionKey])) {
        return [];
      }
      return timesObj[directionKey];
    };
    
    // Parse the times from string if they're not already an array
    const parseTimesFromString = (timeStr) => {
      try {
        if (typeof timeStr === 'string' && timeStr.trim() !== '') {
          return timeStr.trim().split(/\s+/);
        }
        return [];
      } catch (err) {
        console.error("Error parsing time string:", err);
        return [];
      }
    };
    
    // Direction labels based on database information (schedules.txt'den alınan veriler)
    let direction1Label = 'Gidiş';
    let direction2Label = 'Dönüş';
    
    let route_short_name_1 = '';
    let route_short_name_2 = '';
    
    // Eğer saat bilgisinde direction bilgisi varsa onları kullanıyoruz
    if (saatBilgileri.direction_1) {
      direction1Label = saatBilgileri.direction_1;
    }
    
    if (saatBilgileri.direction_2) {
      direction2Label = saatBilgileri.direction_2;
    }
    
    // Eğer saat bilgisinde route_short_name varsa kullanıyoruz
    if (saatBilgileri.route_short_name_1) {
      route_short_name_1 = saatBilgileri.route_short_name_1;
    }
    
    if (saatBilgileri.route_short_name_2) {
      route_short_name_2 = saatBilgileri.route_short_name_2;
    }
    
    // Eğer direction bilgisi yoksa veya boşsa, route_id'ye göre varsayılan değerleri kullanıyoruz
    if (!direction1Label || direction1Label.trim() === '') {
      direction1Label = hat && hat.route_id && hat.route_id.endsWith('0') ? 'Gidiş' : 'Dönüş';
    }
    
    if (!direction2Label || direction2Label.trim() === '') {
      direction2Label = hat && hat.route_id && hat.route_id.endsWith('0') ? 'Dönüş' : 'Gidiş';
    }
    
    // Hat numarasını ekleyerek tam başlık oluştur
    const fullDirection1Label = route_short_name_1 ? `${route_short_name_1} - ${direction1Label}` : direction1Label;
    const fullDirection2Label = route_short_name_2 ? `${route_short_name_2} - ${direction2Label}` : direction2Label;
    
    // Get times for both directions
    const gidisWeekdayTimes = parseScheduleTimes(saatBilgileri.weekday_times, 'direction_1');
    const gidisSaturdayTimes = parseScheduleTimes(saatBilgileri.saturday_times, 'direction_1');
    const gidisSundayTimes = parseScheduleTimes(saatBilgileri.sunday_times, 'direction_1');
    
    const donusWeekdayTimes = parseScheduleTimes(saatBilgileri.weekday_times, 'direction_2');
    const donusSaturdayTimes = parseScheduleTimes(saatBilgileri.saturday_times, 'direction_2');
    const donusSundayTimes = parseScheduleTimes(saatBilgileri.sunday_times, 'direction_2');
    
    // Use hat properties as fallback if needed
    const fallbackGidisWeekdayTimes = gidisWeekdayTimes.length === 0 && hat.weekday_times ? 
      parseTimesFromString(hat.weekday_times) : gidisWeekdayTimes;
    
    const fallbackGidisSaturdayTimes = gidisSaturdayTimes.length === 0 && hat.saturday_times ? 
      parseTimesFromString(hat.saturday_times) : gidisSaturdayTimes;
    
    const fallbackGidisSundayTimes = gidisSundayTimes.length === 0 && hat.sunday_times ? 
      parseTimesFromString(hat.sunday_times) : gidisSundayTimes;
    
    // Tüm günler için tek bir tablo oluşturan fonksiyon
    const renderCombinedScheduleTable = (weekdayTimes, saturdayTimes, sundayTimes) => {
      // En uzun dizi kaç eleman içeriyor (her gün için maksimum saat sayısını bulalım)
      const maxLength = Math.max(
        weekdayTimes.length,
        saturdayTimes.length,
        sundayTimes.length
      );
      
      return (
        <div className="schedule-table-container">
          <Table striped bordered responsive className="schedule-table">
            <thead>
              <tr>
                <th className="column-sira">#</th>
                <th className="column-weekday">
                  <i className="bi bi-calendar-week"></i> Hafta İçi
                </th>
                <th className="column-saturday">
                  <i className="bi bi-calendar-event"></i> Cumartesi
                </th>
                <th className="column-sunday">
                  <i className="bi bi-calendar-check"></i> Pazar
                </th>
                    </tr>
                  </thead>
                  <tbody>
              {Array.from({ length: maxLength }).map((_, index) => (
              <tr key={index}>
                  <td className="text-center">{index + 1}</td>
                  <td className={index < weekdayTimes.length ? 'has-time' : 'no-time'}>
                    {index < weekdayTimes.length ? weekdayTimes[index] : '-'}
                  </td>
                  <td className={index < saturdayTimes.length ? 'has-time' : 'no-time'}>
                    {index < saturdayTimes.length ? saturdayTimes[index] : '-'}
                  </td>
                  <td className={index < sundayTimes.length ? 'has-time' : 'no-time'}>
                    {index < sundayTimes.length ? sundayTimes[index] : '-'}
                  </td>
              </tr>
              ))}
        </tbody>
      </Table>
        </div>
    );
    };
    
    const renderNotes = () => {
      if (!saatBilgileri.notes || !Array.isArray(saatBilgileri.notes) || saatBilgileri.notes.length === 0) {
        return null;
      }
      
      return (
        <div className="schedule-notes">
          <h6 className="notes-title">
            <i className="bi bi-info-circle"></i> Notlar:
          </h6>
          <Table bordered className="notes-table">
            <thead>
              <tr>
                <th className="column-color">Renk</th>
                <th className="column-description">Açıklama</th>
                  </tr>
                </thead>
                <tbody>
              {saatBilgileri.notes.map((note, index) => {
                const colorCode = note.color || '';
                let backgroundColor = '#FFFFFF';
                
                // Try to parse the color code
                      try {
                        if (colorCode.match(/^[0-9A-F]{6}$/i)) {
                    // Hex color code
                          backgroundColor = `#${colorCode}`;
                        } else if (colorCode.toLowerCase() === 'fff' || colorCode.toLowerCase() === 'ffffff') {
                          backgroundColor = '#FFFFFF';
                        }
                      } catch (e) {
                        console.error('Renk kodu işlenirken hata oluştu:', e);
                      }
                      
                      return (
                        <tr key={index}>
                    <td className="color-cell">
                      {colorCode ? (
                            <div 
                          className="color-box"
                          style={{ backgroundColor }}
                            ></div>
                      ) : null}
                          </td>
                    <td className="description-cell">{note.description}</td>
                        </tr>
                      );
              })}
                </tbody>
              </Table>
            </div>
      );
    };
    
    return (
      <div className="schedule-container">
        <div className="schedule-tabs">
          <Tabs
            activeKey={guzergahYon}
            onSelect={(key) => setGuzergahYon(key)}
            className="direction-tabs"
          >
            <Tab 
              eventKey="gidis" 
              title={
                <div className="direction-tab-title">
                  <i className="bi bi-arrow-right-circle"></i>
                  <span>{fullDirection1Label}</span>
                </div>
              }
            >
              <div className="schedule-content">
                <div className="schedule-header">
                  <h5>{fullDirection1Label} Saatleri</h5>
                  <Button 
                    variant="outline-secondary" 
                    size="sm" 
                    className="print-button"
                    onClick={handlePrint}
                  >
                    <i className="bi bi-printer"></i> Yazdır
                  </Button>
                </div>
                {renderCombinedScheduleTable(fallbackGidisWeekdayTimes, fallbackGidisSaturdayTimes, fallbackGidisSundayTimes)}
              </div>
            </Tab>
            
            <Tab 
              eventKey="donus" 
              title={
                <div className="direction-tab-title">
                  <i className="bi bi-arrow-left-circle"></i>
                  <span>{fullDirection2Label}</span>
                </div>
              }
            >
              <div className="schedule-content">
                <div className="schedule-header">
                  <h5>{fullDirection2Label} Saatleri</h5>
                  <Button 
                    variant="outline-secondary" 
                    size="sm" 
                    className="print-button"
                    onClick={handlePrint}
                  >
                    <i className="bi bi-printer"></i> Yazdır
                  </Button>
                </div>
                {renderCombinedScheduleTable(donusWeekdayTimes, donusSaturdayTimes, donusSundayTimes)}
              </div>
            </Tab>
          </Tabs>
        </div>
          
          {/* Notes section */}
          {renderNotes()}
      </div>
    );
  };
    
    return (
    <div className="hat-detay-container">
      <div className="hat-header">
        <div className="hat-title">
          <div className="hat-number" style={getHatStyle()}>
            {hat.route_number || hat.route_name}
            </div>
          <h2 className="hat-name">{hat.route_name}</h2>
              </div>
        <Button as={Link} to="/hatlar" variant="outline-primary" className="back-button">
          <i className="bi bi-arrow-left"></i> Hat Listesine Dön
        </Button>
      </div>
      
      <div className="search-container">
        <div className="search-box">
          <i className="bi bi-search search-icon"></i>
        <Form.Control
          type="text"
          placeholder="Hat numarası veya isim ile ara..."
          value={aramaMetni}
          onChange={handleArama}
          onClick={(e) => {
            e.stopPropagation();
            if (searchResults.length > 0) setShowResults(true);
          }}
            className="search-input"
        />
        </div>
        
        {showResults && searchResults.length > 0 && (
          <div className="search-results">
            {searchResults.map(result => (
              <div 
                key={result.route_id}
                className="search-result-item"
                onClick={() => handleSelectResult(result.route_id)}
              >
                <span className="route-badge" style={{
                  backgroundColor: result.route_color ? `#${result.route_color}` : '#ccc',
                  color: result.route_color ? (parseInt(result.route_color, 16) > 0x7fffff ? 'black' : 'white') : 'black',
                }}>
                  {result.route_number || result.route_name}
                </span>
                <span className="route-name">{result.route_name || result.route_long_name || ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="content-tabs">
          <Tabs
            activeKey={activeTab}
        onSelect={key => setActiveTab(key)}
          className="modern-tabs"
          >
          <Tab eventKey="guzergah" title={<><i className="bi bi-map"></i> Güzergah ve Harita</>}>
            {renderGuzergahListesi()}
          </Tab>
          <Tab eventKey="saat" title={<><i className="bi bi-clock"></i> Saat Bilgileri</>}>
          {saatBilgileri ? renderSaatTablosu() : 
              <Card className="no-data-card">
              <Card.Body>
                  <div className="no-data-message">
                    <i className="bi bi-exclamation-circle"></i>
                    <p>Saat bilgileri bulunamadı.</p>
                  </div>
              </Card.Body>
            </Card>
          }
            </Tab>
          </Tabs>
      </div>
    </div>
  );
};

export default HatDetay; 