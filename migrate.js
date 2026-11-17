require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('./src/config/db');
const { ensureModuleTemplates, migratePublishedLegacyModules, migrateLegacyModuleRegistrations, removeAdminModuleRegistrations } = require('./src/services/moduleTemplate.service');
const { ensureEventExpiry } = require('./src/services/eventExpiry.service');
const { publishDirectCategories } = require('./src/services/contentPublishing.service');

async function migrate() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await connectDB();
  await ensureEventExpiry();
  await publishDirectCategories();
  await ensureModuleTemplates();
  await migratePublishedLegacyModules();
  await migrateLegacyModuleRegistrations();
  await removeAdminModuleRegistrations();
}

migrate()
  .then(() => console.log('MyCampus data migration finished.'))
  .catch((error) => {
    console.error('MyCampus migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
