const mongoose = require('mongoose');
const ModuleOffering = require('../db/models/moduleOffering.model');
const ModuleTemplate = require('../db/models/moduleTemplate.model');
const ModuleRegistration = require('../db/models/moduleRegistration.model');
const ModuleMessage = require('../db/models/moduleMessage.model');

const publishedFilter = { published: true };
const isValidObjectId = (id) => mongoose.isValidObjectId(id);

async function registrationCounts(offeringIds) {
  if (!offeringIds.length) return new Map();
  const resolvedStatus = { $ifNull: ['$status', 'accepted'] };
  const counts = await ModuleRegistration.aggregate([
    { $match: { module: { $in: offeringIds } } },
    { $group: {
      _id: '$module',
      accepted: { $sum: { $cond: [{ $eq: [resolvedStatus, 'accepted'] }, 1, 0] } },
      pending: { $sum: { $cond: [{ $eq: [resolvedStatus, 'pending'] }, 1, 0] } },
      total: { $sum: { $cond: [{ $in: [resolvedStatus, ['accepted', 'pending']] }, 1, 0] } }
    } }
  ]);
  return new Map(counts.map((item) => [String(item._id), item]));
}

function withCounts(offerings, counts) {
  return offerings.map((item) => {
    const count = counts.get(String(item._id)) || { accepted: 0, pending: 0, total: 0 };
    return {
      ...item,
      registrationCount: count.accepted,
      acceptedRegistrationCount: count.accepted,
      pendingRegistrationCount: count.pending,
      totalRegistrationRequests: count.total
    };
  });
}

function readStartDate(value) {
  if (value === undefined) return { valid: true, value: undefined };
  if (value === '' || value === null) return { valid: true, value: null };
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? { valid: true, value: date } : { valid: false };
}

function readFee(value) {
  if (value === undefined) return { valid: true, value: undefined };
  if (value === '' || value === null) return { valid: true, value: null };
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? { valid: true, value: amount } : { valid: false };
}

async function listModules(req, res, next) {
  try {
    const offerings = await ModuleOffering.find(publishedFilter).sort({ startsAt: 1, number: 1 }).lean();
    const counts = await registrationCounts(offerings.map((item) => item._id));
    res.json({ modules: withCounts(offerings, counts) });
  } catch (err) { next(err); }
}

async function listAdminModules(req, res, next) {
  try {
    const [templates, offerings] = await Promise.all([
      ModuleTemplate.find().sort({ number: 1 }).lean(),
      ModuleOffering.find().sort({ startsAt: 1, createdAt: -1 }).lean()
    ]);
    const counts = await registrationCounts(offerings.map((item) => item._id));
    res.json({ templates, offerings: withCounts(offerings, counts) });
  } catch (err) { next(err); }
}

