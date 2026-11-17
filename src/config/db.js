const mongoose = require('mongoose');

async function connectDB() {
  const url = process.env.MONGODB_URI;
  if (!url) throw new Error('MONGODB_URI is required.');
  const options = process.env.MONGO_DB_NAME ? { dbName: process.env.MONGO_DB_NAME } : {};
  await mongoose.connect(url, options);
  console.log('MongoDB connected');
}

module.exports = connectDB;
