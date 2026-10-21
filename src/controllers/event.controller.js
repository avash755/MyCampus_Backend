const Event = require('../db/models/event.model');

async function listEvents(req, res, next) {
  try {
    const { q, category } = req.query;
    const filter = {};
    if (category && category !== 'All') filter.category = category;
    if (q) filter.$or = [
      { title: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
      { location: { $regex: q, $options: 'i' } }
    ];

    const events = await Event.find(filter)
      .sort({ date: 1 })
      .populate('organizer', 'name department')
      .populate('attendees', '_id');
    res.json({ events });
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
    const eventDate = new Date(date);
    if (Number.isNaN(eventDate.getTime())) return res.status(400).json({ message: 'Enter a valid event date.' });
    if (eventDate <= new Date()) return res.status(400).json({ message: 'Choose a future date for the event.' });
    const capacity = rawCapacity === '' || rawCapacity === undefined || rawCapacity === null ? null : Number(rawCapacity);
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) {
      return res.status(400).json({ message: 'Capacity must be a whole number greater than zero.' });
    }
    const event = await Event.create({
      title, category, description, date: eventDate, time, location, coverTone, capacity,
      organizer: req.user._id
    });
    await event.populate('organizer', 'name department');
    res.status(201).json({ event });
  } catch (err) {
    next(err);
  }
}

async function registerForEvent(req, res, next) {
  try {
    const action = req.body.action === 'leave' ? 'leave' : 'join';
    const userId = req.user._id;
    if (action === 'leave') {
      const event = await Event.findOneAndUpdate(
        { _id: req.params.id, attendees: userId },
        { $pull: { attendees: userId } },
        { new: true, projection: { attendees: 1 } }
      );
      if (event) return res.json({ registered: false, attendeeCount: event.attendees.length });
      const exists = await Event.exists({ _id: req.params.id });
      if (!exists) return res.status(404).json({ message: 'Event not found.' });
      const current = await Event.findById(req.params.id).select('attendees');
      return res.json({ registered: false, attendeeCount: current.attendees.length });
    }

    const event = await Event.findOneAndUpdate({
      _id: req.params.id,
      date: { $gt: new Date() },
      attendees: { $ne: userId },
      $expr: {
        $or: [
          { $eq: [{ $ifNull: ['$capacity', null] }, null] },
          { $lt: [{ $size: { $ifNull: ['$attendees', []] } }, '$capacity'] }
        ]
      }
    }, { $addToSet: { attendees: userId } }, { new: true, projection: { attendees: 1 } });

    if (event) return res.json({ registered: true, attendeeCount: event.attendees.length });
    const current = await Event.findById(req.params.id).select('date capacity attendees');
    if (!current) return res.status(404).json({ message: 'Event not found.' });
    const alreadyRegistered = current.attendees.some((id) => id.equals(userId));
    if (alreadyRegistered) return res.json({ registered: true, attendeeCount: current.attendees.length });
    if (current.date <= new Date()) return res.status(400).json({ message: 'Registration has closed because this event has started.' });
    return res.status(409).json({ message: 'This event has reached its capacity.', attendeeCount: current.attendees.length });
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
