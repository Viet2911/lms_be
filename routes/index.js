import { Router } from 'express';
import { authenticate, authorize, authorizeRole } from '../middleware/auth.js';
import { upload } from '../config/cloudinary.js';

// Controllers
import * as auth from '../controllers/authController.js';
import * as user from '../controllers/userController.js';
import * as branch from '../controllers/branchController.js';
import * as student from '../controllers/studentController.js';
import * as cls from '../controllers/classController.js';
import * as experience from '../controllers/experienceController.js';
import * as trial from '../controllers/trialController.js';
import * as lead from '../controllers/leadController.js';
import * as session from '../controllers/sessionController.js';
import * as attendance from '../controllers/attendanceController.js';
import * as assignment from '../controllers/assignmentController.js';
import * as file from '../controllers/fileController.js';
import * as common from '../controllers/commonController.js';
import * as dashboard from '../controllers/dashboardController.js';
// import * as enrollment from '../controllers/enrollmentController.js'; // Requires: npm install docx node-fetch

const router = Router();

// AUTH
router.post('/auth/login', auth.login);
router.get('/auth/me', authenticate, auth.me);
router.put('/auth/password', authenticate, auth.changePassword);
router.put('/auth/profile', authenticate, auth.updateProfile);

// BRANCHES
router.get('/branches', authenticate, branch.getAll);
router.get('/branches/stats', authenticate, branch.getStats);
router.get('/branches/user/:userId', authenticate, branch.getUserBranches);
router.get('/branches/:id', authenticate, branch.getById);
router.post('/branches', authenticate, authorizeRole('ADMIN'), branch.create);
router.put('/branches/:id', authenticate, authorizeRole('ADMIN'), branch.update);
router.delete('/branches/:id', authenticate, authorizeRole('ADMIN'), branch.remove);
router.put('/branches/user/:userId', authenticate, authorizeRole('ADMIN'), branch.setUserBranches);

// USERS
router.get('/users', authenticate, authorize('user.view'), user.getAll);
router.get('/users/roles', authenticate, user.getRoles);
router.get('/users/by-role/:role', authenticate, user.getByRole);
router.get('/users/:id', authenticate, authorize('user.view'), user.getById);
router.post('/users', authenticate, authorize('user.create'), user.create);
router.put('/users/:id', authenticate, authorize('user.edit'), user.update);
router.put('/users/:id/reset-password', authenticate, authorize('user.edit'), user.resetPassword);
router.delete('/users/:id', authenticate, authorize('user.delete'), user.remove);

// STUDENTS
router.get('/students', authenticate, authorize('student.view'), student.getAll);
router.get('/students/stats', authenticate, authorize('student.view'), student.getStats);
router.get('/students/:id', authenticate, authorize('student.view'), student.getById);
router.post('/students', authenticate, authorizeRole('SALE', 'ADMIN'), student.create);
router.put('/students/:id', authenticate, authorizeRole('SALE', 'ADMIN'), student.update);
router.put('/students/:id/status', authenticate, authorizeRole('EC', 'SALE', 'HOEC', 'CM', 'ADMIN'), student.changeStatus);
router.post('/students/:id/confirm-payment', authenticate, authorizeRole('EC', 'SALE', 'HOEC', 'CM', 'ADMIN'), student.confirmPayment);
router.delete('/students/:id', authenticate, authorizeRole('SALE', 'ADMIN'), student.remove);

// ENROLLMENT FORMS & QR
router.get('/enrollment/:studentId/form', authenticate, authorizeRole('EC', 'SALE', 'HOEC', 'CM', 'ADMIN'), student.getEnrollmentForm);
router.get('/enrollment/:studentId/preview', authenticate, student.getEnrollmentPreview);

