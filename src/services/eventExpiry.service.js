const Event = require('../db/models/event.model');
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

async function ensureEventExpiry() {
  const cursor = Event.find({ expiresAt: { $exists: false }, date: { $type: 'date' } }).select('_id date').lean().cursor();
  let operations = [];
  for await (const event of cursor) {
    operations.push({ updateOne: {
      filter: { _id: event._id, expiresAt: { $exists: false } },
      update: { $set: { expiresAt: new Date(event.date.getTime() + THIRTY_DAYS_MS) } }
    } });
    if (operations.length >= 500) { await Event.bulkWrite(operations, { ordered: false }); operations = []; }
  }
  if (operations.length) await Event.bulkWrite(operations, { ordered: false });
  await Event.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}

module.exports = { ensureEventExpiry };