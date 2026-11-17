const router = require('express').Router();
const { publicProfile } = require('../controllers/auth.controller');
const { protect } = require('../middlewares/auth.middleware');

router.get('/:id', protect, publicProfile);

module.exports = router;
