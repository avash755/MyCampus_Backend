require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('./src/config/db');
const { ensureModuleTemplates } = require('./src/services/moduleTemplate.service');

async function seedModules() {
  await connectDB();
  await ensureModuleTemplates();
  console.log('Seeded 25 reusable MIST module topics.');
}

seedModules()
  .catch((err) => { console.error('Could not seed modules:', err); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
