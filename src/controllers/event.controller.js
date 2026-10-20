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
    if (!title || !description || !date || !location) {
      return res.status(400).json({ message: 'Title, description, date and location are required.' });
    }
    const event = await Event.create({
      title, category, description, date, time, location, coverTone,
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
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Event not found.' });
    const alreadyRegistered = event.attendees.some((id) => id.equals(req.user._id));
    if (alreadyRegistered) {
      event.attendees.pull(req.user._id);
    } else {
      event.attendees.addToSet(req.user._id);
    }
    await event.save();
    res.json({ registered: !alreadyRegistered, attendeeCount: event.attendees.length });
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