// CLASSES
// CLASSES
const classViewRoles = ['EC', 'SALE', 'HOEC', 'OM', 'CM', 'TEACHER', 'ADMIN'];
router.get('/classes', authenticate, authorizeRole(...classViewRoles), cls.getAll);
router.get('/classes/stats', authenticate, cls.getStats);
router.get('/classes/:id', authenticate, authorizeRole(...classViewRoles), cls.getById);
router.get('/classes/:id/students', authenticate, authorizeRole(...classViewRoles), cls.getStudents);
router.post('/classes', authenticate, authorizeRole('CM', 'ADMIN'), cls.create);
router.put('/classes/:id', authenticate, authorizeRole('CM', 'ADMIN'), cls.update);
router.delete('/classes/:id', authenticate, authorizeRole('ADMIN'), cls.remove);
router.post('/classes/:id/students', authenticate, authorizeRole('CM', 'ADMIN'), cls.addStudent);
router.delete('/classes/:id/students/:studentId', authenticate, authorizeRole('CM', 'ADMIN'), cls.removeStudent);

// EXPERIENCE
router.get('/experience', authenticate, authorizeRole('SALE'), experience.getAll);
router.get('/experience/stats', authenticate, authorizeRole('SALE'), experience.getStats);
router.get('/experience/month', authenticate, authorizeRole('SALE'), experience.getByMonth);
router.get('/experience/:id', authenticate, authorizeRole('SALE'), experience.getById);
router.post('/experience', authenticate, authorizeRole('SALE'), experience.create);
router.put('/experience/:id', authenticate, authorizeRole('SALE'), experience.update);
router.delete('/experience/:id', authenticate, authorizeRole('SALE'), experience.remove);
router.post('/experience/:id/convert', authenticate, authorizeRole('SALE'), experience.convertToStudent);

// TRIAL (Legacy - sẽ được thay thế bởi leads)
router.get('/trial-students', authenticate, authorizeRole('SALE'), trial.getAll);
router.get('/trial-students/stats', authenticate, authorizeRole('SALE'), trial.getStats);
router.get('/trial-students/:id', authenticate, authorizeRole('SALE'), trial.getById);
router.post('/trial-students', authenticate, authorizeRole('SALE'), trial.create);
router.put('/trial-students/:id', authenticate, authorizeRole('SALE'), trial.update);
router.post('/trial-students/:id/convert', authenticate, authorizeRole('SALE'), trial.convert);
router.delete('/trial-students/:id', authenticate, authorizeRole('SALE'), trial.remove);

// LEADS (Gộp trải nghiệm + học thử)
// EC, SALE, HOEC, OM, ADMIN được truy cập
const leadRoles = ['EC', 'SALE', 'HOEC', 'OM', 'ADMIN'];
router.get('/leads', authenticate, authorizeRole(...leadRoles), lead.getAll);
router.get('/leads/stats', authenticate, authorizeRole(...leadRoles), lead.getStats);
router.get('/leads/month', authenticate, authorizeRole(...leadRoles), lead.getByMonth);
router.get('/leads/check-phone', authenticate, authorizeRole(...leadRoles), lead.checkPhone);
router.get('/leads/:id', authenticate, authorizeRole(...leadRoles), lead.getById);
router.post('/leads', authenticate, authorizeRole(...leadRoles), lead.create);
router.put('/leads/:id', authenticate, authorizeRole(...leadRoles), lead.update);
router.delete('/leads/:id', authenticate, authorizeRole('HOEC', 'OM', 'ADMIN'), lead.remove); // Chỉ manager được xóa
router.post('/leads/:id/attended', authenticate, authorizeRole(...leadRoles), lead.markAttended);
router.post('/leads/:id/no-show', authenticate, authorizeRole(...leadRoles), lead.markNoShow);
router.post('/leads/:id/complete-session', authenticate, authorizeRole(...leadRoles), lead.completeSession);
router.post('/leads/:id/schedule', authenticate, authorizeRole(...leadRoles), lead.assignTrialClass); // Đặt lịch trải nghiệm
router.post('/leads/:id/assign-class', authenticate, authorizeRole(...leadRoles), lead.assignTrialClass); // Legacy alias
router.post('/leads/:id/convert', authenticate, authorizeRole(...leadRoles), lead.convertToStudent);
router.post('/leads/:id/call-log', authenticate, authorizeRole(...leadRoles), lead.addCallLog);
router.get('/leads/:id/call-logs', authenticate, authorizeRole(...leadRoles), lead.getCallLogs);

