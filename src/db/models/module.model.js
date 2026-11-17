const mongoose = require('mongoose');

const moduleSchema = new mongoose.Schema({
  number: { type: Number, required: true, unique: true, min: 1 },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  durationDays: { type: Number, required: true, min: 1, default: 1 },
  scheduleLabel: { type: String, trim: true, default: '3 to 4 hours' },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  fee: { type: Number, min: 0, default: null },
  startsAt: { type: Date, default: null },
  published: { type: Boolean, default: false },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

moduleSchema.index({ published: 1, startsAt: 1 });

module.exports = mongoose.model('Module', moduleSchema);
