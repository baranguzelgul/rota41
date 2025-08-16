import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Form, Button, Spinner, Accordion, Offcanvas, InputGroup } from 'react-bootstrap';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, Polyline, useMap } from 'react-leaflet';
import AsyncSelect from 'react-select/async';
import L from 'leaflet';
import './NasilGiderim.scss';
import { rotaAPI, durakAPI } from '../../services/api';

// Marker ikonlarını özelleştirelim
const startIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const endIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// HARİTA ÜZERİNDEKİ ROTA ÇİZGİLERİNİ YÖNETEN BİLEŞEN
const RoutePolylines = ({ route }) => {
  const map = useMap();

  useEffect(() => {
    if (route) {
      const allPoints = [];
      route.steps.forEach(step => {
        if (step.type === 'BUS' && step.shape && step.shape.length > 0) {
          step.shape.forEach(p => allPoints.push(p));
        }
      });
      
      if (allPoints.length > 0) {
        map.fitBounds(allPoints);
      }
    }
  }, [route, map]);

  if (!route) return null;

  const colors = ['#e63946', '#1d3557', '#457b9d'];

  let busLegIndex = 0;
  return route.steps.map((step, index) => {
    if (step.type === 'BUS' && step.shape && step.shape.length > 0) {
      const color = colors[busLegIndex % colors.length];
      busLegIndex++;
      return <Polyline key={index} positions={step.shape} color={color} weight={5} />;
    }
    return null;
  });
};