// SESSIONS
router.get('/sessions', authenticate, authorize('session.view'), session.getAll);
router.get('/sessions/today', authenticate, session.getToday);
router.get('/sessions/:id', authenticate, authorize('session.view'), session.getById);
router.post('/sessions', authenticate, authorizeRole('CM', 'ADMIN'), session.create);
router.post('/sessions/generate', authenticate, authorizeRole('CM', 'ADMIN'), session.generate);
router.put('/sessions/:id', authenticate, authorizeRole('CM', 'ADMIN', 'TEACHER'), session.update);
router.delete('/sessions/:id', authenticate, authorizeRole('ADMIN'), session.remove);

// ATTENDANCE
router.get('/attendance/session/:sessionId', authenticate, attendance.getSessionAttendance);
router.get('/attendance/session/:sessionId/students', authenticate, attendance.getStudentsForSession);
router.post('/attendance/session/:sessionId/mark', authenticate, authorizeRole('TEACHER', 'CM', 'OM', 'HOEC', 'ADMIN'), attendance.markAttendance);
router.get('/attendance/class/:classId/report', authenticate, attendance.getClassReport);
router.get('/attendance/warnings', authenticate, attendance.getStudentsWithWarnings);
router.put('/attendance/:id', authenticate, authorizeRole('TEACHER', 'CM', 'OM', 'HOEC', 'ADMIN'), attendance.update);

// ASSIGNMENTS
router.get('/assignments', authenticate, authorize('assignment.view'), assignment.getAll);
router.get('/assignments/:id', authenticate, authorize('assignment.view'), assignment.getById);
router.get('/assignments/:id/submissions', authenticate, assignment.getSubmissions);
router.post('/assignments', authenticate, authorizeRole('TEACHER', 'CM', 'ADMIN'), assignment.create);
router.put('/assignments/:id', authenticate, authorizeRole('TEACHER', 'CM', 'ADMIN'), assignment.update);
router.delete('/assignments/:id', authenticate, authorizeRole('TEACHER', 'CM', 'ADMIN'), assignment.remove);
router.post('/assignments/:submissionId/grade', authenticate, authorizeRole('TEACHER', 'ADMIN'), assignment.grade);

// FILES (Cloudinary)
router.get('/files', authenticate, file.getAll);
router.get('/files/:id', authenticate, file.getById);
router.post('/files/upload', authenticate, upload.array('files', 10), file.upload);
router.delete('/files/:id', authenticate, file.remove);

// COMMON - SUBJECTS
router.get('/common/subjects', authenticate, common.getSubjects);
router.get('/common/subjects/:id', authenticate, common.getSubjectById);
router.post('/common/subjects', authenticate, authorizeRole('ADMIN'), common.createSubject);
router.put('/common/subjects/:id', authenticate, authorizeRole('ADMIN'), common.updateSubject);
router.delete('/common/subjects/:id', authenticate, authorizeRole('ADMIN'), common.deleteSubject);

// COMMON - LEVELS
router.get('/common/levels', authenticate, common.getLevels);
router.get('/common/levels/:id', authenticate, common.getLevelById);
router.post('/common/levels', authenticate, authorizeRole('ADMIN'), common.createLevel);
router.put('/common/levels/:id', authenticate, authorizeRole('ADMIN'), common.updateLevel);
router.delete('/common/levels/:id', authenticate, authorizeRole('ADMIN'), common.deleteLevel);

// NOTIFICATIONS
router.get('/notifications', authenticate, common.getNotifications);
router.put('/notifications/:id/read', authenticate, common.markNotificationRead);
router.put('/notifications/read-all', authenticate, common.markAllNotificationsRead);