async function createModule(req, res, next) {
  try {
    const rawNumber = req.body.templateNumber;
    const templateNumber = rawNumber === undefined || rawNumber === null || rawNumber === '' ? null : Number(rawNumber);
    if (templateNumber !== null && (!Number.isInteger(templateNumber) || templateNumber < 1 || templateNumber > 25)) {
      return res.status(400).json({ message: 'Choose one of the 25 module topics or create a custom module.' });
    }

    const template = templateNumber === null ? null : await ModuleTemplate.findOne({ number: templateNumber }).lean();
    if (templateNumber !== null && !template) {
      return res.status(404).json({ message: 'That module topic is missing. Seed the module catalogue first.' });
    }
    const title = String(req.body.title || template?.title || '').trim();
    if (!title) return res.status(400).json({ message: 'Enter a title for the custom module.' });
    if (title.length > 180) return res.status(400).json({ message: 'Module titles can be up to 180 characters.' });

    const durationDays = Number(req.body.durationDays ?? template?.durationDays ?? 1);
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365) {
      return res.status(400).json({ message: 'Duration must be a whole number from 1 to 365 days.' });
    }
    const scheduleLabel = String(req.body.scheduleLabel ?? template?.scheduleLabel ?? '').trim();
    if (scheduleLabel.length > 80) return res.status(400).json({ message: 'The daily schedule can be up to 80 characters.' });
    const description = String(req.body.description || '').trim();
    if (description.length > 2000) return res.status(400).json({ message: 'Module details can be up to 2,000 characters.' });

    const start = readStartDate(req.body.startsAt);
    if (!start.valid) return res.status(400).json({ message: 'Enter a valid start date and time.' });
    const fee = readFee(req.body.fee);
    if (!fee.valid) return res.status(400).json({ message: 'Fee must be zero or a positive amount.' });
    const published = req.body.published === true;
    if (req.body.published !== undefined && typeof req.body.published !== 'boolean') {
      return res.status(400).json({ message: 'Publish status must be true or false.' });
    }
    if (published && !start.value) return res.status(400).json({ message: 'Set a start date and time before publishing this module.' });
    if (published && start.value <= new Date()) return res.status(400).json({ message: 'Choose a future start time before publishing this module.' });

    const module = await ModuleOffering.create({
      number: templateNumber,
      templateNumber,
      title,
      durationDays,
      scheduleLabel,
      description,
      fee: fee.value ?? null,
      startsAt: start.value ?? null,
      published,
      publishedBy: published ? req.user._id : null
    });
    res.status(201).json({ module: { ...module.toObject(), registrationCount: 0 } });
  } catch (err) { next(err); }
}

async function getModule(req, res, next) {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid module id.' });
    const module = await ModuleOffering.findOne({ _id: req.params.id, ...publishedFilter }).lean();
    if (!module) return res.status(404).json({ message: 'Module not found.' });
    const [counts, registration] = await Promise.all([
      registrationCounts([module._id]),
      req.user.role === 'admin' ? Promise.resolve(null) : ModuleRegistration.findOne({ module: module._id, student: req.user._id }).lean()
    ]);
    const countInfo = withCounts([module], counts)[0];
    const registrationStatus = registration ? (registration.status || 'accepted') : null;
    res.json({ module: { ...countInfo, registrationStatus, isRegistered: ['pending', 'accepted'].includes(registrationStatus) } });
  } catch (err) { next(err); }
}

async function updateModule(req, res, next) {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid module id.' });
    const module = await ModuleOffering.findById(req.params.id);
    if (!module) return res.status(404).json({ message: 'Module not found.' });
    const wasPublished = module.published;
    const previousStartMs = module.startsAt ? module.startsAt.getTime() : null;
    const { title, durationDays, scheduleLabel, description, fee, startsAt, published } = req.body;

    if (title !== undefined) {
      const nextTitle = String(title).trim();
      if (!nextTitle || nextTitle.length > 180) return res.status(400).json({ message: 'Enter a module title up to 180 characters.' });
      module.title = nextTitle;
    }
    if (durationDays !== undefined) {
      const days = Number(durationDays);
      if (!Number.isInteger(days) || days < 1 || days > 365) return res.status(400).json({ message: 'Duration must be a whole number from 1 to 365 days.' });
      module.durationDays = days;
    }
    if (scheduleLabel !== undefined) {
      const label = String(scheduleLabel).trim();
      if (label.length > 80) return res.status(400).json({ message: 'The daily schedule can be up to 80 characters.' });
      module.scheduleLabel = label;
    }
    if (description !== undefined) {
      const details = String(description).trim();
      if (details.length > 2000) return res.status(400).json({ message: 'Module details can be up to 2,000 characters.' });
      module.description = details;
    }
    if (fee !== undefined) {
      const nextFee = readFee(fee);
      if (!nextFee.valid) return res.status(400).json({ message: 'Fee must be zero or a positive amount.' });
      module.fee = nextFee.value;
    }
    if (startsAt !== undefined) {
      const nextStart = readStartDate(startsAt);
      if (!nextStart.valid) return res.status(400).json({ message: 'Enter a valid start date and time.' });
      module.startsAt = nextStart.value;
    }
    if (published !== undefined) {
      if (typeof published !== 'boolean') return res.status(400).json({ message: 'Publish status must be true or false.' });
      module.published = published;
    }
    if (module.published && !module.startsAt) return res.status(400).json({ message: 'Set a start date and time before publishing this module.' });
    const startChanged = (module.startsAt ? module.startsAt.getTime() : null) !== previousStartMs;
    if (module.published && (!wasPublished || startChanged) && module.startsAt <= new Date()) {
      return res.status(400).json({ message: 'Choose a future start time before publishing this module.' });
    }
    module.publishedBy = module.published ? req.user._id : null;
    await module.save();
    const counts = await registrationCounts([module._id]);
    const moduleWithCounts = withCounts([module.toObject()], counts)[0];
    res.json({ module: moduleWithCounts });
  } catch (err) { next(err); }
}

