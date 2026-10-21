const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  category: { type: String, enum: ['Workshop', 'Community', 'Career', 'Social', 'Academic'], default: 'Community' },
  description: { type: String, required: true, trim: true, maxlength: 2000 },
  date: { type: Date, required: true },
  time: { type: String, default: '10:00 AM' },
  location: { type: String, required: true, trim: true },
  capacity: {
    type: Number,
    default: null,
    min: 1,
    validate: { validator: (value) => value == null || Number.isInteger(value), message: 'Capacity must be a whole number.' }
  },
  organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  attendees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  coverTone: { type: String, default: 'violet' }
}, { timestamps: true });

eventSchema.index({ date: 1, category: 1 });

module.exports = mongoose.model('Event', eventSchema);
