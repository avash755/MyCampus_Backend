const mongoose = require('mongoose');

const campusPostSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 140 },
  body: { type: String, required: true, trim: true, maxlength: 3000 },
  category: { type: String, enum: ['resource', 'lost-found', 'opportunity', 'notice'], required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  department: { type: String, trim: true, default: '' },
  tags: [{ type: String, trim: true }],
  link: { type: String, trim: true, default: '' },
  location: { type: String, trim: true, default: '' },
  contact: { type: String, trim: true, default: '' },
  deadline: { type: Date, default: null },
  status: { type: String, enum: ['pending', 'approved', 'closed'], default: 'approved' },
  featured: { type: Boolean, default: false }
}, { timestamps: true });

campusPostSchema.index({ category: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('CampusPost', campusPostSchema);