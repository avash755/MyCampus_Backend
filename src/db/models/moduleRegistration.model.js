const mongoose = require('mongoose');

const moduleRegistrationSchema = new mongoose.Schema({
  module: { type: mongoose.Schema.Types.ObjectId, ref: 'ModuleOffering', required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending', index: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null }
}, { timestamps: true });

moduleRegistrationSchema.index({ module: 1, student: 1 }, { unique: true });
moduleRegistrationSchema.index({ student: 1, createdAt: -1 });
moduleRegistrationSchema.index({ module: 1, status: 1, createdAt: 1 });

module.exports = mongoose.model('ModuleRegistration', moduleRegistrationSchema);
