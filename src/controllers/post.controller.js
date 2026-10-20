const CampusPost = require('../db/models/campusPost.model');

const validCategories = ['resource', 'lost-found', 'opportunity', 'notice'];

async function listPosts(req, res, next) {
  try {
    const { category, q } = req.query;
    const filter = {};
    if (category && category !== 'all') filter.category = category;
    if (req.user?.role !== 'admin') filter.status = 'approved';
    if (q) filter.$or = [
      { title: { $regex: q, $options: 'i' } },
      { body: { $regex: q, $options: 'i' } },
      { tags: { $regex: q, $options: 'i' } },
      { department: { $regex: q, $options: 'i' } }
    ];

    const posts = await CampusPost.find(filter)
      .sort({ featured: -1, createdAt: -1 })
      .populate('author', 'name department role');
    res.json({ posts });
  } catch (err) {
    next(err);
  }
}

async function createPost(req, res, next) {
  try {
    const { title, body, category, department, tags, link, location, contact, deadline } = req.body;
    if (!title || !body || !validCategories.includes(category)) {
      return res.status(400).json({ message: 'A title, description and valid category are required.' });
    }
    if (category === 'notice' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only campus administrators can publish notices.' });
    }
    if (category === 'opportunity' && !link) {
      return res.status(400).json({ message: 'Add the original listing or application link.' });
    }
    const post = await CampusPost.create({
      title, body, category, department, tags: Array.isArray(tags) ? tags : [],
      link, location, contact, deadline: deadline || null, author: req.user._id
    });
    await post.populate('author', 'name department role');
    res.status(201).json({ post });
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
    const allowed = ['title', 'body', 'department', 'tags', 'link', 'location', 'contact', 'deadline', 'status'];
    allowed.forEach((key) => {
      if (req.body[key] !== undefined && (key !== 'status' || req.user.role === 'admin')) {
        post[key] = req.body[key];
      }
    });
    await post.save();
    await post.populate('author', 'name department role');
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
    await post.deleteOne();
    res.json({ message: 'Post removed.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listPosts, createPost, updatePost, deletePost };