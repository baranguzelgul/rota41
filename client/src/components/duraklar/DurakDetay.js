import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, Row, Col, ListGroup, Button, Badge, Spinner } from 'react-bootstrap';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { durakAPI } from '../../services/api';
import L from 'leaflet';

// Leaflet icon sorunu için çözüm
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

const DurakDetay = () => {
  const { id } = useParams();
  const [durak, setDurak] = useState(null);
  const [hatlar, setHatlar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDurakDetay = async () => {
      try {
        setLoading(true);
        const durakData = await durakAPI.durakGetir(id);
        setDurak(durakData);
        
        const hatlarData = await durakAPI.durakHatlariniGetir(id);
        setHatlar(hatlarData);
      } catch (err) {
        setError('Durak bilgileri yüklenirken bir hata oluştu.');
        console.error('Durak detayı hatası:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDurakDetay();
  }, [id]);

  if (loading) {
    return (
      <div className="text-center my-5">
        <Spinner animation="border" role="status" variant="primary">
          <span className="visually-hidden">Yükleniyor...</span>
        </Spinner>
        <p className="mt-2">Durak bilgileri yükleniyor...</p>
      </div>
    );
  }

  if (error || !durak) {
    return (
      <Card className="text-center my-5">
        <Card.Body>
          <Card.Title className="text-danger">Hata</Card.Title>
          <Card.Text>{error || 'Durak bulunamadı.'}</Card.Text>
          <Button as={Link} to="/duraklar" variant="primary">Durak Listesine Dön</Button>
        </Card.Body>
      </Card>
    );
  }

  const position = [parseFloat(durak.lat) || 40.766666, parseFloat(durak.lon) || 29.916668]; // Varsayılan Kocaeli merkez 

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2>{durak.name}</h2>
        <Button as={Link} to="/duraklar" variant="outline-primary">
          Durak Listesine Dön
        </Button>
      </div>

      <Row>
        <Col md={6}>
          <Card className="mb-4">
            <Card.Header>
              <h5>Durak Bilgileri</h5>
            </Card.Header>
            <Card.Body>
              <ListGroup variant="flush">
                <ListGroup.Item>
                  <strong>Durak ID:</strong> {durak.stop_id}
                </ListGroup.Item>
                <ListGroup.Item>
                  <strong>Durak Adı:</strong> {durak.name}
                </ListGroup.Item>
                <ListGroup.Item>
                  <strong>Koordinatlar:</strong> {durak.lat}, {durak.lon}
                </ListGroup.Item>
              </ListGroup>
            </Card.Body>
          </Card>

          <Card>
            <Card.Header className="d-flex justify-content-between align-items-center">
              <h5>Geçen Hatlar</h5>
              <Badge bg="primary">{hatlar.length} hat</Badge>
            </Card.Header>
            <ListGroup variant="flush">
              {hatlar.length > 0 ? (
                hatlar.map((hat) => (
                  <ListGroup.Item 
                    key={hat.route_id + hat.yon}
                    className="d-flex justify-content-between align-items-center"
                  >
                    <div>
                      <h6>
                        Hat: {hat.route_name} 
                        <Badge bg="secondary" className="ms-2">{hat.yon}</Badge>
                      </h6>
                      <small className="text-muted">{hat.route_desc || 'Açıklama yok'}</small>
                    </div>
                    <Button 
                      as={Link} 
                      to={`/hatlar/${hat.route_id}`} 
                      variant="outline-primary" 
                      size="sm"
                    >
                      Hat Detayları
                    </Button>
                  </ListGroup.Item>
                ))
              ) : (
                <ListGroup.Item>Bu duraktan geçen hat bilgisi bulunamadı.</ListGroup.Item>
              )}
            </ListGroup>
          </Card>
        </Col>
        
        <Col md={6}>
          <Card>
            <Card.Header>
              <h5>Harita Konumu</h5>
            </Card.Header>
            <Card.Body>
              <MapContainer center={position} zoom={15} style={{ height: '400px' }}>
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                <Marker position={position}>
                  <Popup>
                    <strong>{durak.name}</strong><br />
                    Durak ID: {durak.stop_id}
                  </Popup>
                </Marker>
              </MapContainer>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DurakDetay; 