async function registerForModule(req, res, next) {
  try {
    if (req.user.role === 'admin') return res.status(403).json({ message: 'Administrators manage modules and cannot register as students.' });
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid module id.' });
    const module = await ModuleOffering.findOne({ _id: req.params.id, ...publishedFilter });
    if (!module) return res.status(404).json({ message: 'Module not found.' });
    if (module.startsAt && module.startsAt <= new Date()) {
      return res.status(400).json({ message: 'Registration has closed because this module has started.' });
    }

    let registration = await ModuleRegistration.findOne({ module: module._id, student: req.user._id });
    if (registration && registration.status !== 'rejected') {
      const status = registration.status || 'accepted';
      const counts = await registrationCounts([module._id]);
      const countInfo = withCounts([module], counts)[0];
      return res.json({ registered: true, status, ...countInfo });
    }
    if (registration) {
      registration.status = 'pending';
      registration.reviewedBy = null;
      registration.reviewedAt = null;
      await registration.save();
    } else {
      registration = await ModuleRegistration.create({ module: module._id, student: req.user._id, status: 'pending' });
    }
    const counts = await registrationCounts([module._id]);
    const countInfo = withCounts([module], counts)[0];
    res.json({ registered: true, status: 'pending', ...countInfo });
  } catch (err) {
    if (err.code === 11000) {
      const registration = await ModuleRegistration.findOne({ module: req.params.id, student: req.user._id }).lean();
      const counts = await registrationCounts([new mongoose.Types.ObjectId(req.params.id)]);
      const countInfo = withCounts([{ _id: req.params.id }], counts)[0];
      return res.json({ registered: true, status: registration?.status || 'accepted', ...countInfo });
    }
    next(err);
  }
}

async function unregisterFromModule(req, res, next) {
  try {
    if (req.user.role === 'admin') return res.status(403).json({ message: 'Administrators manage modules and cannot register as students.' });
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid module id.' });
    const registration = await ModuleRegistration.findOne({ module: req.params.id, student: req.user._id });
    if (registration && (registration.status || 'accepted') === 'accepted') {
      return res.status(409).json({ message: 'Your registration is accepted and can no longer be cancelled in MyCampus. Contact the campus admin if you need help.' });
    }
    if (registration) await registration.deleteOne();
    const counts = await registrationCounts([new mongoose.Types.ObjectId(req.params.id)]);
    const countInfo = withCounts([{ _id: req.params.id }], counts)[0];
    res.json({ registered: false, status: null, ...countInfo });
  } catch (err) { next(err); }
}

async function listModuleRegistrations(req, res, next) {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid module id.' });
    const module = await ModuleOffering.findById(req.params.id).select('_id');
    if (!module) return res.status(404).json({ message: 'Module not found.' });
    const registrations = await ModuleRegistration.find({ module: module._id })
      .sort({ createdAt: 1 })
      .populate('student', 'name studentId department avatarColor')
      .lean();
    res.json({ registrations: registrations.map((item) => ({ ...item, status: item.status || 'accepted' })) });
  } catch (err) { next(err); }
}

