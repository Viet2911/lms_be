import TrialModel from '../models/TrialModel.js';
import ExperienceModel from '../models/ExperienceModel.js';
import StudentModel from '../models/StudentModel.js';
import { getBranchFilter, getBranchCode } from '../utils/branchHelper.js';
import pool from '../config/database.js';

export const getAll = async (req, res, next) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    // EC and TEACHER can also view trials
    const saleId = req.user.role_name === 'SALE' ? req.user.id : null;
    const branchId = getBranchFilter(req);
    const result = await TrialModel.findAllWithRelations({ status, search, saleId, branchId, page, limit });
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
};

export const getStats = async (req, res, next) => {
  try {
    const saleId = req.user.role_name === 'SALE' ? req.user.id : null;
    const branchId = getBranchFilter(req);
    const stats = await TrialModel.getStats(saleId, branchId);
    res.json({ success: true, data: stats });
  } catch (error) { next(error); }
};

export const getById = async (req, res, next) => {
  try {
    const trial = await TrialModel.findByIdWithRelations(req.params.id);
    if (!trial) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
    res.json({ success: true, data: trial });
  } catch (error) { next(error); }
};

export const create = async (req, res, next) => {
  try {
    const { experienceId } = req.body;
    if (!experienceId) return res.status(400).json({ success: false, message: 'Vui lòng chọn lịch trải nghiệm' });

    const exp = await ExperienceModel.findByIdWithRelations(experienceId);
    if (!exp) return res.status(404).json({ success: false, message: 'Lịch trải nghiệm không tồn tại' });
    if (exp.trialStudent) return res.status(400).json({ success: false, message: 'Đã tạo học thử từ trải nghiệm này' });

    const branchCode = getBranchCode(req.user, exp.branch_id);

    const trial = await TrialModel.create({
      branch_id: exp.branch_id,
      code: TrialModel.generateCode(branchCode),
      experience_id: experienceId,
      full_name: exp.student_name,
      birth_year: exp.student_birth_year,
      parent_name: exp.customer_name,
      parent_phone: exp.customer_phone,
      parent_email: exp.customer_email,
      subject_id: exp.subject_id,
      level_id: exp.level_id,
      sale_id: req.user.id,
      status: 'active',
      sessions_attended: 0,
      max_sessions: 3
    });

    await ExperienceModel.update(experienceId, { status: 'converted' });
    res.status(201).json({ success: true, message: 'Tạo học sinh thử thành công', data: trial });
  } catch (error) { next(error); }
};

export const update = async (req, res, next) => {
  try {
    const { fullName, birthYear, parentName, parentPhone, parentEmail, subjectId, levelId, status, note } = req.body;

    const data = {};
    if (fullName) data.full_name = fullName;
    if (birthYear) data.birth_year = birthYear;
    if (parentName) data.parent_name = parentName;
    if (parentPhone) data.parent_phone = parentPhone;
    if (parentEmail !== undefined) data.parent_email = parentEmail;
    if (subjectId !== undefined) data.subject_id = subjectId || null;
    if (levelId !== undefined) data.level_id = levelId || null;
    if (status) data.status = status;
    if (note !== undefined) data.note = note;

    await TrialModel.update(req.params.id, data);
    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (error) { next(error); }
};

// Checkin trial - EC and Teacher can mark attendance
export const checkinTrial = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { check_type, note } = req.body; // attended, cancelled, no_show

    // Validate check_type
    if (!['attended', 'cancelled', 'no_show'].includes(check_type)) {
      return res.status(400).json({ success: false, message: 'Loại checkin không hợp lệ' });
    }

    // Check if trial exists
    const trial = await TrialModel.findByIdWithRelations(id);
    if (!trial) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học sinh thử' });
    }

    // Check if already checked in
    const [existing] = await pool.query(
      'SELECT id FROM trial_checkins WHERE trial_id = ?',
      [id]
    );

    if (existing[0]) {
      // Update existing checkin
      await pool.query(
        'UPDATE trial_checkins SET check_type = ?, checked_by = ?, check_time = NOW(), note = ? WHERE trial_id = ?',
        [check_type, req.user.id, note, id]
      );
    } else {
      // Create new checkin
      await pool.query(
        'INSERT INTO trial_checkins (trial_id, checked_by, check_type, note) VALUES (?, ?, ?, ?)',
        [id, req.user.id, check_type, note]
      );
    }

    // Update trial sessions_attended if attended
    if (check_type === 'attended') {
      await pool.query(
        'UPDATE trial_students SET sessions_attended = sessions_attended + 1 WHERE id = ?',
        [id]
      );
    }

    // Update trial status if cancelled or no_show
    if (check_type === 'cancelled') {
      await TrialModel.update(id, { status: 'cancelled' });
    }

    res.json({
      success: true,
      message: check_type === 'attended' ? 'Đã đánh dấu học sinh đến' :
        check_type === 'cancelled' ? 'Đã hủy lịch học thử' : 'Đã đánh dấu học sinh không đến'
    });
  } catch (error) { next(error); }
};

