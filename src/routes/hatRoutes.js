const express = require('express');
const router = express.Router();
const hatController = require('../controllers/hatController');

// Tüm hatları getir
router.get('/', hatController.tumHatlariGetir);

// Hat ismine göre hat ara
router.get('/ara', hatController.hatAra);

// Hat ID'ye göre hat getir
router.get('/:id', hatController.hatGetir);

// Bir hattın güzergahındaki tüm durakları getir
router.get('/:id/guzergah', hatController.hatGuzergahiniGetir);

// Hat için shape verilerini getir
router.get('/:id/shape', hatController.hatShapeGetir);

// Hat için saat bilgilerini getir
router.get('/:id/saat-bilgileri', hatController.hatSaatBilgileriGetir);

module.exports = router; 