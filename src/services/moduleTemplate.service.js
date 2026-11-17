const ModuleTemplate = require('../db/models/moduleTemplate.model');
const ModuleOffering = require('../db/models/moduleOffering.model');
const LegacyModule = require('../db/models/module.model');
const ModuleRegistration = require('../db/models/moduleRegistration.model');
const User = require('../db/models/user.model');
const { MODULE_TEMPLATES } = require('../data/moduleCatalog');

async function ensureModuleTemplates() {
  await ModuleTemplate.bulkWrite(
    MODULE_TEMPLATES.map((template) => ({
      updateOne: {
        filter: { number: template.number },
        update: { $setOnInsert: template },
        upsert: true
      }
    })),
    { ordered: false }
  );
}

async function migratePublishedLegacyModules() {
  const legacyModules = await LegacyModule.find({ published: true }).lean();
  if (!legacyModules.length) return;
  await ModuleOffering.bulkWrite(
    legacyModules.map((module) => ({
      updateOne: {
        filter: { _id: module._id },
        update: {
          $setOnInsert: {
            _id: module._id,
            number: module.number || null,
            templateNumber: module.number || null,
            title: module.title,
            durationDays: module.durationDays,
            scheduleLabel: module.scheduleLabel,
            description: module.description || '',
            fee: module.fee ?? null,
            startsAt: module.startsAt,
            published: true,
            publishedBy: module.publishedBy || null,
            createdAt: module.createdAt,
            updatedAt: module.updatedAt
          }
        },
        upsert: true
      }
    })),
    { ordered: false }
  );
}

async function migrateLegacyModuleRegistrations() {
  // Prior registrations meant confirmed membership; keep those students accepted.
  await ModuleRegistration.updateMany(
    { status: { $exists: false } },
    { $set: { status: 'accepted' } }
  );
}

async function removeAdminModuleRegistrations() {
  const admins = await User.find({ role: 'admin' }).select('_id').lean();
  if (admins.length) await ModuleRegistration.deleteMany({ student: { $in: admins.map((admin) => admin._id) } });
}

module.exports = { ensureModuleTemplates, migratePublishedLegacyModules, migrateLegacyModuleRegistrations, removeAdminModuleRegistrations };
