import SessionModel from '../models/SessionModel.js';
import { getBranchFilter } from '../utils/branchHelper.js';

export const getAll = async (req, res, next) => {
  try {
    const { classId, fromDate, toDate, status, page = 1, limit = 20 } = req.query;
    const teacherId = req.user.role_name === 'TEACHER' ? req.user.id : null;
    const branchId = getBranchFilter(req);
    const result = await SessionModel.findAllWithRelations({ classId, teacherId, branchId, fromDate, toDate, status, page, limit });
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
};

export const getById = async (req, res, next) => {
  try {
    const session = await SessionModel.findByIdWithRelations(req.params.id);
    if (!session) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
    res.json({ success: true, data: session });
  } catch (error) { next(error); }
};

export const getToday = async (req, res, next) => {
  try {
    const branchId = getBranchFilter(req);
    const sessions = await SessionModel.getToday(req.user.id, req.user.role_name, branchId);
    res.json({ success: true, data: sessions });
  } catch (error) { next(error); }
};

export const create = async (req, res, next) => {
  try {
    const { classId, sessionNumber, sessionDate, startTime, endTime, teacherId, note } = req.body;
    if (!classId || !sessionDate) return res.status(400).json({ success: false, message: 'Thiếu thông tin' });

    const session = await SessionModel.create({
      class_id: classId, session_number: sessionNumber, session_date: sessionDate,
      start_time: startTime, end_time: endTime, teacher_id: teacherId, note
    });

    res.status(201).json({ success: true, message: 'Tạo buổi học thành công', data: session });
  } catch (error) { next(error); }
};

export const generate = async (req, res, next) => {
  try {
    const { classId, count = 15 } = req.body;
    if (!classId) return res.status(400).json({ success: false, message: 'Vui lòng chọn lớp' });

    const sessions = await SessionModel.generateSessions(classId, count);
    res.status(201).json({ success: true, message: `Đã tạo ${sessions.length} buổi học`, data: sessions });
  } catch (error) { next(error); }
};

export const update = async (req, res, next) => {
  try {
    const { sessionDate, startTime, endTime, teacherId, substituteTeacherId, note } = req.body;

    const data = {};
    if (sessionDate) data.session_date = sessionDate;
    if (startTime) data.start_time = startTime;
    if (endTime) data.end_time = endTime;
    if (teacherId !== undefined) data.teacher_id = teacherId;
    if (substituteTeacherId !== undefined) data.substitute_teacher_id = substituteTeacherId;
    if (note !== undefined) data.note = note;

    await SessionModel.update(req.params.id, data);
    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (error) { next(error); }
};

export const remove = async (req, res, next) => {
  try {
    await SessionModel.delete(req.params.id);
    res.json({ success: true, message: 'Xóa thành công' });
  } catch (error) { next(error); }
};

// ==================== SESSION FEEDBACKS ====================

// Get feedbacks for a session
export const getFeedbacks = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [feedbacks] = await SessionModel.db.query(`
      SELECT f.*, s.full_name as student_name, s.student_code,
             u.full_name as created_by_name
      FROM session_feedbacks f
      JOIN students s ON f.student_id = s.id
      LEFT JOIN users u ON f.created_by = u.id
      WHERE f.session_id = ?
      ORDER BY s.full_name
    `, [id]);
    res.json({ success: true, data: feedbacks });
  } catch (error) { next(error); }
};

// Save feedback for a student in a session
export const saveFeedback = async (req, res, next) => {
  try {
    const { id } = req.params; // session_id
    const { student_id, rating, feedback, homework_assigned, parent_notified } = req.body;

    if (!student_id) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin học sinh' });
    }

    // Upsert - insert or update
    await SessionModel.db.query(`
      INSERT INTO session_feedbacks (session_id, student_id, rating, feedback, homework_assigned, parent_notified, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        rating = VALUES(rating),
        feedback = VALUES(feedback),
        homework_assigned = VALUES(homework_assigned),
        parent_notified = VALUES(parent_notified),
        updated_at = NOW()
    `, [id, student_id, rating || null, feedback || null, homework_assigned || false, parent_notified || false, req.user.id]);

    res.json({ success: true, message: 'Đã lưu nhận xét' });
  } catch (error) { next(error); }
};

// Update feedback
export const updateFeedback = async (req, res, next) => {
  try {
    const { feedbackId } = req.params;
    const { rating, feedback, homework_assigned, parent_notified } = req.body;

    await SessionModel.db.query(`
      UPDATE session_feedbacks 
      SET rating = ?, feedback = ?, homework_assigned = ?, parent_notified = ?, updated_at = NOW()
      WHERE id = ?
    `, [rating, feedback, homework_assigned || false, parent_notified || false, feedbackId]);

    res.json({ success: true, message: 'Đã cập nhật nhận xét' });
  } catch (error) { next(error); }
};

// ==================== RESCHEDULE SESSION ====================

/**
 * Dời buổi học - tất cả các buổi từ buổi này trở đi sẽ dời theo
 * POST /api/sessions/:id/reschedule
 * Body: { newDate: 'YYYY-MM-DD', reason: 'Lý do', shiftFollowing: true/false }
 */
export const reschedule = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { newDate, reason, shiftFollowing = true } = req.body;

    if (!newDate) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn ngày mới' });
    }

    const result = await SessionModel.rescheduleSession(id, newDate, reason, shiftFollowing);
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
};

/**
 * Hủy buổi học
 * POST /api/sessions/:id/cancel
 * Body: { reason: 'Lý do' }
 */
export const cancel = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    await SessionModel.cancelSession(id, reason);
    res.json({ success: true, message: 'Đã hủy buổi học' });
  } catch (error) { next(error); }
};

/**
 * Lấy lịch sử dời buổi của lớp
 * GET /api/classes/:classId/reschedule-history
 */
export const getRescheduleHistory = async (req, res, next) => {
  try {
    const { classId } = req.params;
    const history = await SessionModel.getRescheduleHistory(classId);
    res.json({ success: true, data: history });
  } catch (error) { next(error); }
};