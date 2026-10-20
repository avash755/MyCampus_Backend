const router = require('express').Router();
const { listPosts, createPost, updatePost, deletePost } = require('../controllers/post.controller');
const { protect } = require('../middlewares/auth.middleware');

router.get('/', listPosts);
router.post('/', protect, createPost);
router.patch('/:id', protect, updatePost);
router.delete('/:id', protect, deletePost);

module.exports = router;