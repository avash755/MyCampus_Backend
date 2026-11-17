const CampusPost = require('../db/models/campusPost.model');
const Notification = require('../db/models/notification.model');
const User = require('../db/models/user.model');
const { escapeRegex, pagination, safeHttpUrl } = require('../utils/security');

const validCategories = ['resource', 'lost-found', 'opportunity', 'notice'];

async function notifyAdmins(post, message) {
  const admins = await User.find({ role: 'admin' }).select('_id').lean();
  if (!admins.length) return;
  await Notification.insertMany(admins.map(({ _id }) => ({
    recipient: _id,
    type: 'post_pending',
    post: post._id,
    postTitle: post.title,
    postCategory: post.category,
    message
  })));
}

async function listPosts(req, res, next) {
  try {
    const { category, q } = req.query;
    const { page, limit, skip } = pagination(req.query);
    const filter = { status: 'approved' };
    if (category && category !== 'all') {
      if (!validCategories.includes(category)) return res.status(400).json({ message: 'Choose a valid post category.' });
      filter.category = category;
    }
    if (q) {
      if (String(q).length > 100) return res.status(400).json({ message: 'Search text must be 100 characters or fewer.' });
      const pattern = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ title: pattern }, { body: pattern }, { tags: pattern }, { department: pattern }];
    }

    const posts = await CampusPost.find(filter)
      .sort({ featured: -1, createdAt: -1 })
      .skip(skip).limit(limit + 1)
      .populate('author', 'name department role avatarColor +profileImage');
    const hasMore = posts.length > limit;
    if (hasMore) posts.pop();
    res.json({ posts, pagination: { page, limit, hasMore } });
  } catch (err) {
    next(err);
  }
}

async function myPosts(req, res, next) {
  try {
    const { page, limit, skip } = pagination(req.query);
    const posts = await CampusPost.find({ author: req.user._id })
      .sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit + 1)
      .populate('author', 'name department role avatarColor +profileImage');
    const hasMore = posts.length > limit;
    if (hasMore) posts.pop();
    res.json({ posts, pagination: { page, limit, hasMore } });
  } catch (err) {
    next(err);
  }
}

async function moderationQueue(req, res, next) {
  try {
    const statuses = ['pending', 'approved', 'rejected', 'closed'];
    const status = statuses.includes(req.query.status) ? req.query.status : 'pending';
    const { page, limit, skip } = pagination(req.query);
    const posts = await CampusPost.find({ status })
      .sort({ createdAt: 1, _id: 1 }).skip(skip).limit(limit + 1)
      .populate('author', 'name department role avatarColor +profileImage');
    const hasMore = posts.length > limit;
    if (hasMore) posts.pop();
    res.json({ posts, pagination: { page, limit, hasMore } });
  } catch (err) {
    next(err);
  }
}

async function createPost(req, res, next) {
  try {
    const { title, body, category, itemStatus, department, tags, link, location, contact, deadline } = req.body;
    if (!title || !body || !validCategories.includes(category)) {
      return res.status(400).json({ message: 'A title, description and valid category are required.' });
    }
    if (category === 'notice' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only campus administrators can publish notices.' });
    }
    if (category === 'opportunity' && !link) {
      return res.status(400).json({ message: 'Add the original listing or application link.' });
    }
    if (category === 'lost-found' && !['lost', 'found'].includes(itemStatus)) {
      return res.status(400).json({ message: 'Choose whether this item was lost or found.' });
    }
    const safeLink = link === undefined || link === '' ? '' : safeHttpUrl(link);
    if (safeLink === null) return res.status(400).json({ message: 'Links must start with https:// or http://.' });
    const post = await CampusPost.create({
      title, body, category, itemStatus: category === 'lost-found' ? itemStatus : undefined,
      department, tags: Array.isArray(tags) ? tags : [],
      link: safeLink, location, contact, deadline: deadline || null, author: req.user._id,
      status: req.user.role === 'admin' || ['resource', 'lost-found'].includes(category) ? 'approved' : 'pending'
    });
    if (post.status === 'pending') {
      try {
        await notifyAdmins(post, `${req.user.name} submitted a post for review.`);
      } catch (notificationError) {
        console.error('Could not notify administrators about a pending post:', notificationError.message);
      }
    }
    await post.populate('author', 'name department role avatarColor +profileImage');
    res.status(201).json({ post, message: post.status === 'pending' ? 'Your post is awaiting administrator review.' : 'Your post is published.' });
  } catch (err) {
    next(err);
  }
}