// PACKAGES
import * as pkg from '../controllers/packageController.js';
router.get('/packages', authenticate, pkg.getAll);
router.get('/packages/branch-prices', authenticate, authorizeRole('ADMIN'), pkg.getBranchPrices);
router.get('/packages/calculate', authenticate, pkg.calculateSessions);
router.get('/packages/:id', authenticate, pkg.getById);
router.post('/packages', authenticate, authorizeRole('ADMIN'), pkg.create);
router.put('/packages/:id', authenticate, authorizeRole('ADMIN'), pkg.update);
router.delete('/packages/:id', authenticate, authorizeRole('ADMIN'), pkg.remove);
router.post('/packages/branch-price', authenticate, authorizeRole('ADMIN'), pkg.setBranchPrice);
router.post('/packages/branch-prices/bulk', authenticate, authorizeRole('ADMIN'), pkg.bulkSetBranchPrices);

// SALE REPORTS & KPI
import * as saleReport from '../controllers/saleReportController.js';
router.get('/sale-reports/my', authenticate, authorizeRole('EC'), saleReport.getMyReport);
router.get('/sale-reports', authenticate, authorizeRole('HOEC', 'ADMIN', 'CHU'), saleReport.getAllReports);
router.get('/sale-reports/summary', authenticate, authorizeRole('HOEC', 'ADMIN', 'CHU'), saleReport.getSummary);
router.get('/sale-reports/ranking/revenue', authenticate, saleReport.getRankingRevenue);
router.get('/sale-reports/ranking/kpi', authenticate, saleReport.getRankingKpi);
router.get('/sale-reports/expected-revenue', authenticate, authorizeRole('HOEC', 'ADMIN', 'CHU'), saleReport.getExpectedRevenueList);
router.get('/sale-reports/full-paid', authenticate, authorizeRole('HOEC', 'ADMIN', 'CHU'), saleReport.getFullPaidList);
router.get('/sale-reports/full-paid', authenticate, authorizeRole('HOEC', 'ADMIN', 'CHU'), saleReport.getFullPaidList);
router.post('/sale-reports/calculate', authenticate, authorizeRole('ADMIN'), saleReport.calculateReport);
router.post('/sale-reports/calculate-all', authenticate, authorizeRole('ADMIN'), saleReport.calculateAllReports);

// KPI
router.get('/kpi/targets', authenticate, authorizeRole('HOEC', 'ADMIN'), saleReport.getKpiTargets);
router.post('/kpi/target', authenticate, authorizeRole('HOEC', 'ADMIN'), saleReport.setKpiTarget);
router.post('/kpi/targets/bulk', authenticate, authorizeRole('HOEC', 'ADMIN'), saleReport.bulkSetKpi);

// DASHBOARD
router.get('/dashboard/admin', authenticate, authorizeRole('ADMIN'), dashboard.getAdmin);
router.get('/dashboard/owner', authenticate, authorizeRole('CHU', 'ADMIN'), dashboard.getOwner);
router.get('/dashboard/hoec', authenticate, authorizeRole('HOEC'), dashboard.getHoec);
router.get('/dashboard/om', authenticate, authorizeRole('OM'), dashboard.getOm);
router.get('/dashboard/cm', authenticate, authorizeRole('CM'), dashboard.getCM);
router.get('/dashboard/ec', authenticate, authorizeRole('EC'), dashboard.getSale);
router.get('/dashboard/teacher', authenticate, authorizeRole('TEACHER'), dashboard.getTeacher);
// Backward compatibility
router.get('/dashboard/sale', authenticate, authorizeRole('EC', 'SALE'), dashboard.getSale);