async function reviewModuleRegistration(req, res, next) {
  try {
    if (!isValidObjectId(req.params.id) || !isValidObjectId(req.params.registrationId)) {
      return res.status(400).json({ message: 'Invalid module or registration id.' });
    }
    const status = String(req.body.status || '');
    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Choose accept or decline for this request.' });
    }
    const registration = await ModuleRegistration.findOne({ _id: req.params.registrationId, module: req.params.id });
    if (!registration) return res.status(404).json({ message: 'Registration request not found.' });
    const currentStatus = registration.status || 'accepted';
    if (currentStatus !== 'pending' && currentStatus !== status) {
      return res.status(409).json({ message: 'This request has already been reviewed.' });
    }
    if (currentStatus === 'pending') {
      registration.status = status;
      registration.reviewedBy = req.user._id;
      registration.reviewedAt = new Date();
      await registration.save();
    }
    await registration.populate('student', 'name studentId department avatarColor');
    res.json({ registration: { ...registration.toObject(), status } });
  } catch (err) { next(err); }
}

async function listMessages(req, res, next) {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid module id.' });
    const module = await ModuleOffering.findOne({ _id: req.params.id, ...publishedFilter }).select('_id');
    if (!module) return res.status(404).json({ message: 'Module not found.' });
    const member = req.user.role === 'admin' || await ModuleRegistration.exists({ module: module._id, student: req.user._id, status: 'accepted' });
    if (!member) return res.status(403).json({ message: 'Your registration must be accepted before you can open this module group.' });
    const filter = { module: module._id };
    const after = req.query.after;
    if (after !== undefined) {
      const afterDate = new Date(after);
      if (!Number.isFinite(afterDate.getTime())) return res.status(400).json({ message: 'Enter a valid message cursor.' });
      if (req.query.afterId && !isValidObjectId(req.query.afterId)) return res.status(400).json({ message: 'Enter a valid message cursor.' });
      filter.$or = req.query.afterId
        ? [{ createdAt: { $gt: afterDate } }, { createdAt: afterDate, _id: { $gt: req.query.afterId } }]
        : [{ createdAt: { $gt: afterDate } }];
    }
    const messages = await ModuleMessage.find(filter)
      .sort(after === undefined ? { createdAt: -1, _id: -1 } : { createdAt: 1, _id: 1 })
      .limit(after === undefined ? 60 : 100).populate('sender', 'name role').lean();
    res.json({ messages: after === undefined ? messages.reverse() : messages });
  } catch (err) { next(err); }
}

async function sendMessage(req, res, next) {
  try {
    if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid module id.' });
    const body = String(req.body.body || '').trim();
    if (!body) return res.status(400).json({ message: 'Write a message before sending.' });
    if (body.length > 2000) return res.status(400).json({ message: 'Messages can be up to 2,000 characters.' });
    const module = await ModuleOffering.findOne({ _id: req.params.id, ...publishedFilter }).select('_id');
    if (!module) return res.status(404).json({ message: 'Module not found.' });
    const member = req.user.role === 'admin' || await ModuleRegistration.exists({ module: module._id, student: req.user._id, status: 'accepted' });
    if (!member) return res.status(403).json({ message: 'Your registration must be accepted before you can use this module group.' });
    const message = await ModuleMessage.create({ module: module._id, sender: req.user._id, body });
    await message.populate('sender', 'name role');
    res.status(201).json({ message });
  } catch (err) { next(err); }
}

module.exports = { listModules, listAdminModules, createModule, getModule, updateModule, registerForModule, unregisterFromModule, listModuleRegistrations, reviewModuleRegistration, listMessages, sendMessage };




