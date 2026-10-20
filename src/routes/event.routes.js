const router = require('express').Router();
const {
  listEvents, createEvent, registerForEvent, deleteEvent
} = require('../controllers/event.controller');
const { protect } = require('../middlewares/auth.middleware');

router.get('/', listEvents);
router.post('/', protect, createEvent);
router.post('/:id/register', protect, registerForEvent);
router.delete('/:id', protect, deleteEvent);

module.exports = router;