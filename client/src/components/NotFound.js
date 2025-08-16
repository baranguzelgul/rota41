import React from 'react';
import { Container, Row, Col, Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';

const NotFound = () => {
  return (
    <Container className="text-center py-5">
      <Row>
        <Col>
          <h1 className="display-1">404</h1>
          <h2 className="mb-4">Sayfa Bulunamadı</h2>
          <p className="lead mb-4">
            Aradığınız sayfa bulunamadı. URL'yi kontrol edin veya ana sayfaya dönün.
          </p>
          <Button as={Link} to="/" variant="primary" size="lg">
            Ana Sayfaya Dön
          </Button>
        </Col>
      </Row>
    </Container>
  );
};

export default NotFound; 