async function updatePost(req, res, next) {
  try {
    const post = await CampusPost.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found.' });
    const isOwner = post.author.equals(req.user._id);
    if (req.user.role !== 'admin' && !isOwner) {
      return res.status(403).json({ message: 'You can only update your own posts.' });
    }
    const allowed = ['title', 'body', 'department', 'tags', 'link', 'location', 'contact', 'deadline'];
    if (req.body.itemStatus !== undefined && post.category === 'lost-found') {
      if (!['lost', 'found'].includes(req.body.itemStatus)) {
        return res.status(400).json({ message: 'Choose whether this item was lost or found.' });
      }
      post.itemStatus = req.body.itemStatus;
    }
    if (req.body.link !== undefined) {
      const safeLink = req.body.link === '' ? '' : safeHttpUrl(req.body.link);
      if (safeLink === null) return res.status(400).json({ message: 'Links must start with https:// or http://.' });
      post.link = safeLink;
    }
    allowed.filter((key) => key !== 'link').forEach((key) => {
      if (req.body[key] !== undefined) post[key] = req.body[key];
    });
    const wasRejected = isOwner && req.user.role !== 'admin' && post.status === 'rejected';
    if (wasRejected) post.status = 'pending';
    await post.save();
    if (wasRejected) {
      try {
        await notifyAdmins(post, `${req.user.name} updated a rejected post and requested another review.`);
      } catch (notificationError) {
        console.error('Could not notify administrators about a resubmitted post:', notificationError.message);
      }
    }
    await post.populate('author', 'name department role avatarColor +profileImage');
    res.json({ post });
  } catch (err) {
    next(err);
  }
}

async function moderatePost(req, res, next) {
  try {
    const post = await CampusPost.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found.' });
    const { action } = req.body;
    const previousStatus = post.status;
    if (['approve', 'reject', 'close'].includes(action)) {
      post.status = { approve: 'approved', reject: 'rejected', close: 'closed' }[action];
    } else if (action === 'feature' && typeof req.body.featured === 'boolean') {
      post.featured = req.body.featured;
    } else {
      return res.status(400).json({ message: 'Choose approve, reject, close, or set featured.' });
    }
    await post.save();

    if (['approved', 'rejected'].includes(post.status) && previousStatus !== post.status) {
      try {
        const approved = post.status === 'approved';
        await Notification.create({
          recipient: post.author,
          type: approved ? 'post_approved' : 'post_rejected',
          post: post._id,
          postTitle: post.title,
          postCategory: post.category,
          message: approved ? 'Your post was approved and is now visible on the campus board.' : 'Your post was not approved. Please review it and contact an administrator if you need help.'
        });
      } catch (notificationError) {
        console.error('Could not notify the post author about moderation:', notificationError.message);
      }
    }
    if (previousStatus === 'pending' && post.status !== 'pending') {
      try {
        await Notification.updateMany(
          { post: post._id, type: 'post_pending', readAt: null },
          { $set: { readAt: new Date() } }
        );
      } catch (notificationError) {
        console.error('Could not clear pending-post notifications:', notificationError.message);
      }
    }
    await post.populate('author', 'name department role avatarColor +profileImage');
    res.json({ post });
  } catch (err) {
    next(err);
  }
}

async function deletePost(req, res, next) {
  try {
    const post = await CampusPost.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found.' });
    if (req.user.role !== 'admin' && !post.author.equals(req.user._id)) {
      return res.status(403).json({ message: 'You can only remove your own posts.' });
    }
    await Promise.all([
      post.deleteOne(),
      Notification.deleteMany({ post: post._id })
    ]);
    res.json({ message: 'Post removed.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listPosts, myPosts, moderationQueue, createPost, updatePost, moderatePost, deletePost };