// PROMOTIONS (Khuyến mại)
import * as promo from '../controllers/promotionController.js';
// Chương trình KM
router.get('/promotions/programs', authenticate, promo.getActivePrograms);
router.get('/promotions/programs/all', authenticate, authorizeRole('ADMIN', 'GDV'), promo.getAllPrograms);
router.post('/promotions/programs', authenticate, authorizeRole('ADMIN', 'GDV'), promo.createProgram);
router.put('/promotions/programs/:id', authenticate, authorizeRole('ADMIN', 'GDV'), promo.updateProgram);
router.delete('/promotions/programs/:id', authenticate, authorizeRole('ADMIN', 'GDV'), promo.deleteProgram);
// Vật phẩm KM
router.get('/promotions/items', authenticate, promo.getAllItems);
router.get('/promotions/items/in-stock', authenticate, promo.getItemsInStock);
router.get('/promotions/items/low-stock', authenticate, authorizeRole('ADMIN', 'GDV'), promo.getLowStockItems);
router.post('/promotions/items', authenticate, authorizeRole('ADMIN', 'GDV'), promo.createItem);
router.put('/promotions/items/:id', authenticate, authorizeRole('ADMIN', 'GDV'), promo.updateItem);
router.delete('/promotions/items/:id', authenticate, authorizeRole('ADMIN', 'GDV'), promo.deleteItem);
router.post('/promotions/items/:id/stock', authenticate, authorizeRole('ADMIN', 'GDV'), promo.addItemStock);
router.post('/promotions/stock', authenticate, authorizeRole('ADMIN', 'GDV'), promo.updateStock);
router.get('/promotions/stock/history', authenticate, authorizeRole('ADMIN', 'GDV'), promo.getStockHistory);
// Học bổng KM
router.get('/promotions/scholarships', authenticate, promo.getAllScholarships);
router.post('/promotions/scholarships', authenticate, authorizeRole('ADMIN', 'GDV'), promo.createScholarship);
// Lead Promotions
router.get('/promotions/convert-data', authenticate, promo.getConvertData); // Data cho modal convert
router.get('/promotions/lead/:leadId', authenticate, promo.getLeadPromotions);
router.post('/promotions/lead/:leadId', authenticate, promo.applyPromotion);
router.get('/promotions/pending', authenticate, authorizeRole('ADMIN', 'GDV', 'HOEC'), promo.getPendingApprovals);
router.post('/promotions/lead/:leadId/approve', authenticate, authorizeRole('ADMIN', 'GDV'), promo.approveExtraDiscount);
// Lead Gifts
router.post('/promotions/lead/:leadId/gift', authenticate, promo.addGift);
router.put('/promotions/gift/:giftId/deliver', authenticate, promo.markGiftDelivered);
router.put('/promotions/gift/:giftId/return', authenticate, promo.returnGift);

// CALL (SignalWire)
import * as call from '../controllers/callController.js';
router.get('/call/token', authenticate, call.getToken);
router.get('/call/config', authenticate, call.getConfig);
router.post('/call/make', authenticate, call.makeCall);
router.get('/call/status/:callSid', authenticate, call.getCallStatus);
router.post('/call/twiml', call.twiml); // TwiML webhook (no auth)

// STUDENT DOCUMENTS
router.get('/students/:id/documents', authenticate, student.getDocuments);
router.post('/students/:id/documents', authenticate, upload.single('file'), student.uploadDocument);
router.delete('/students/:id/documents/:docId', authenticate, student.deleteDocument);

// STUDENT AVATAR
router.post('/students/:id/avatar', authenticate, upload.single('avatar'), student.uploadAvatar);

// SESSION FEEDBACKS
router.get('/sessions/:id/feedbacks', authenticate, session.getFeedbacks);
router.post('/sessions/:id/feedbacks', authenticate, session.saveFeedback);
router.put('/sessions/:id/feedbacks/:feedbackId', authenticate, session.updateFeedback);

// SYSTEM SETTINGS
import * as settings from '../controllers/settingsController.js';
router.get('/settings/payment', authenticate, settings.getPaymentConfig);
router.post('/settings/payment', authenticate, authorizeRole('ADMIN'), settings.savePaymentConfig);
router.get('/settings/all', authenticate, authorizeRole('ADMIN'), settings.getAllSettings);
router.post('/settings', authenticate, authorizeRole('ADMIN'), settings.saveSetting);

export default router;