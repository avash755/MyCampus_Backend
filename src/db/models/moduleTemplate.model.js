const mongoose = require('mongoose');

const moduleTemplateSchema = new mongoose.Schema({
  number: { type: Number, required: true, unique: true, min: 1, max: 25 },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  durationDays: { type: Number, required: true, min: 1, max: 365, default: 1 },
  scheduleLabel: { type: String, trim: true, maxlength: 80, default: '3 to 4 hours' }
}, { timestamps: true });

module.exports = mongoose.model('ModuleTemplate', moduleTemplateSchema);
