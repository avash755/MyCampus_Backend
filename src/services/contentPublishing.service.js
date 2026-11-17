const CampusPost = require('../db/models/campusPost.model');
const Notification = require('../db/models/notification.model');

async function publishDirectCategories() {
  const pending = await CampusPost.find({ category: { $in: ['resource', 'lost-found'] }, status: 'pending' }).select('_id').lean();
  if (!pending.length) return;
  const postIds = pending.map((post) => post._id);
  await CampusPost.updateMany({ _id: { $in: postIds } }, { $set: { status: 'approved' } });
  await Notification.updateMany(
    { post: { $in: postIds }, type: 'post_pending', readAt: null },
    { $set: { readAt: new Date() } }
  );
}

module.exports = { publishDirectCategories };