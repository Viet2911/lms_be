import ExperienceModel from '../models/ExperienceModel.js';
import telegramService from '../services/telegramService.js';
import db from '../config/database.js';
import { getBranchFilter, getCreateBranchId, getBranchCode } from '../utils/branchHelper.js';

export const getAll = async (req, res, next) => {
  try {
    const { status, fromDate, toDate, search, page = 1, limit = 20 } = req.query;
    const saleId = req.user.role_name === 'SALE' ? req.user.id : null;
    const branchId = getBranchFilter(req);
    const result = await ExperienceModel.findAllWithRelations({ status, fromDate, toDate, search, saleId, branchId, page, limit });
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
};

export const getStats = async (req, res, next) => {
  try {
    const saleId = req.user.role_name === 'SALE' ? req.user.id : null;
    const branchId = getBranchFilter(req);
    const stats = await ExperienceModel.getStats(saleId, branchId);
    res.json({ success: true, data: stats });
  } catch (error) { next(error); }
};

export const getById = async (req, res, next) => {
  try {
    const exp = await ExperienceModel.findByIdWithRelations(req.params.id);
    if (!exp) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
    res.json({ success: true, data: exp });
  } catch (error) { next(error); }
};

export const getByMonth = async (req, res, next) => {
  try {
    const { year, month } = req.query;
    const saleId = req.user.role_name === 'SALE' ? req.user.id : null;
    const branchId = getBranchFilter(req);
    const data = await ExperienceModel.getByMonth(year, month, saleId, branchId);
    res.json({ success: true, data });
  } catch (error) { next(error); }
};

export const create = async (req, res, next) => {
  try {
    const { branchId, customerName, customerPhone, customerEmail, studentName, studentBirthYear, subjectId, levelId, scheduledDate, scheduledTime, durationMinutes, note } = req.body;
    
    // Validation
    if (!customerName || !customerPhone || !studentName || !scheduledDate || !scheduledTime) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });
    }

    const finalBranchId = getCreateBranchId(req);
    if (!finalBranchId) {
      return res.status(400).json({ success: false, message: 'Cần chọn cơ sở' });
    }

    const branchCode = getBranchCode(req.user, finalBranchId);

    // Create experience
    const exp = await ExperienceModel.create({
      branch_id: finalBranchId,
      code: ExperienceModel.generateCode(branchCode),
      customer_name: customerName, 
      customer_phone: customerPhone, 
      customer_email: customerEmail,
      student_name: studentName, 
      student_birth_year: studentBirthYear,
      subject_id: subjectId || null, 
      level_id: levelId || null,
      scheduled_date: scheduledDate, 
      scheduled_time: scheduledTime,
      duration_minutes: durationMinutes || 60, 
      note, 
      sale_id: req.user.id, 
      status: 'pending'
    });

    // Get additional info for Telegram notification
    let subjectName = null;
    let levelName = null;
    let branchName = null;
    
    if (subjectId) {
      const [[subject]] = await db.query('SELECT name FROM subjects WHERE id = ?', [subjectId]);
      subjectName = subject?.name;
    }
    if (levelId) {
      const [[level]] = await db.query('SELECT name FROM levels WHERE id = ?', [levelId]);
      levelName = level?.name;
    }
    const [[branch]] = await db.query('SELECT name FROM branches WHERE id = ?', [finalBranchId]);
    branchName = branch?.name;

    // Send Telegram notification (async, don't wait)
    telegramService.notifyNewExperience({
      branch_name: branchName,
      student_name: studentName,
      birth_year: studentBirthYear,
      customer_name: customerName,
      customer_phone: customerPhone,
      subject_name: subjectName,
      level_name: levelName,
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      sale_name: req.user.full_name,
      notes: note
    }).catch(err => console.error('[Telegram] Error:', err));

    res.status(201).json({ success: true, message: 'Tạo lịch trải nghiệm thành công', data: exp });
  } catch (error) { next(error); }
};

export const update = async (req, res, next) => {
  try {
    const { customerName, customerPhone, customerEmail, studentName, studentBirthYear, subjectId, levelId, scheduledDate, scheduledTime, durationMinutes, status, feedback, rating, note } = req.body;
    
    const existing = await ExperienceModel.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
    if (req.user.role_name === 'SALE' && existing.sale_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Không có quyền' });
    }

    const data = {};
    if (customerName) data.customer_name = customerName;
    if (customerPhone) data.customer_phone = customerPhone;
    if (customerEmail !== undefined) data.customer_email = customerEmail;
    if (studentName) data.student_name = studentName;
    if (studentBirthYear) data.student_birth_year = studentBirthYear;
    if (subjectId !== undefined) data.subject_id = subjectId || null;
    if (levelId !== undefined) data.level_id = levelId || null;
    if (scheduledDate) data.scheduled_date = scheduledDate;
    if (scheduledTime) data.scheduled_time = scheduledTime;
    if (durationMinutes) data.duration_minutes = durationMinutes;
    if (status) data.status = status;
    if (feedback !== undefined) data.feedback = feedback;
    if (rating !== undefined) data.rating = rating;
    if (note !== undefined) data.note = note;

    await ExperienceModel.update(req.params.id, data);
    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (error) { next(error); }
};

export const remove = async (req, res, next) => {
  try {
    const exp = await ExperienceModel.findByIdWithRelations(req.params.id);
    if (exp?.trialStudent) {
      return res.status(400).json({ success: false, message: 'Không thể xóa vì đã tạo học thử' });
    }
    await ExperienceModel.delete(req.params.id);
    res.json({ success: true, message: 'Xóa thành công' });
  } catch (error) { next(error); }
};
