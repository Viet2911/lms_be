import express from 'express';
import * as leadController from '../controllers/leadController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Tất cả routes cần đăng nhập
router.use(authenticate);

// CRUD cơ bản
router.get('/', leadController.getAll);
router.get('/stats', leadController.getStats);
router.get('/month', leadController.getByMonth);
router.get('/check-phone', leadController.checkPhone);
router.get('/:id', leadController.getById);
router.post('/', leadController.create);
router.put('/:id', leadController.update);
router.delete('/:id', leadController.remove);

// Actions
router.post('/:id/attended', leadController.markAttended);
router.post('/:id/no-show', leadController.markNoShow);
router.post('/:id/assign-class', leadController.assignTrialClass);
router.post('/:id/convert', leadController.convertToStudent);

// Call logs
router.post('/:id/call-log', leadController.addCallLog);
router.get('/:id/call-logs', leadController.getCallLogs);

export default router;