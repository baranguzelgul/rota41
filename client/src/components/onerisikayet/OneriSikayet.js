import React, { useState } from 'react';
import { Container, Row, Col, Form, Button, Card, Alert } from 'react-bootstrap';
import { FaEnvelope, FaPaperPlane } from 'react-icons/fa';
import './OneriSikayet.scss';

const OneriSikayet = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.subject || !formData.message) {
      setError('Lütfen tüm zorunlu alanları doldurun.');
      return;
    }
    // Burada form verilerini gönderme işlemi yapılabilir (örn. API'ye post etme)
    console.log('Form verileri:', formData);
    setError('');
    setSubmitted(true);
    setFormData({ name: '', email: '', phone: '', subject: '', message: '' });
  };

  return (
    <div className="oneri-sikayet-page">
      <Container>
        <Row className="justify-content-center">
          <Col md={8}>
            <Card className="oneri-sikayet-card">
              <Card.Body>
                <div className="text-center mb-4">
                  <FaEnvelope size={40} className="card-icon" />
                  <h2 className="card-title">Öneri & Şikayet</h2>
                  <p className="card-subtitle">
                    Hizmetlerimizi iyileştirmemize yardımcı olmak için görüşleriniz bizim için değerlidir.
                  </p>
                </div>

                {submitted && <Alert variant="success">Mesajınız başarıyla gönderildi. Teşekkür ederiz!</Alert>}
                {error && <Alert variant="danger">{error}</Alert>}

                <Form onSubmit={handleSubmit}>
                  <Row>
                    <Col md={6}>
                      <Form.Group className="mb-3" controlId="formName">
                        <Form.Label>Adınız Soyadınız</Form.Label>
                        <Form.Control type="text" name="name" value={formData.name} onChange={handleChange} placeholder="Adınız ve soyadınız" required />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group className="mb-3" controlId="formEmail">
                        <Form.Label>E-posta Adresiniz</Form.Label>
                        <Form.Control type="email" name="email" value={formData.email} onChange={handleChange} placeholder="E-posta adresiniz" required />
                      </Form.Group>
                    </Col>
                  </Row>

                  <Form.Group className="mb-3" controlId="formSubject">
                    <Form.Label>Konu</Form.Label>
                    <Form.Control type="text" name="subject" value={formData.subject} onChange={handleChange} placeholder="Mesajınızın konusu" required />
                  </Form.Group>

                  <Form.Group className="mb-4" controlId="formMessage">
                    <Form.Label>Mesajınız</Form.Label>
                    <Form.Control as="textarea" name="message" value={formData.message} onChange={handleChange} rows={5} placeholder="Öneri veya şikayetinizi buraya yazın" required />
                  </Form.Group>

                  <div className="d-grid">
                    <Button variant="primary" type="submit" size="lg">
                      <FaPaperPlane className="me-2" /> Gönder
                    </Button>
                  </div>
                </Form>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
};

export default OneriSikayet; 