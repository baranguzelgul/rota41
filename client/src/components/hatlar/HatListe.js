import React, { useState, useEffect, useRef } from 'react';
import { Form, Card, Row, Col, Button, Spinner, Badge, Container, InputGroup, Dropdown } from 'react-bootstrap';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { hatAPI } from '../../services/api';
import './HatListe.scss';

const HatListe = () => {
  const navigate = useNavigate();
  const [hatlar, setHatlar] = useState([]);
  const [filteredHatlar, setFilteredHatlar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [aramaMetni, setAramaMetni] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const searchInputRef = useRef(null);
  const [siralamaKriteri, setSiralamaKriteri] = useState('numara');
  const [selectedType, setSelectedType] = useState('all');

  useEffect(() => {
    const aramaParam = searchParams.get('q');
    if (aramaParam) {
      setAramaMetni(aramaParam);
    }
  }, [searchParams]);

  useEffect(() => {
    const fetchHatlar = async () => {
      try {
        setLoading(true);
        const data = await hatAPI.tumHatlariGetir();
        const gidisHatlari = data.filter(hat => hat.yön === 'Gidiş');
        setHatlar(gidisHatlari);
        setSearchResults(gidisHatlari);
      } catch (err) {
        setError('Hatlar yüklenirken bir hata oluştu.');
        console.error('Hat listesi hatası:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchHatlar();
  }, []);

  useEffect(() => {
    const performSearch = async () => {
      if (aramaMetni.trim().length > 0) {
        try {
          const sonuclar = await hatAPI.hatAra(aramaMetni);
          const gidisSonuclari = sonuclar.filter(hat => hat.yön === 'Gidiş');
          setFilteredHatlar(gidisSonuclari);
        } catch (err) {
          console.error('Hat arama hatası:', err);
          setFilteredHatlar([]);
    }
      } else {
    let result = [...hatlar];
    
    if (selectedType !== 'all') {
      result = result.filter(hat => {
        if (selectedType === 'tramvay') return hat.route_type === '0' || hat.route_type === 0;
        if (selectedType === 'otobus') return hat.route_type === '3' || hat.route_type === 3;
        if (selectedType === 'vapur') return hat.route_type === '4' || hat.route_type === 4;
        return true;
      });
    } else {
      setFilteredHatlar([]);
      return;
    }
    
    if (siralamaKriteri === 'numara') {
      result.sort((a, b) => {
        const numA = parseInt(a.route_number || a.route_id) || 0;
        const numB = parseInt(b.route_number || b.route_id) || 0;
        return numA - numB;
      });
    } else if (siralamaKriteri === 'isim') {
      result.sort((a, b) => {
        return (a.route_name || '').localeCompare(b.route_name || '');
      });
    }

    setFilteredHatlar(result);
      }
    };

    performSearch();
  }, [hatlar, siralamaKriteri, selectedType, aramaMetni]);

  const handleArama = async (e) => {
    const value = e.target.value;
    setAramaMetni(value);

    if (value.trim()) {
      setSearchParams({ q: value }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }

    if (value.trim().length > 0) {
      setShowResults(true);
      try {
        const sonuclar = await hatAPI.hatAra(value);
        const gidisSonuclari = sonuclar.filter(hat => hat.yön === 'Gidiş');
        setSearchResults(gidisSonuclari);
      } catch(err) {
        setSearchResults([]);
      }
    } else {
      setShowResults(true);
      setSearchResults(hatlar);
    }
  };

  const handleSelectResult = (hatId) => {
    setAramaMetni('');
    setSearchResults([]);
    setShowResults(false);
    navigate(`/hatlar/${hatId}`);
  };

  const handleSearchFocus = () => {
    if (aramaMetni.trim().length > 0) {
      setShowResults(true);
    } else {
      setSearchResults(hatlar);
      setShowResults(true);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchInputRef.current && !searchInputRef.current.contains(event.target)) {
        setShowResults(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleTypeSelect = (type) => {
    setSelectedType(type);
      setAramaMetni('');
    setSearchParams({}, { replace: true });
  };

  const getHatRoute = (hat) => {
    let style = {};
    if (hat.route_color) {
      style.backgroundColor = `#${hat.route_color}`;
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

  if (loading) {
    return (
      <div className="text-center my-5">
        <Spinner animation="border" role="status" variant="primary">
          <span className="visually-hidden">Yükleniyor...</span>
        </Spinner>
        <p className="mt-2">Hatlar yükleniyor...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="text-center my-5">
        <Card.Body>
          <Card.Title className="text-danger">Hata</Card.Title>
          <Card.Text>{error}</Card.Text>
          <Button onClick={() => window.location.reload()} variant="primary">Tekrar Dene</Button>
        </Card.Body>
      </Card>
    );
  }

  return (
    <div className="hat-liste-page">
      <div className="bg-light-subtle py-5">
        <Container>
          <div className="text-center mb-4">
            <h1 className="h2 fw-bold text-dark mb-3">ULAŞIM SAATLERİ</h1>
            <p className="text-dark">Kocaeli Ütopya Belediyesi Hat Saatleri ve Güzergah Bilgileri</p>
          </div>
          
          <div className="transport-modes-container mb-4">
            <div className="d-flex justify-content-center flex-wrap">
              <div 
                className={`transport-icon-wrapper tramvay animated-icon mx-3 mb-3 ${selectedType === 'tramvay' ? 'selected' : ''}`}
                onClick={() => handleTypeSelect(selectedType === 'tramvay' ? 'all' : 'tramvay')}
                style={{cursor: 'pointer'}}
              >
                <i className="bi bi-train-lightrail-front transport-icon"></i>
              </div>
              <div 
                className={`transport-icon-wrapper otobus animated-icon mx-3 mb-3 ${selectedType === 'otobus' ? 'selected' : ''}`}
                onClick={() => handleTypeSelect(selectedType === 'otobus' ? 'all' : 'otobus')}
                style={{cursor: 'pointer'}}
              >
                <i className="bi bi-bus-front transport-icon"></i>
              </div>
              <div 
                className={`transport-icon-wrapper vapur animated-icon mx-3 mb-3 ${selectedType === 'vapur' ? 'selected' : ''}`}
                onClick={() => handleTypeSelect(selectedType === 'vapur' ? 'all' : 'vapur')}
                style={{cursor: 'pointer'}}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" fill="currentColor" className="transport-icon" viewBox="0 0 24 24">
                  <path d="M6,6H18V9.96L12,8L6,9.96V6M3.94,19H4C5.6,19 7,18.12 8,17C9,18.12 10.4,19 12,19C13.6,19 15,18.12 16,17C17,18.12 18.4,19 20,19H20.05L21.95,12.31C22.03,12.06 22,11.78 21.89,11.54C21.76,11.3 21.55,11.12 21.29,11.04L20,10.62V6C20,4.89 19.1,4 18,4H15V1H9V4H6A2,2 0 0,0 4,6V10.62L2.71,11.04C2.45,11.12 2.24,11.3 2.11,11.54C2,11.78 1.97,12.06 2.05,12.31L3.94,19M20,21C18.61,21 17.22,20.53 16,19.67C13.56,21.38 10.44,21.38 8,19.67C6.78,20.53 5.39,21 4,21H2V23H4C5.37,23 6.74,22.47 8,21.5C10.26,23.44 13.74,23.44 16,21.5C17.26,22.47 18.62,23 20,23H22V21H20Z" />
                </svg>
              </div>
            </div>
            {selectedType !== 'all' && (
              <div className="text-center mt-2">
                <Badge bg="primary" pill className="px-3 py-2 d-inline-flex align-items-center">
                  {selectedType === 'tramvay' ? 'Tramvay' : selectedType === 'otobus' ? 'Otobüs' : 'Vapur'} hatları gösteriliyor
                  <Button 
                    variant="link" 
                    className="text-white ms-2 p-0" 
                    style={{fontSize: '1rem'}}
                    onClick={() => setSelectedType('all')}
                  >
                    <i className="bi bi-x"></i>
                  </Button>
                </Badge>
              </div>
            )}
          </div>
          
          <div className={`search-container mx-auto position-relative ${showResults ? 'search-active' : ''}`} style={{ maxWidth: '700px' }} ref={searchInputRef}>
            <Card className="shadow-sm border-0">
              <Card.Body className="p-3">
                <InputGroup>
                  <InputGroup.Text className="bg-white border-end-0">
                    <i className="bi bi-search text-muted"></i>
                  </InputGroup.Text>
                  <Form.Control
                    type="text"
                    placeholder="Hat seçin veya arayın..."
                    value={aramaMetni}
                    onChange={handleArama}
                    onFocus={handleSearchFocus}
                    className="border-start-0"
                  />
                  {aramaMetni && (
                    <Button 
                      variant="link" 
                      className="border-start-0 text-secondary" 
                      onClick={() => {
                        setAramaMetni('');
                        setSearchParams({}, { replace: true });
                        setFilteredHatlar([]);
                        setSearchResults(hatlar);
                        setShowResults(false);
                      }}
                    >
                      <i className="bi bi-x"></i>
                    </Button>
                  )}
                </InputGroup>
                
                {showResults && (
                  <div 
                    className="position-absolute w-100 start-0 bg-white border rounded-bottom shadow-sm mt-1" 
                    style={{ zIndex: 1000, maxHeight: '300px', overflowY: 'auto' }}
                  >
                    {searchResults.length > 0 ? (
                      searchResults.map(result => (
                        <div 
                          key={result.route_id}
                          className="p-2 border-bottom hover-bg d-flex align-items-center"
                          style={{ cursor: 'pointer' }}
                          onClick={() => handleSelectResult(result.route_id)}
                        >
                          <span className="px-2 py-1 rounded me-2 d-inline-block" style={{
                            backgroundColor: result.route_color ? `#${result.route_color}` : '#0066cc',
                            color: result.route_color ? (parseInt(result.route_color, 16) > 0x7fffff ? 'black' : 'white') : 'white',
                            minWidth: '50px',
                            textAlign: 'center',
                            fontWeight: 'bold',
                            fontSize: '0.9rem'
                          }}>
                            {result.route_number || result.route_name}
                          </span>
                          <div>
                            <div className="fw-bold">{result.route_name || result.route_long_name || ''}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-3 text-center text-muted">
                        <i className="bi bi-info-circle me-2"></i>
                        Hat bulunamadı
                      </div>
                    )}
                  </div>
                )}
              </Card.Body>
            </Card>
          </div>

          <div className="text-center mt-5 mb-4">
            <h2 className="fw-bold text-dark">Nasıl Kullanılır?</h2>
          </div>
          <Row className="g-4">
              <Col md={4}>
                <Card className="h-100 shadow-sm">
                  <Card.Body className="d-flex align-items-start p-4">
                    <div className="rounded-circle d-flex align-items-center justify-content-center me-3 flex-shrink-0" 
                        style={{ width: '40px', height: '40px', backgroundColor: 'rgba(42, 82, 152, 0.1)', color: '#2a5298' }}>
                      <span className="fw-bold fs-5">1</span>
                    </div>
                    <div>
                      <h6 className="mb-2 fw-bold">HAT SEÇİN</h6>
                      <p className="text-muted mb-0" style={{fontSize: '0.9rem'}}>
                        Yukarıdaki arama motorundan detayını görmek istediğiniz hattı arayınız.
                      </p>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
              
              <Col md={4}>
                <Card className="h-100 shadow-sm">
                  <Card.Body className="d-flex align-items-start p-4">
                    <div className="rounded-circle d-flex align-items-center justify-content-center me-3 flex-shrink-0" 
                        style={{ width: '40px', height: '40px', backgroundColor: 'rgba(42, 82, 152, 0.1)', color: '#2a5298' }}>
                      <span className="fw-bold fs-5">2</span>
                    </div>
                    <div>
                      <h6 className="mb-2 fw-bold">SAATLER</h6>
                      <p className="text-muted mb-0" style={{fontSize: '0.9rem'}}>
                        Seçtiğiniz hattın kalkış saatlerini hafta içi veya hafta sonu olarak görüntüleyin.
                      </p>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
              
              <Col md={4}>
                <Card className="h-100 shadow-sm">
                  <Card.Body className="d-flex align-items-start p-4">
                    <div className="rounded-circle d-flex align-items-center justify-content-center me-3 flex-shrink-0" 
                        style={{ width: '40px', height: '40px', backgroundColor: 'rgba(42, 82, 152, 0.1)', color: '#2a5298' }}>
                      <span className="fw-bold fs-5">3</span>
                    </div>
                    <div>
                      <h6 className="mb-2 fw-bold">DURAKLAR</h6>
                      <p className="text-muted mb-0" style={{fontSize: '0.9rem'}}>
                        Seçtiğiniz hattın duraklarını liste veya harita şeklinde görüntüleyebilirsiniz.
                      </p>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
          </Row>
        </Container>
      </div>

      <Container className="my-5">
        {(aramaMetni || selectedType !== 'all') && (
        <div className="d-flex justify-content-between align-items-center flex-wrap mb-3">
          <div className="d-flex align-items-center mb-2 mb-sm-0">
            <h5 className="mb-0 me-3">Sonuçlar</h5>
            <Badge bg="primary" pill className="px-3 py-1">
              {filteredHatlar.length} hat bulundu
            </Badge>
          </div>
          
          <div className="d-flex align-items-center">
            <span className="text-muted me-2">Sırala:</span>
            <Dropdown>
              <Dropdown.Toggle variant="outline-secondary" size="sm" id="dropdown-sort" className="rounded-pill">
                {siralamaKriteri === 'numara' ? 'Hat Numarası' : 'İsme Göre'}
              </Dropdown.Toggle>

              <Dropdown.Menu>
                <Dropdown.Item active={siralamaKriteri === 'numara'} onClick={() => setSiralamaKriteri('numara')}>
                  Hat Numarası
                </Dropdown.Item>
                <Dropdown.Item active={siralamaKriteri === 'isim'} onClick={() => setSiralamaKriteri('isim')}>
                  İsme Göre
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </div>
        </div>
        )}
        
        {filteredHatlar.length > 0 ? (
          <Row className="g-3">
            {filteredHatlar.map((hat) => (
              <Col key={hat.route_id} sm={6} md={4} lg={3} xl={3}>
                <Card className="h-100 shadow-sm border-0 hat-card">
                  <Card.Header style={getHatRoute(hat)} className="text-center py-2">
                    <h5 className="mb-0">{hat.route_number || hat.route_name}</h5>
                  </Card.Header>
                  <Card.Body className="p-3">
                    <Card.Title className="fs-6">{hat.route_name}</Card.Title>
                    <Card.Text className="text-muted small mb-2" style={{fontSize: '0.8rem'}}>
                      {(hat.route_long_name || hat.route_desc || 'Açıklama bulunmuyor').substring(0, 60)}
                      {(hat.route_long_name || hat.route_desc || '').length > 60 ? '...' : ''}
                    </Card.Text>
                    <div className="d-flex justify-content-end mt-auto">
                      <Button 
                        as={Link} 
                        to={`/hatlar/${hat.route_id}`} 
                        variant="outline-primary"
                        size="sm"
                        className="mt-2"
                      >
                        Detaylar
                      </Button>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            ))}
          </Row>
        ) : !loading && (aramaMetni || selectedType !== 'all') ? (
          <Card className="text-center border-0 shadow-sm">
            <Card.Body className="p-5">
              <i className="bi bi-exclamation-triangle" style={{ fontSize: '3rem', color: '#6c757d' }}></i>
              <Card.Title className="mt-3 mb-2">Hat Bulunamadı</Card.Title>
              <Card.Text className="text-muted">
                Aradığınız kriterlere uygun bir hat bulunamadı. Lütfen filtreleri kontrol edin veya farklı bir arama yapın.
              </Card.Text>
            </Card.Body>
          </Card>
        ) : null}
      </Container>
    </div>
  );
};

export default HatListe; 