import StudentModel from '../models/StudentModel.js';

// Helper: Lấy branch filter cho user
const getBranchFilter = (req) => {
  // Admin (is_system_wide) xem tất cả, hoặc lọc theo branchId từ query
  if (req.user.is_system_wide) {
    return req.query.branchId || null;
  }
  // User thường: chỉ xem branch của mình, ưu tiên query param nếu user có quyền
  const userBranchIds = req.user.branches?.map(b => b.id) || [];
  const queryBranchId = parseInt(req.query.branchId);
  if (queryBranchId && userBranchIds.includes(queryBranchId)) {
    return queryBranchId;
  }
  return req.user.primaryBranch?.id || userBranchIds[0] || null;
};

export const getAll = async (req, res, next) => {
  try {
    const { status, subjectId, search, page = 1, limit = 20 } = req.query;
    const saleId = req.user.role_name === 'SALE' ? req.user.id : null;
    const branchId = getBranchFilter(req);
    const result = await StudentModel.findAllWithRelations({ status, subjectId, search, saleId, branchId, page, limit });
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
};

export const getStats = async (req, res, next) => {
  try {
    const saleId = req.user.role_name === 'SALE' ? req.user.id : null;
    const branchId = getBranchFilter(req);
    const stats = await StudentModel.getStats(saleId, branchId);
    res.json({ success: true, data: stats });
  } catch (error) { next(error); }
};

export const getById = async (req, res, next) => {
  try {
    const student = await StudentModel.findByIdWithRelations(req.params.id);
    if (!student) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
    res.json({ success: true, data: student });
  } catch (error) { next(error); }
};

export const create = async (req, res, next) => {
  try {
    const { branchId, fullName, birthYear, gender, address, parentName, parentPhone, parentEmail, subjectId, levelId, learningPath, note } = req.body;
    
    if (!fullName || !birthYear || !parentName || !parentPhone) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });
    }

    // Xác định branch
    let finalBranchId = branchId;
    if (!finalBranchId) {
      finalBranchId = req.user.primaryBranch?.id || req.user.branches?.[0]?.id;
    }
    if (!finalBranchId) {
      return res.status(400).json({ success: false, message: 'Cần chọn cơ sở' });
    }

    // Lấy branch code để tạo student code
    const branch = req.user.branches?.find(b => b.id === finalBranchId);
    const branchCode = branch?.code || 'HS';

    const student = await StudentModel.create({
      branch_id: finalBranchId,
      student_code: StudentModel.generateCode(branchCode),
      full_name: fullName, birth_year: birthYear, gender, address,
      parent_name: parentName, parent_phone: parentPhone, parent_email: parentEmail,
      subject_id: subjectId || null, level_id: levelId || null,
      learning_path: learningPath, note, sale_id: req.user.id, status: 'active'
    });

    res.status(201).json({ success: true, message: 'Thêm học sinh thành công', data: student });
  } catch (error) { next(error); }
};

export const update = async (req, res, next) => {
  try {
    const { fullName, birthYear, gender, address, parentName, parentPhone, parentEmail, subjectId, levelId, learningPath, status, note } = req.body;
    
    const existing = await StudentModel.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
    
    if (req.user.role_name === 'SALE' && existing.sale_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Không có quyền' });
    }

    const data = {};
    if (fullName) data.full_name = fullName;
    if (birthYear) data.birth_year = birthYear;
    if (gender !== undefined) data.gender = gender;
    if (address !== undefined) data.address = address;
    if (parentName) data.parent_name = parentName;
    if (parentPhone) data.parent_phone = parentPhone;
    if (parentEmail !== undefined) data.parent_email = parentEmail;
    if (subjectId !== undefined) data.subject_id = subjectId || null;
    if (levelId !== undefined) data.level_id = levelId || null;
    if (learningPath !== undefined) data.learning_path = learningPath;
    if (status) data.status = status;
    if (note !== undefined) data.note = note;

    await StudentModel.update(req.params.id, data);
    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (error) { next(error); }
};

export const remove = async (req, res, next) => {
  try {
    await StudentModel.update(req.params.id, { status: 'cancelled' });
    res.json({ success: true, message: 'Xóa thành công' });
  } catch (error) { next(error); }
};
