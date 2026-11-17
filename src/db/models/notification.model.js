const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['post_pending', 'post_approved', 'post_rejected'], required: true },
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'CampusPost', required: true },
  postTitle: { type: String, required: true },
  postCategory: { type: String, required: true },
  message: { type: String, required: true },
  readAt: { type: Date, default: null }
}, { timestamps: true });

notificationSchema.index({ recipient:  1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
