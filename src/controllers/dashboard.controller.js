const Event = require('../db/models/event.model');
const CampusPost = require('../db/models/campusPost.model');

async function getSummary(req, res, next) {
  try {
    const today = new Date();
    const [eventCount, resourceCount, opportunityCount, lostFoundCount, upcomingEvents] = await Promise.all([
      Event.countDocuments({}),
      CampusPost.countDocuments({ category: 'resource', status: 'approved' }),
      CampusPost.countDocuments({ category: 'opportunity', status: 'approved' }),
      CampusPost.countDocuments({ category: 'lost-found', status: 'approved' }),
      Event.find({ date: { $gte: today } }).sort({ date: 1 }).limit(4).populate('organizer', 'name')
    ]);
    res.json({
      summary: { eventCount, resourceCount, opportunityCount, lostFoundCount },
      upcomingEvents
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSummary };