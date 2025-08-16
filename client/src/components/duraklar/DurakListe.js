import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import { Form, Button, InputGroup, ListGroup, Spinner, Alert, Card, CloseButton } from 'react-bootstrap';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { durakAPI } from '../../services/api';
import './DurakListe.scss';

// Leaflet'in varsayılan ikon sorununu düzeltmek için
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

const defaultStopIcon = L.icon({
    iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
    iconUrl: require('leaflet/dist/images/marker-icon.png'),
    shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const selectedStopIcon = new L.DivIcon({
    className: 'selected-stop-div-icon',
    html: `<span class="marker-pin"></span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -35]
});

const userIcon = new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png', // Basit bir kullanıcı konumu ikonu
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40]
});

const MAX_VISIBLE_WIDTH_FOR_STOPS = 3000; // Durakları göstermek için maks. görünür alan genişliği (metre)

// MapEvents bileşenini DurakListe'nin dışına taşıyoruz.
// Bu, her render'da yeniden oluşturulmasını engeller ve sonsuz döngüyü kırar.
const MapEvents = ({ onViewportChange }) => {
  const map = useMap();
  const moveTimeout = useRef(null);

  // Harita ilk yüklendiğinde ve viewport değişim fonksiyonu değiştiğinde çalışır.
  useEffect(() => {
    if (map) {
      onViewportChange(map);
    }
  }, [map, onViewportChange]);

  useMapEvents({
    moveend: () => {
      // Debounce: Kullanıcı haritayı hareket ettirmeyi bitirdikten sonra bekle
      clearTimeout(moveTimeout.current);
      moveTimeout.current = setTimeout(() => {
        onViewportChange(map);
      }, 300);
    },
  });

  return null;
};

const DurakListe = () => {
  const [position, setPosition] = useState([40.7663, 29.9168]); // Başlangıç konumu: Kocaeli
  const [userPosition, setUserPosition] = useState(null);
  const [visibleStops, setVisibleStops] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isFindingPosition, setIsFindingPosition] = useState(false);
  const [error, setError] = useState(null);
  const [zoomMessage, setZoomMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedStop, setSelectedStop] = useState(null);
  const [gecenHatlar, setGecenHatlar] = useState([]);
  const [isStopInfoLoading, setIsStopInfoLoading] = useState(false);
  const [yaklasanHatlar, setYaklasanHatlar] = useState([]);
  const [isYaklasanHatlarLoading, setIsYaklasanHatlarLoading] = useState(false);
  const mapRef = useRef(null);
  const searchWrapperRef = useRef(null);
  const isFetchingStops = useRef(false);
  const lastFetchedBounds = useRef(null); // Son sorgulanan harita alanını saklamak için

  useEffect(() => {
    // Dışarıya tıklandığında önerileri kapat
    const handleClickOutside = (event) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(event.target)) {
        setSuggestions([]);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [searchWrapperRef]);

  const fetchStopDetails = async (stop) => {
    setSelectedStop(stop);
    
    // Geçen hatlar yükleniyor
    setIsStopInfoLoading(true);
    setGecenHatlar([]);
    durakAPI.durakHatlariniGetir(stop.stop_id)
      .then(hatlar => setGecenHatlar(hatlar))
      .catch(error => console.error("Duraktan geçen hatlar alınamadı", error))
      .finally(() => setIsStopInfoLoading(false));

    // Yaklaşan hatlar yükleniyor
    setIsYaklasanHatlarLoading(true);
    setYaklasanHatlar([]);
    durakAPI.getYaklasanHatlar(stop.stop_id)
      .then(hatlar => setYaklasanHatlar(hatlar))
      .catch(error => console.error("Yaklaşan hatlar alınamadı", error))
      .finally(() => setIsYaklasanHatlarLoading(false));
  };
  
  const closeStopInfoPanel = () => {
    setSelectedStop(null);
    setGecenHatlar([]);
    setYaklasanHatlar([]);
  }

  const handleViewportChange = useCallback(async (map) => {
    if (isFetchingStops.current) {
        return; // Zaten bir istek devam ediyorsa yenisini başlatma
    }

    const bounds = map.getBounds();

    // Harita alanı bir önceki başarılı sorgudan beri değişmediyse tekrar sorgulama
    if (lastFetchedBounds.current && lastFetchedBounds.current.equals(bounds)) {
      return;
    }

    const visibleWidth = bounds.getSouthWest().distanceTo(bounds.getSouthEast());

    if (visibleWidth > MAX_VISIBLE_WIDTH_FOR_STOPS) {
      setVisibleStops([]);
      setZoomMessage('Durakları görmek için haritaya yakınlaşın.');
      setError(null); // Uzaklaşma bir hata durumu değil
      lastFetchedBounds.current = null; // Yakınlaştırınca tekrar sorgu yapabilmek için sıfırla
      return;
    }

    setZoomMessage('');
    setLoading(true);
    setError(null);
    isFetchingStops.current = true;

    try {
      const center = map.getCenter();
      const maxDistance = visibleWidth / 2;
      const stops = await durakAPI.getYakinDuraklar(center.lat, center.lng, maxDistance);
      setVisibleStops(stops);
      lastFetchedBounds.current = bounds; // Başarılı sorgudan sonra harita alanını kaydet
    } catch (err) {
      console.error("Duraklar getirilemedi:", err);
      // Sadece gerçekten bir hata varsa durakları temizle ve hata göster
      setVisibleStops([]);
      setError('Harita alanındaki duraklar getirilemedi.');
    } finally {
      setLoading(false);
      isFetchingStops.current = false;
    }
  }, []);

  const findMyPosition = () => {
    setIsFindingPosition(true);
    setError(null);
    setSuggestions([]);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          const userPos = [latitude, longitude];
          setUserPosition(userPos);
          
          mapRef.current.flyTo(userPos, 16);
          // flyTo'nun tetikleyeceği moveend, durakları yükleyecektir.
          // Biz sadece konum bulma spinner'ını kapatıyoruz.
          setIsFindingPosition(false);
        },
        (err) => {
          setError('Konum bilgisi alınamadı. Lütfen tarayıcı izinlerinizi kontrol edin.');
          setIsFindingPosition(false);
        }
      );
    } else {
      setError('Tarayıcınız konum servisini desteklemiyor.');
      setIsFindingPosition(false);
    }
  };

  const handleInputChange = async (e) => {
    const value = e.target.value;
    setSearchTerm(value);

    if (value.length > 2) {
      try {
        const results = await durakAPI.durakAra(value);
        setSuggestions(results);
      } catch (err) {
        console.error("Arama önerileri alınamadı:", err);
        setSuggestions([]);
      }
    } else {
      setSuggestions([]);
      // Arama terimi temizlenince seçimi de temizle
      if (selectedStop) {
        closeStopInfoPanel();
      }
    }
  };

  const handleSuggestionClick = (stop) => {
    setSearchTerm(stop.name);
    fetchStopDetails(stop);
    setSuggestions([]);
    
    if (mapRef.current) {
      mapRef.current.flyTo([parseFloat(stop.lat), parseFloat(stop.lon)], 16, {
          animate: true,
          duration: 1
      });
      // flyTo moveend'i tetikleyecek, bu da handleViewportChange'i çağıracak.
      // Bu sayede sadece seçilen durak değil, etrafındakiler de gelecek.
      // Sadece seçileni göstermek istersek: setVisibleStops([stop]); 
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setLoading(true);
    setSuggestions([]);
    setError(null); // Arama öncesi hatayı temizle
    closeStopInfoPanel(); // Yeni arama öncesi eski paneli kapat

    try {
      const results = await durakAPI.durakAra(searchTerm);
      
      if (results.length > 0) {
        const firstResult = results[0];
        fetchStopDetails(firstResult); // İlk sonucu seçili olarak ayarla ve detayları getir
        mapRef.current.flyTo([parseFloat(firstResult.lat), parseFloat(firstResult.lon)], 16);
        // flyTo'nun tetikleyeceği moveend, durakları yükleyecektir.
      } else {
        setVisibleStops([]); // Sonuç bulunamadıysa mevcut durakları temizle
      }
    } catch (err) {
      setError('Arama sırasında bir hata oluştu.');
      setVisibleStops([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="durak-liste-page">
      <div ref={searchWrapperRef} className="search-bar-wrapper">
        <Form onSubmit={handleSearch}>
          <InputGroup>
            <Form.Control
              placeholder="Durak arayın..."
              value={searchTerm}
              onChange={handleInputChange}
              autoComplete="off"
            />
            <Button type="submit" variant="primary">
              <i className="bi bi-search"></i>
            </Button>
            <Button variant="info" onClick={findMyPosition} disabled={loading || isFindingPosition}>
              {isFindingPosition ? <Spinner as="span" animation="border" size="sm" /> : <i className="bi bi-geo-alt-fill"></i>}
            </Button>
          </InputGroup>
        </Form>
        {suggestions.length > 0 && (
          <ListGroup className="search-suggestions">
            {suggestions.map(stop => (
              <ListGroup.Item 
                key={stop.stop_id}
                action
                onClick={() => handleSuggestionClick(stop)}
              >
                {stop.name} <span className="text-muted">({stop.stop_id})</span>
              </ListGroup.Item>
            ))}
          </ListGroup>
        )}
        {error && <Alert variant="danger" className="mt-2">{error}</Alert>}
      </div>

      <Card className={`stop-info-panel ${selectedStop ? 'show' : ''}`}>
          {selectedStop && (
            <>
              <Card.Header>
                  <div className="d-flex justify-content-between align-items-center">
                      <Card.Title as="h5" className="mb-0">Durak Detayları</Card.Title>
                      <CloseButton onClick={closeStopInfoPanel} />
                  </div>
              </Card.Header>
              <Card.Body>
                  <div className="mb-3">
                    <h6 className="stop-name">{selectedStop.name}</h6>
                    <p className="stop-id text-muted">Durak Kodu: {selectedStop.stop_id}</p>
                  </div>
                  
                  {/* Yaklaşan Hatlar Bölümü */}
                  <div className="mb-3">
                    <h6><i className="bi bi-clock-history me-2"></i>Durağa Yaklaşan Hatlar</h6>
                    {isYaklasanHatlarLoading ? (
                      <div className="text-center my-3">
                        <Spinner animation="border" size="sm" />
                        <span className="ms-2">Hesaplanıyor...</span>
                      </div>
                    ) : yaklasanHatlar.length > 0 ? (
                      <ListGroup variant="flush" className="yaklasan-hatlar-list">
                        {yaklasanHatlar.map(hat => (
                          <ListGroup.Item key={hat.route_id} className="d-flex justify-content-between align-items-center">
                            <div>
                              <span className="hat-no-badge me-2">{hat.hat_no}</span>
                              <span className="hat-adi">{hat.hat_adi}</span>
                            </div>
                            <div className="text-end">
                              <span className="fw-bold">{hat.tahmini_varis}</span>
                              <small className="d-block text-muted">{hat.kalan_sure > 0 ? `${hat.kalan_sure} dk` : 'Şimdi'}</small>
                            </div>
                          </ListGroup.Item>
                        ))}
                      </ListGroup>
                    ) : (
                      <p className="text-muted small">Şu an için yaklaşan hat bulunmuyor.</p>
                    )}
                  </div>
                  
                  <hr />

                  {/* Geçen Hatlar Bölümü */}
                  <h6><i className="bi bi-sign-turn-right me-2"></i>Bu Duraktan Geçen Hatlar</h6>
                  {isStopInfoLoading ? (
                    <div className="text-center my-3">
                      <Spinner animation="border" size="sm" />
                      <span className="ms-2">Yükleniyor...</span>
                      </div>
                  ) : gecenHatlar.length > 0 ? (
                    <ListGroup variant="flush" className="gecen-hatlar-list">
                      {gecenHatlar.map((hat, index) => (
                        <ListGroup.Item key={`${hat.route_id}-${index}`} className="d-flex align-items-center">
                          <Link to={`/hatlar/${hat.route_id}`} className="text-decoration-none d-flex align-items-center">
                            <span className="hat-no-badge me-2">{hat.hat_no || '?'}</span>
                            <span className="hat-adi">{hat.hat_adi}</span>
                          </Link>
                                  </ListGroup.Item>
                          ))}
                      </ListGroup>
                  ) : (
                    <p className="text-muted">Bu duraktan geçen hat bilgisi bulunamadı.</p>
                  )}
          </Card.Body>
            </>
          )}
        </Card>

      {zoomMessage && !loading && <div className="zoom-message-overlay">{zoomMessage}</div>}

      <div className="durak-map-container">
      <MapContainer ref={mapRef} center={position} zoom={13} className="map-view">
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <MapEvents onViewportChange={handleViewportChange} />
        {userPosition && (
          <Marker position={userPosition} icon={userIcon}>
            <Popup>Siz Buradasınız</Popup>
          </Marker>
        )}
        {visibleStops.map(stop => (
          <Marker 
            key={stop.stop_id} 
            position={[parseFloat(stop.lat), parseFloat(stop.lon)]}
            icon={selectedStop?.stop_id === stop.stop_id ? selectedStopIcon : defaultStopIcon}
            eventHandlers={{
              click: () => {
                fetchStopDetails(stop);
              },
            }}
          >
            <Popup>
              <b>{stop.name}</b>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      </div>
    </div>
  );
};

export default DurakListe; 