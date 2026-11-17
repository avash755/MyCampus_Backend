const router = require('express').Router();
const { protect, requireAdmin } = require('../middlewares/auth.middleware');
const {
  listModules, listAdminModules, createModule, getModule, updateModule,
  registerForModule, unregisterFromModule, listModuleRegistrations,
  reviewModuleRegistration, listMessages, sendMessage
} = require('../controllers/module.controller');

router.get('/', listModules);
router.get('/admin', protect, requireAdmin, listAdminModules);
router.post('/', protect, requireAdmin, createModule);
router.get('/:id/registrations', protect, requireAdmin, listModuleRegistrations);
router.patch('/:id/registrations/:registrationId', protect, requireAdmin, reviewModuleRegistration);
router.patch('/:id', protect, requireAdmin, updateModule);
router.get('/:id', protect, getModule);
router.post('/:id/registrations', protect, registerForModule);
router.delete('/:id/registrations', protect, unregisterFromModule);
router.get('/:id/messages', protect, listMessages);
router.post('/:id/messages', protect, sendMessage);

module.exports = router;
