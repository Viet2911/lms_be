import express from 'express';
import * as branchController from '../controllers/branchController.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = express.Router();

// Public (sau khi login)
router.get('/', authenticate, branchController.getAll);
router.get('/stats', authenticate, branchController.getStats);
router.get('/user/:userId', authenticate, branchController.getUserBranches);
router.get('/:id', authenticate, branchController.getById);

// Admin only
router.post('/', authenticate, authorize('ADMIN'), branchController.create);
router.put('/:id', authenticate, authorize('ADMIN'), branchController.update);
router.delete('/:id', authenticate, authorize('ADMIN'), branchController.remove);
router.put('/user/:userId', authenticate, authorize('ADMIN'), branchController.setUserBranches);

export default router;
