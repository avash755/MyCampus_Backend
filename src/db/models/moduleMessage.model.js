const mongoose = require('mongoose');

const moduleMessageSchema = new mongoose.Schema({
  module: { type: mongoose.Schema.Types.ObjectId, ref: 'ModuleOffering', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  body: { type: String, required: true, trim: true, maxlength: 2000 }
}, { timestamps: true });

moduleMessageSchema.index({ module: 1, createdAt: -1 });

module.exports = mongoose.model('ModuleMessage', moduleMessageSchema);
