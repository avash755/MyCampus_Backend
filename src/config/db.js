const mongoose = require('mongoose');

async function connectDB() {
  const url = process.env.MONGODB_URI;
  await mongoose.connect(url);
  console.log('MongoDB connected');
}

module.exports = connectDB;