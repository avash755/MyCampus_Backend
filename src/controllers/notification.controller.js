const Notification = require('../db/models/notification.model');

async function listNotifications(req, res, next) {
  try {
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ recipient: req.user._id }).sort({ createdAt: -1 }).limit(40).lean(),
      Notification.countDocuments({ recipient: req.user._id, readAt: null })
    ]);
    res.json({ notifications, unreadCount });
  } catch (err) {
    next(err);
  }
}

async function markNotificationRead(req, res, next) {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id, readAt: null },
      { $set: { readAt: new Date() } },
      { returnDocument: 'after' }
    );
    res.json({ notification, message: 'Notification marked as read.' });
  } catch (err) {
    next(err);
  }
}

async function markAllNotificationsRead(req, res, next) {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, readAt: null },
      { $set: { readAt: new Date() } }
    );
    res.json({ message: 'Notifications marked as read.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listNotifications, markNotificationRead, markAllNotificationsRead };
