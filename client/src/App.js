import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

import Header from './components/Header';
import Home from './components/Home';
import DurakListe from './components/duraklar/DurakListe';
import DurakDetay from './components/duraklar/DurakDetay';
import HatListe from './components/hatlar/HatListe';
import HatDetay from './components/hatlar/HatDetay';
import NasilGiderim from './components/nasilgiderim/NasilGiderim';
import NotFound from './components/NotFound';
import Footer from './components/footer/Footer';
import OneriSikayet from './components/onerisikayet/OneriSikayet';
import Hakkimizda from './components/hakkimizda/Hakkimizda';

function App() {
  return (
    <Router>
      <div className="app-container">
      <Header />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/duraklar" element={<DurakListe />} />
          <Route path="/duraklar/:id" element={<DurakDetay />} />
          <Route path="/hatlar" element={<HatListe />} />
          <Route path="/hatlar/:id" element={<HatDetay />} />
          <Route path="/nasil-giderim" element={<NasilGiderim />} />
            <Route path="/oneri-sikayet" element={<OneriSikayet />} />
            <Route path="/hakkimizda" element={<Hakkimizda />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
        <Footer />
      </div>
    </Router>
  );
}

export default App;