// Tarih ve saati 'YYYY-MM-DDTHH:mm' formatına çeviren yardımcı fonksiyon
const toLocalISOString = (date) => {
    const pad = (num) => String(num).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const NasilGiderim = () => {
  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [routeResults, setRouteResults] = useState(null);
  const [showSearchOffcanvas, setShowSearchOffcanvas] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 992);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [isPicking, setIsPicking] = useState(null); // 'start', 'end' veya null

  // ARAMA KUTULARI İÇİN YENİ STATE'LER
  const [startStopValue, setStartStopValue] = useState(null);
  const [endStopValue, setEndStopValue] = useState(null);
  const mapRef = React.useRef(null); // MapContainer referansı için
  const [departureTime, setDepartureTime] = useState(toLocalISOString(new Date()));

  // Sunucudan durakları asenkron olarak yükleyen fonksiyon
  const loadOptions = (inputValue, callback) => {
    // Kullanıcı yazmayı bıraktıktan kısa bir süre sonra arama yapmak için debounce
    setTimeout(async () => {
      try {
        // Arama metnini API'ye gönder. Boşsa, API popüler durakları döndürecek.
        const items = await durakAPI.durakAra(inputValue);
        callback(items);
      } catch (error) {
        console.error("Durak aranırken hata:", error);
        callback([]); // Hata durumunda boş dizi döndür
      }
    }, 300); 
  };

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 992;
      if (!mobile) {
        setShowSearchOffcanvas(false); // Masaüstüne geçince offcanvas'ı kapat
      }
      setIsMobile(mobile);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleMapContextMenu = (e) => {
    // Prevent the default browser right-click menu
    e.originalEvent.preventDefault();
    setContextMenu({
      latlng: e.latlng,
    });
  };

  const setPointFromMenu = (type) => {
    if (!contextMenu) return;

    const newPoint = { lat: contextMenu.latlng.lat, lon: contextMenu.latlng.lng };

    if (type === 'start') {
      setStartPoint(newPoint);
      setStartStopValue(null); // Haritadan seçilince arama kutusunu temizle
    } else {
      setEndPoint(newPoint);
      setEndStopValue(null); // Haritadan seçilince arama kutusunu temizle
    }
    setContextMenu(null); // Menüyü kapat
  };
  
  const handleSelectChange = (selectedOption, type) => {
    // Temizle (X) butonuna basıldığında state'i sıfırla
    if (!selectedOption) {
      if (type === 'start') {
        setStartPoint(null);
        setStartStopValue(null);
      } else {
        setEndPoint(null);
        setEndStopValue(null);
      }
      setRouteResults(null);
      return;
    }

    // Bir durak seçildiğinde, lat/lon'u sayıya çevir
    const newPoint = { 
      lat: parseFloat(selectedOption.lat), 
      lon: parseFloat(selectedOption.lon) 
    };
    
    if (type === 'start') {
        setStartPoint(newPoint);
        setStartStopValue(selectedOption);
    } else {
        setEndPoint(newPoint);
        setEndStopValue(selectedOption);
    }

    // Haritayı seçilen durağa ortala
    if (mapRef.current) {
        mapRef.current.flyTo(newPoint, 15);
    }

    setRouteResults(null);
    setError(null);
  };

  const handleMapClick = (e) => {
    if (isPicking) {
      const newPoint = { lat: e.latlng.lat, lon: e.latlng.lng };
      if (isPicking === 'start') {
        setStartPoint(newPoint);
        setStartStopValue(null);
      } else {
        setEndPoint(newPoint);
        setEndStopValue(null);
      }
      setIsPicking(null); // Seçim modunu kapat
    } else {
       // Normal tıklamada sadece context menüyü kapat
       if (contextMenu) {
        setContextMenu(null);
      }
    }
  };

  const handleUseCurrentLocation = (type) => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const newPoint = { lat: latitude, lon: longitude };

          if (type === 'start') {
            setStartPoint(newPoint);
            setStartStopValue(null);
          } else {
            setEndPoint(newPoint);
            setEndStopValue(null);
          }

          if (mapRef.current) {
            mapRef.current.flyTo(newPoint, 15);
          }
        },
        (error) => {
          console.error("Konum bilgisi alınamadı:", error);
          setError("Konumunuza erişilemedi. Lütfen tarayıcı ayarlarınızı kontrol edin.");
        }
      );
    } else {
      setError("Tarayıcınız konum servislerini desteklemiyor.");
    }
  };

  const handleSwapPoints = () => {
    setStartPoint(endPoint);
    setEndPoint(startPoint);
    setStartStopValue(endStopValue);
    setEndStopValue(startStopValue);
  };

  const MapEvents = () => {
    useMapEvents({ 
      contextmenu: handleMapContextMenu,
      click: handleMapClick,
    });
    return null;
  };

  const clearPoints = () => {
    setStartPoint(null);
    setEndPoint(null);
    setStartStopValue(null);
    setEndStopValue(null);
    setRouteResults(null);
    setError(null);
  };

  const handleFindRoute = async () => {
    if (!startPoint || !endPoint) return;
    setLoading(true);
    setError(null);
    setRouteResults(null);
    setSelectedRouteIndex(null);

    try {
      const results = await rotaAPI.findRoute(startPoint, endPoint, departureTime);
      if (results.route_options && results.route_options.length > 0) {
        setRouteResults(results);
      } else {
        setError(results.error || 'Uygun rota bulunamadı. Lütfen farklı noktalar veya zaman deneyin.');
      }
      if (isMobile) {
        setShowSearchOffcanvas(false); // Arama sonrası arama panelini kapat
      }
    } catch (err) {
      const errorMessage = err.response?.data?.error || 'Rota bulunurken bir hata oluştu. Lütfen daha sonra tekrar deneyin.';
      setError(errorMessage);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const renderRouteSteps = (route) => {
    return route.steps.map((step, index) => {
        let iconClass = '';
        let iconWrapperClass = 'step-icon';
        let title = '';
        let details = '';

        switch(step.type) {
            case 'WALK':
                iconWrapperClass += ' walk-icon';
                iconClass = 'bi bi-person-walking';
                if (index === 0) { // İlk adım
                    title = <span><strong>{step.to}</strong> durağına yürü</span>;
                    iconWrapperClass += ' start-icon';
                    iconClass = 'bi bi-geo-alt-fill';
                } else { // Son adım
                    title = 'Varış noktanıza yürü';
                    iconWrapperClass += ' end-icon';
                    iconClass = 'bi bi-flag-fill';
                }
                details = `Yaklaşık ${Math.round(step.duration)} dakika (~${Math.round(step.distance)}m)`;
                break;
            case 'BUS':
                iconWrapperClass += ' bus-icon';
                iconClass = 'bi bi-bus-front';
                title = (
                    <span>
                        <span className="line-badge">{step.line}</span> numaralı hatta binip <strong>{step.to}</strong> durağında inin.
                    </span>
                );
                // Eğer bu ilk otobüs adımıysa ve zaman bilgisi varsa, ekleyelim
                const isFirstBusStep = route.steps.findIndex(s => s.type === 'BUS') === index;
                if (isFirstBusStep && route.arrivalInfo) {
                    const arrivalText = `Tahmini Biniş: ${route.arrivalInfo.estimatedArrival}`;
                    const waitText = route.arrivalInfo.waitTime > 0 ? `(${route.arrivalInfo.waitTime} dk bekleme)`: '(hemen)';
                    details = `${arrivalText} ${waitText}. `;
                }
                details += `${step.stops.length} durak (${Math.round(step.duration)} dk)`;
                break;
            case 'TRANSFER':
                iconWrapperClass += ' transfer-icon';
                iconClass = 'bi bi-arrow-down-up';
                title = step.text;
                if (step.arrivalInfo) {
                    const arrivalText = `Tahmini Biniş: ${step.arrivalInfo.estimatedArrival}`;
                    const waitText = `(${Math.round(step.duration)} dk bekleme)`;
                    details = `${arrivalText} ${waitText}`;
                } else {
                    details = `Yaklaşık ${Math.round(step.duration)} dakika bekleme`;
                }
                break;
            default:
                iconClass = 'bi bi-geo-alt';
                title = 'Bilinmeyen adım';
        }
        return (
            <div key={index} className="route-step">
                <div className={iconWrapperClass}>
                    <i className={iconClass}></i>
                </div>
                <div className="step-content">
                  <div className="step-title">{title}</div>
                  {details && <small className="step-details">{details}</small>}
                </div>
            </div>
        );
    });
  };

  const generateRouteSummary = (route, index) => {
    const letter = String.fromCharCode(65 + index);
    const busLines = [...new Set(route.steps.filter(s => s.type === 'BUS').map(s => s.line))];
    const transfers = route.steps.filter(s => s.type === 'TRANSFER').length;
    const walkDuration = route.total_walk_duration;
    
    const transferText = transfers > 0 ? `${transfers} aktarma` : null;

    return (
        <>
            <span className="route-letter">{letter}</span>
            <div className="summary-content-wrapper flex-grow-1">
                <div className="summary-line-1">
                    {busLines.length > 0 ?
                        <>
                            <i className="bi bi-bus-front"></i>
                            <span>{busLines.join(' > ')}</span>
                        </> :
                        <>
                            <i className="bi bi-person-walking"></i>
                            <span>Sadece Yürüme</span>
                        </>
                    }
                </div>
                <div className="summary-details">
                    {transferText && <span>{transferText}</span>}
                    {transferText && walkDuration > 0 && <i className="bi bi-dot"></i>}
                    {walkDuration > 0 && 
                        <span className="d-inline-flex align-items-center">
                            <i className="bi bi-person-walking me-1"></i>{`${walkDuration} dk`}
                        </span>
                    }
                </div>
            </div>
        </>
    );
  };

  const SearchFormComponent = () => (
    <div className="search-panel">
      {/* BAŞLANGIÇ NOKTASI */}
      <Form.Group className="mb-3">
        <Form.Label>Başlangıç Noktası</Form.Label>
        <InputGroup className="route-input-group">
          <InputGroup.Text><i className="bi bi-geo-alt-fill text-success"></i></InputGroup.Text>
          <AsyncSelect
            className="flex-grow-1"
            classNamePrefix="route-select"
            placeholder="Başlangıç durağı..."
            value={startStopValue}
            getOptionValue={(option) => option.stop_id}
            getOptionLabel={(option) => option.name}
            loadOptions={loadOptions}
            onChange={(option) => handleSelectChange(option, 'start')}
            isClearable
            cacheOptions
            defaultOptions
            noOptionsMessage={() => null}
            components={{ DropdownIndicator: null }}
          />
          <Button 
            variant="outline-secondary"
            onClick={() => handleUseCurrentLocation('start')}
            title="Mevcut konumumu kullan"
          >
            <i className="bi bi-geo-alt-fill"></i>
          </Button>
          <Button 
            variant={isPicking === 'start' ? 'primary' : 'outline-secondary'} 
            onClick={() => setIsPicking(isPicking === 'start' ? null : 'start')}
            title="Haritadan başlangıç noktası seç"
          >
            <i className="bi bi-crosshair"></i>
          </Button>
        </InputGroup>
      </Form.Group>

      {/* İkonları ortalamak için bir div */}
      <div className="text-center my-1"> 
          <Button variant="light" size="sm" onClick={handleSwapPoints} className="swap-button">
              <i className="bi bi-arrow-down-up"></i>
          </Button>
      </div>

      {/* BİTİŞ NOKTASI */}
      <Form.Group className="mb-3">
        <Form.Label>Varış Noktası</Form.Label>
        <InputGroup className="route-input-group">
          <InputGroup.Text><i className="bi bi-geo-alt-fill text-danger"></i></InputGroup.Text>
          <AsyncSelect
             className="flex-grow-1"
             classNamePrefix="route-select"
             placeholder="Varış durağı..."
             value={endStopValue}
             getOptionValue={(option) => option.stop_id}
             getOptionLabel={(option) => option.name}
             loadOptions={loadOptions}
             onChange={(option) => handleSelectChange(option, 'end')}
             isClearable
             cacheOptions
             defaultOptions
             noOptionsMessage={() => null}
             components={{ DropdownIndicator: null }}
          />
          <Button 
            variant="outline-secondary"
            onClick={() => handleUseCurrentLocation('end')}
            title="Mevcut konumumu kullan"
          >
            <i className="bi bi-geo-alt-fill"></i>
          </Button>
           <Button 
            variant={isPicking === 'end' ? 'primary' : 'outline-secondary'} 
            onClick={() => setIsPicking(isPicking === 'end' ? null : 'end')}
            title="Haritadan varış noktası seç"
          >
            <i className="bi bi-crosshair"></i>
          </Button>
        </InputGroup>
      </Form.Group>
      
      <Form.Group className="mt-3">
        <Form.Label>Gidiş Zamanı</Form.Label>
        <Form.Control
          type="datetime-local"
          value={departureTime}
          onChange={(e) => setDepartureTime(e.target.value)}
        />
      </Form.Group>

      <div className="d-grid gap-2 mt-4">
        <Button variant="primary" onClick={handleFindRoute} disabled={loading || !startPoint || !endPoint}>
          {loading ? <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" /> : 'Rota Bul'}
        </Button>
        <Button variant="outline-secondary" size="sm" onClick={clearPoints}>
            Seçilenleri Temizle
        </Button>
      </div>
    </div>
  );

  const ResultsListComponent = () => (
      <div className="results-panel">
        {loading && (
            <div className="loading-indicator">
                <Spinner as="span" animation="border" role="status" aria-hidden="true" />
                <p className="mt-2">En iyi rota bulunuyor...</p>
            </div>
        )}
        {error && (
            <div className="error-message">
                <i className="bi bi-exclamation-triangle-fill"></i>
                <p><strong>Hata</strong></p>
                <p>{error}</p>
            </div>
        )}
        {routeResults && routeResults.route_options ? (
            <div className="results-container">
                <Accordion activeKey={selectedRouteIndex !== null ? String(selectedRouteIndex) : null} onSelect={(k) => setSelectedRouteIndex(k === null ? null : Number(k))}>
                  {routeResults.route_options.map((option, index) => (
                      <Accordion.Item eventKey={String(index)} key={index} className="mb-3 route-option-accordion">
                          <Accordion.Header>
                            <div className="route-summary">
                                <div className="summary-text">{generateRouteSummary(option, index)}</div>
                                <span className={`total-duration ${index === 0 ? 'best-route' : ''}`}>{Math.round(option.total_duration)} dk</span>
                            </div>
                          </Accordion.Header>
                          <Accordion.Body>
                            {renderRouteSteps(option)}
                          </Accordion.Body>
                      </Accordion.Item>
                  ))}
                </Accordion>
            </div>
        ) : !loading && !error && (
            <div className="info-message">
                <i className="bi bi-info-circle-fill"></i>
                <p><strong>Başlamaya Hazır</strong></p>
                <p>Başlangıç ve varış noktalarınızı seçerek rota araması yapabilirsiniz.</p>
            </div>
        )}
      </div>
  );

  return (
    <>
      <div className="nasil-giderim-page">
      <Button
        variant="primary"
        className="d-lg-none sidebar-toggler"
        onClick={() => setShowSearchOffcanvas(true)}
      >
        <i className="bi bi-search"></i>
      </Button>
    
      <Container fluid className="nasil-giderim-container g-0">
        <Row className="g-0">
            {/* MASAÜSTÜ ARAMA FORMU (SOL SÜTUN) */}
            {!isMobile && (
          <Col lg={3} className="d-none d-lg-flex sidebar">
            <div className="sidebar-header">
              <h3>Nasıl Giderim?</h3>
            </div>
            <SearchFormComponent />
          </Col>
            )}

            {/* HARİTA */}
          <Col lg={routeResults && !isMobile ? 6 : 9} xs={12} className="map-container-col p-0">
              <MapContainer 
                ref={mapRef} 
                center={[40.7659, 29.9415]} 
                zoom={13} 
                style={{ height: '100%', width: '100%', cursor: isPicking ? 'crosshair' : 'grab' }}
              >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              <MapEvents />
              {startPoint && <Marker position={[startPoint.lat, startPoint.lon]} icon={startIcon}><Popup>Başlangıç Noktası</Popup></Marker>}
              {endPoint && <Marker position={[endPoint.lat, endPoint.lon]} icon={endIcon}><Popup>Varış Noktası</Popup></Marker>}
              
              {/* Sağ Tık Menüsü */}
              {contextMenu && (
                <Popup
                  position={contextMenu.latlng}
                  onClose={() => setContextMenu(null)}
                >
                  <div className="map-context-menu">
                      <div className="context-menu-option start" onClick={() => setPointFromMenu('start')}>
                          <i className="bi bi-geo-alt-fill"></i> Başlangıç olarak ayarla
                      </div>
                      <div className="context-menu-option end" onClick={() => setPointFromMenu('end')}>
                          <i className="bi bi-flag-fill"></i> Varış olarak ayarla
                      </div>
                  </div>
                </Popup>
              )}

              {selectedRouteIndex !== null && routeResults && (
                <RoutePolylines route={routeResults.route_options[selectedRouteIndex]} />
              )}
            </MapContainer>
          </Col>
          
            {/* MASAÜSTÜ SONUÇLAR PANELİ (SAĞ SÜTUN) */}
          {routeResults && !isMobile && (
             <Col lg={3} className="d-none d-lg-flex sidebar">
                <div className="sidebar-header">
                    <h3>Güzergah Seçenekleri</h3>
                    <button type="button" className="btn-close" onClick={() => setRouteResults(null)} aria-label="Close"></button>
                </div>
                <ResultsListComponent />
             </Col>
          )}

            {/* MOBİL ARAMA OFFCANVAS (SOLDAN) */}
          <Offcanvas show={showSearchOffcanvas} onHide={() => setShowSearchOffcanvas(false)} placement="start" className="d-lg-none sidebar">
            <Offcanvas.Header closeButton>
                <Offcanvas.Title as="h3">Nasıl Giderim?</Offcanvas.Title>
            </Offcanvas.Header>
            <Offcanvas.Body>
                <SearchFormComponent />
            </Offcanvas.Body>
          </Offcanvas>

            {/* MOBİL SONUÇLAR OFFCANVAS (SAĞDAN) */}
          <Offcanvas show={!!routeResults && isMobile} onHide={() => setRouteResults(null)} placement="end" className="d-lg-none sidebar">
            <Offcanvas.Header closeButton>
                <Offcanvas.Title as="h3">Güzergah Seçenekleri</Offcanvas.Title>
            </Offcanvas.Header>
            <Offcanvas.Body>
                <ResultsListComponent />
            </Offcanvas.Body>
          </Offcanvas>

        </Row>
      </Container>
      </div>
    </>
  );
};

export default NasilGiderim; 