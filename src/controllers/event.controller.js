const mongoose = require('mongoose');
const Event = require('../db/models/event.model');
const User = require('../db/models/user.model');
const { escapeRegex, pagination } = require('../utils/security');

const eventCategories = ['Workshop', 'Community', 'Career', 'Social', 'Academic'];

function eventStatePipeline(id, userId) {
  return [
    { $match: { _id: new mongoose.Types.ObjectId(id) } },
    { $addFields: {
      attendeeCount: { $size: { $ifNull: ['$attendees', []] } },
      isRegistered: { $in: [new mongoose.Types.ObjectId(userId), { $ifNull: ['$attendees', []] }] }
    } },
    { $project: { attendees: 0 } }
  ];
}

async function getEventState(id, userId) {
  const [event] = await Event.aggregate(eventStatePipeline(id, userId));
  return event || null;
}

async function listEvents(req, res, next) {
  try {
    const { q, category } = req.query;
    const { page, limit, skip } = pagination(req.query);
    const filter = { date: { $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } };
    if (category && category !== 'All') {
      if (!eventCategories.includes(category)) return res.status(400).json({ message: 'Choose a valid event category.' });
      filter.category = category;
    }
    if (q) {
      if (String(q).length > 100) return res.status(400).json({ message: 'Search text must be 100 characters or fewer.' });
      const pattern = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ title: pattern }, { description: pattern }, { location: pattern }];
    }

    const userId = new mongoose.Types.ObjectId(req.user._id);
    const rows = await Event.aggregate([
      { $match: filter },
      { $addFields: {
        attendeeCount: { $size: { $ifNull: ['$attendees', []] } },
        isRegistered: { $in: [userId, { $ifNull: ['$attendees', []] }] }
      } },
      { $addFields: {
        registrationOpen: {
          $and: [
            { $gt: [{ $ifNull: ['$startsAt', '$date'] }, new Date()] },
            { $or: [
              { $eq: [{ $ifNull: ['$capacity', null] }, null] },
              { $lt: ['$attendeeCount', '$capacity'] }
            ] }
          ]
        }
      } },
      { $addFields: {
        sortAt: { $cond: ['$registrationOpen', { $toLong: '$date' }, { $multiply: [{ $toLong: '$date' }, -1] }] }
      } },
      { $sort: { registrationOpen: -1, sortAt: 1, _id: 1 } },
      { $skip: skip },
      { $limit: limit + 1 },
      { $lookup: {
        from: User.collection.name,
        localField: 'organizer',
        foreignField: '_id',
        pipeline: [{ $project: { name: 1, department: 1, avatarColor: 1, profileImage: 1 } }],
        as: 'organizer'
      } },
      { $unwind: { path: '$organizer', preserveNullAndEmptyArrays: true } },
      { $project: { attendees: 0, registrationOpen: 0, sortAt: 0 } }
    ]);
    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();
    res.json({ events: rows, pagination: { page, limit, hasMore } });
  } catch (err) {
    next(err);
  }
}

async function createEvent(req, res, next) {
  try {
    const { title, category, description, date, time, location, coverTone } = req.body;
    const rawCapacity = req.body.capacity;
    if (!title || !description || !date || !location) {
      return res.status(400).json({ message: 'Title, description, date and location are required.' });
    }
    if (category && !eventCategories.includes(category)) return res.status(400).json({ message: 'Choose a valid event category.' });
    const eventDate = new Date(date);
    if (Number.isNaN(eventDate.getTime())) return res.status(400).json({ message: 'Enter a valid event date.' });
    const startAt = req.body.startsAt ? new Date(req.body.startsAt) : eventDate;
    if (Number.isNaN(startAt.getTime())) return res.status(400).json({ message: 'Enter a valid event start time.' });
    if (startAt <= new Date()) return res.status(400).json({ message: 'Choose a future start time for the event.' });
    const capacity = rawCapacity === '' || rawCapacity === undefined || rawCapacity === null ? null : Number(rawCapacity);
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) {
      return res.status(400).json({ message: 'Capacity must be a whole number greater than zero.' });
    }
    const event = await Event.create({
      title, category, description, date: eventDate, startsAt: startAt,
      expiresAt: new Date(eventDate.getTime() + 30 * 24 * 60 * 60 * 1000),
      time, location, coverTone, capacity, organizer: req.user._id
    });
    await event.populate('organizer', 'name department avatarColor +profileImage');
    const responseEvent = event.toObject();
    delete responseEvent.attendees;
    responseEvent.attendeeCount = 0;
    responseEvent.isRegistered = false;
    res.status(201).json({ event: responseEvent });
  } catch (err) {
    next(err);
  }
}

async function registerForEvent(req, res, next) {
  try {
    const action = req.body.action === 'leave' ? 'leave' : 'join';
    const userId = req.user._id;
    if (action === 'leave') {
      await Event.updateOne({ _id: req.params.id, attendees: userId }, { $pull: { attendees: userId } });
      const current = await getEventState(req.params.id, userId);
      if (!current) return res.status(404).json({ message: 'Event not found.' });
      return res.json({ registered: false, attendeeCount: current.attendeeCount });
    }

    const update = await Event.updateOne({
      _id: req.params.id,
      attendees: { $ne: userId },
      $expr: {
        $and: [
          { $gt: [{ $ifNull: ['$startsAt', '$date'] }, new Date()] },
          { $or: [
            { $eq: [{ $ifNull: ['$capacity', null] }, null] },
            { $lt: [{ $size: { $ifNull: ['$attendees', []] } }, '$capacity'] }
          ] }
        ]
      }
    }, { $addToSet: { attendees: userId } });

    const current = await getEventState(req.params.id, userId);
    if (!current) return res.status(404).json({ message: 'Event not found.' });
    if (update.modifiedCount === 1 || current.isRegistered) {
      return res.json({ registered: true, attendeeCount: current.attendeeCount });
    }
    if ((current.startsAt || current.date) <= new Date()) {
      return res.status(400).json({ message: 'Registration has closed because this event has started.' });
    }
    return res.status(409).json({ message: 'This event has reached its capacity.', attendeeCount: current.attendeeCount });
  } catch (err) {
    next(err);
  }
}

async function deleteEvent(req, res, next) {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found.' });
    if (req.user.role !== 'admin' && !event.organizer.equals(req.user._id)) {
      return res.status(403).json({ message: 'You can only remove events you created.' });
    }
    await event.deleteOne();
    res.json({ message: 'Event removed.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listEvents, createEvent, registerForEvent, deleteEvent };
