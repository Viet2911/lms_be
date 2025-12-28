import TrialModel from '../models/TrialModel.js';
import ExperienceModel from '../models/ExperienceModel.js';
import StudentModel from '../models/StudentModel.js';
import { getBranchFilter, getBranchCode } from '../utils/branchHelper.js';

export const getAll = async (req, res, next) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
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
