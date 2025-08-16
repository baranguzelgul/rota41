const express = require('express');
const router = express.Router();
const durakController = require('../controllers/durakController');

// Harita üzerindeki yakın durakları getir
router.get('/yakin', durakController.getYakinDuraklar);

// İsme veya koda göre durak ara (AsyncSelect için)
router.get('/ara', durakController.durakAra);

// Tüm durakları listele (react-select için)
router.get('/', durakController.getAllStops);

// Belirli bir durağın detaylarını getir (DurakDetay sayfası için)
router.get('/:id', durakController.durakGetir);

// Bir durağa yaklaşan hatları getir
router.get('/:id/yaklasan-hatlar', durakController.getYaklasanHatlar);

// Bir durağın üzerinden geçen hatları getir (DurakDetay sayfası için)
router.get('/:id/hatlar', durakController.durakHatlariniGetir);

module.exports = router; 