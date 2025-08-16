import React, { useState, useEffect } from 'react';
import { Navbar, Nav, Container } from 'react-bootstrap';
import { NavLink } from 'react-router-dom';
import { FaBusAlt, FaHome, FaMapMarkedAlt, FaRoute } from 'react-icons/fa';
import logo from '../assets/images/logo.jpg';
import './Header.scss';

const Header = () => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <Navbar 
      collapseOnSelect
      expand="lg" 
      variant="dark" 
      fixed="top"
      className={`app-header ${scrolled ? 'scrolled' : ''}`}
    >
      <Container>
        <Navbar.Brand as={NavLink} to="/">
          <img src={logo} alt="Kocaeli Ulaşım Logosu" className="navbar-logo" />
          <span>Rota41</span>
        </Navbar.Brand>
        <Navbar.Toggle aria-controls="responsive-navbar-nav" />
        <Navbar.Collapse id="responsive-navbar-nav">
          <Nav className="ms-auto">
            <Nav.Link as={NavLink} to="/" end>
              <FaHome className="nav-icon" />
              Ana Sayfa
            </Nav.Link>
            <Nav.Link as={NavLink} to="/hatlar">
              <FaBusAlt className="nav-icon" />
              Hatlar
            </Nav.Link>
            <Nav.Link as={NavLink} to="/duraklar">
              <FaMapMarkedAlt className="nav-icon" />
              Otobüsüm Nerede?
            </Nav.Link>
            <Nav.Link as={NavLink} to="/nasil-giderim">
              <FaRoute className="nav-icon" />
              Nasıl Giderim?
            </Nav.Link>
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
};

export default Header; 