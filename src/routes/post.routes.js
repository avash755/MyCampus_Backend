const router = require('express').Router();
const {
  listPosts, myPosts, moderationQueue, createPost, updatePost, moderatePost, deletePost
} = require('../controllers/post.controller');
const { protect, requireAdmin } = require('../middlewares/auth.middleware');

router.get('/', protect, listPosts);
router.get('/mine', protect, myPosts);
router.get('/moderation', protect, requireAdmin, moderationQueue);
router.post('/', protect, createPost);
router.patch('/:id/moderation', protect, requireAdmin, moderatePost);
router.patch('/:id', protect, updatePost);
router.delete('/:id', protect, deletePost);

module.exports = router;