// Get trial checkin history
export const getTrialCheckins = async (req, res, next) => {
  try {
    const { date, branch_id } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    let sql = `
      SELECT tc.*, ts.full_name as student_name, ts.parent_phone,
             u.full_name as checked_by_name,
             e.trial_date, e.trial_time,
             s.name as subject_name
      FROM trial_checkins tc
      JOIN trial_students ts ON tc.trial_id = ts.id
      LEFT JOIN experience_schedules e ON ts.experience_id = e.id
      LEFT JOIN users u ON tc.checked_by = u.id
      LEFT JOIN subjects s ON ts.subject_id = s.id
      WHERE DATE(tc.check_time) = ?
    `;
    const params = [targetDate];

    if (branch_id) {
      sql += ' AND ts.branch_id = ?';
      params.push(branch_id);
    }

    sql += ' ORDER BY tc.check_time DESC';

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
};

// Get today's trials for checkin
export const getTodayTrials = async (req, res, next) => {
  try {
    const branchId = getBranchFilter(req);
    const today = new Date().toISOString().split('T')[0];

    let sql = `
      SELECT ts.*, e.trial_date, e.trial_time,
             s.name as subject_name,
             tc.check_type, tc.check_time, tc.checked_by,
             u.full_name as checked_by_name
      FROM trial_students ts
      LEFT JOIN experience_schedules e ON ts.experience_id = e.id
      LEFT JOIN subjects s ON ts.subject_id = s.id
      LEFT JOIN trial_checkins tc ON ts.id = tc.trial_id
      LEFT JOIN users u ON tc.checked_by = u.id
      WHERE ts.status = 'active' AND e.trial_date = ?
    `;
    const params = [today];

    if (branchId) {
      sql += ' AND ts.branch_id = ?';
      params.push(branchId);
    }

    sql += ' ORDER BY e.trial_time';

    const [rows] = await pool.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
};

export const convert = async (req, res, next) => {
  try {
    const { fullName, birthYear, gender, address, parentName, parentPhone, parentEmail, subjectId, levelId, learningPath } = req.body;

    const trial = await TrialModel.findByIdWithRelations(req.params.id);
    if (!trial) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
    if (trial.status === 'converted') return res.status(400).json({ success: false, message: 'Đã được chuyển đổi' });

    // Validate required fields for official student
    const finalData = {
      fullName: fullName || trial.full_name,
      birthYear: birthYear || trial.birth_year,
      gender: gender,
      address: address,
      parentName: parentName || trial.parent_name,
      parentPhone: parentPhone || trial.parent_phone,
      parentEmail: parentEmail || trial.parent_email,
      subjectId: subjectId || trial.subject_id,
      levelId: levelId || trial.level_id,
      learningPath: learningPath
    };

    // Check required fields
    const missingFields = [];
    if (!finalData.fullName) missingFields.push('Họ tên học sinh');
    if (!finalData.birthYear) missingFields.push('Năm sinh');
    if (!finalData.parentName) missingFields.push('Tên phụ huynh');
    if (!finalData.parentPhone) missingFields.push('SĐT phụ huynh');
    if (!finalData.subjectId) missingFields.push('Môn học');
    if (!finalData.levelId) missingFields.push('Cấp độ');

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Thiếu thông tin bắt buộc: ${missingFields.join(', ')}`,
        missingFields
      });
    }

    const branchCode = trial.branch_code || 'HS';

    const student = await StudentModel.create({
      branch_id: trial.branch_id,
      student_code: StudentModel.generateCode(branchCode),
      full_name: finalData.fullName,
      birth_year: finalData.birthYear,
      gender: finalData.gender,
      address: finalData.address,
      parent_name: finalData.parentName,
      parent_phone: finalData.parentPhone,
      parent_email: finalData.parentEmail,
      subject_id: finalData.subjectId,
      level_id: finalData.levelId,
      learning_path: finalData.learningPath,
      sale_id: trial.sale_id,
      status: 'active'
    });

    await TrialModel.update(req.params.id, { status: 'converted', converted_student_id: student.id, converted_at: new Date() });
    res.json({ success: true, message: 'Chuyển đổi thành công', data: { studentId: student.id } });
  } catch (error) { next(error); }
};

export const remove = async (req, res, next) => {
  try {
    await TrialModel.update(req.params.id, { status: 'cancelled' });
    res.json({ success: true, message: 'Xóa thành công' });
  } catch (error) { next(error); }
};