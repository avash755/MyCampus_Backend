const router = require('express').Router();
const {
  listNotifications, markNotificationRead, markAllNotificationsRead
} = require('../controllers/notification.controller');
const { protect } = require('../middlewares/auth.middleware');

router.use(protect);
router.get('/', listNotifications);
router.patch('/read-all', markAllNotificationsRead);
router.patch('/:id/read', markNotificationRead);

module.exports = router;
