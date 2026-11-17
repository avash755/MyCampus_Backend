const mongoose = require('mongoose');

const moduleOfferingSchema = new mongoose.Schema({
  // Topic number is not unique: a reusable topic can have many scheduled runs.
  number: { type: Number, min: 1, max: 25, default: null },
  templateNumber: { type: Number, min: 1, max: 25, default: null },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  durationDays: { type: Number, required: true, min: 1, max: 365, default: 1 },
  scheduleLabel: { type: String, trim: true, maxlength: 80, default: '3 to 4 hours' },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  fee: { type: Number, min: 0, default: null },
  startsAt: { type: Date, default: null },
  published: { type: Boolean, default: false },
  publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

moduleOfferingSchema.index({ published: 1, startsAt: 1 });
moduleOfferingSchema.index({ number: 1, startsAt: -1 });

module.exports = mongoose.model('ModuleOffering', moduleOfferingSchema);
