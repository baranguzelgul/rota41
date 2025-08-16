import React from 'react';
import { Container, Row, Col, Nav } from 'react-bootstrap';
import { NavLink } from 'react-router-dom';
import { FaFacebook, FaTwitter, FaInstagram, FaYoutube, FaWhatsapp } from 'react-icons/fa';
import logo from '../../assets/images/logo.jpg';
import './Footer.scss';

const Footer = () => {
  return (
    <footer className="app-footer">
      <Container>
        <Row className="footer-top">
          <Col md={4} className="footer-brand">
            <div className="brand-info">
              <img src={logo} alt="Rota41 Logo" className="footer-logo" />
              <div className="brand-text">
                <h3>Rota41</h3>
                <p>Kocaeli Ulaşım Rehberi</p>
              </div>
            </div>
            <div className="footer-social">
              <h5>Bize Ulaşın</h5>
              <div className="social-icons">
                <a href="https://twitter.com/kocaelibld" target="_blank" rel="noopener noreferrer"><FaTwitter /></a>
                <a href="https://www.facebook.com/kocaelibld" target="_blank" rel="noopener noreferrer"><FaFacebook /></a>
                <a href="https://www.instagram.com/kocaelibld" target="_blank" rel="noopener noreferrer"><FaInstagram /></a>
                <a href="https://www.youtube.com/kocaelibld" target="_blank" rel="noopener noreferrer"><FaYoutube /></a>
                <a href="https://wa.me/905537157223" target="_blank" rel="noopener noreferrer"><FaWhatsapp /></a>
              </div>
            </div>
          </Col>
          <Col md={2}>
            <h5>Hakkımızda</h5>
            <Nav className="flex-column">
              <Nav.Link as={NavLink} to="/hakkimizda">Hakkımızda</Nav.Link>
              <Nav.Link as={NavLink} to="/oneri-sikayet">Öneri & Şikayet</Nav.Link>
            </Nav>
          </Col>
          <Col md={3}>
            <h5>KOCAELİ</h5>
            <Nav className="flex-column">
              <Nav.Link href="https://kocaeliyikesfet.com/" target="_blank" rel="noopener noreferrer">Kocaeli 'yi Keşfet</Nav.Link>
              <Nav.Link href="https://www.havadankocaeli.com/" target="_blank" rel="noopener noreferrer">Havadan Kocaeli</Nav.Link>
              <Nav.Link href="https://veri.kocaeli.bel.tr/" target="_blank" rel="noopener noreferrer">Veri Kocaeli</Nav.Link>
              <Nav.Link href="https://kocaeliansiklopedisi.com/" target="_blank" rel="noopener noreferrer">Kocaeli Ansiklopedisi</Nav.Link>
              <Nav.Link href="https://kocaelimarkalasiyor.com/" target="_blank" rel="noopener noreferrer">Kocaeli Markalaşıyor</Nav.Link>
            </Nav>
          </Col>
          <Col md={3} className="footer-hizmetler-col">
            <h5>HİZMETLER</h5>
            <Nav className="flex-column">
              <Nav.Link as={NavLink} to="/hatlar">Hatlar</Nav.Link>
              <Nav.Link as={NavLink} to="/duraklar">Otobüsüm Nerede?</Nav.Link>
              <Nav.Link as={NavLink} to="/nasil-giderim">Nasıl Giderim?</Nav.Link>
            </Nav>
          </Col>
        </Row>
        <Row className="footer-bottom">
          <Col>
            <p>&copy; {new Date().getFullYear()} Rota41 ∼ Kocaeli Ulaşım Rehberi. Tüm Hakları Saklıdır.</p>
          </Col>
        </Row>
      </Container>
    </footer>
  );
};

export default Footer; 