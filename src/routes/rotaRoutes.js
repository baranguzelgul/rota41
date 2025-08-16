const express = require('express');
const router = express.Router();
const rotaController = require('../controllers/rotaController');

// Rota bulma endpoint'i
// GET /api/rota/bul?startLat=...&startLng=...&endLat=...&endLng=...
router.get('/bul', rotaController.findRoute);

module.exports = router; 