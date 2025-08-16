import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Home.scss';
import { FaBus, FaMapMarkerAlt, FaRoute } from 'react-icons/fa';

const Home = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const navigate = useNavigate();

    const handleSearch = (e) => {
        e.preventDefault();
        if (searchTerm.trim()) {
            navigate(`/hatlar?q=${searchTerm.trim()}`);
        }
    };

    return (
        <div className="home-page">
            <section className="hero">
                <h1>Kocaeli Ulaşım Rehberi</h1>
                <p>Rota41 ile durakları, hatları ve rotaları keşfedin, yolculuğunuzu kolayca planlayın.</p>
                <form onSubmit={handleSearch} className="search-form">
                    <input
                        type="text"
                        placeholder="Hat arayın..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <button type="submit">Ara</button>
                </form>
            </section>
        
            <section className="features-section">
                <div className="container">
                    <h2 className="section-title">Hizmetler</h2>
                    <div className="feature-cards">
                        <Link to="/hatlar" className="feature-card">
                            <div className="card-icon">
                                <FaBus />
                            </div>
                            <h3>Hatları Keşfet</h3>
                            <p>Tüm otobüs, tramvay, vapur hatlarını ve güzergahlarını inceleyin.</p>
                        </Link>
                        <Link to="/duraklar" className="feature-card">
                            <div className="card-icon">
                                <FaMapMarkerAlt />
                            </div>
                            <h3>Durakları Bul</h3>
                            <p>Size en yakın durakları ve duraktan geçen hatları bulun.</p>
                        </Link>
                        <Link to="/nasil-giderim" className="feature-card">
                            <div className="card-icon">
                                <FaRoute />
                            </div>
                            <h3>Rota Planla</h3>
                            <p>Nereden nereye gitmek istediğinizi seçin, en iyi rotayı oluşturalım.</p>
                        </Link>
                    </div>
                </div>
            </section>
        </div>
  );
};

export default Home; 