import StudentModel from '../models/StudentModel.js';
import fs from 'fs';

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
    const { status, subjectId, class_id, search, page = 1, limit = 20 } = req.query;
    const saleId = req.user.role_name === 'SALE' ? req.user.id : null;
    const branchId = getBranchFilter(req);
    const result = await StudentModel.findAllWithRelations({ status, subjectId, classId: class_id, search, saleId, branchId, page, limit });
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
    // Accept both camelCase and snake_case
    const fullName = req.body.fullName || req.body.full_name;
    const birthYear = req.body.birthYear || req.body.birth_year;
    const gender = req.body.gender;
    const address = req.body.address;
    const parentName = req.body.parentName || req.body.parent_name;
    const parentPhone = req.body.parentPhone || req.body.parent_phone;
    const parentEmail = req.body.parentEmail || req.body.parent_email;
    const subjectId = req.body.subjectId || req.body.subject_id;
    const levelId = req.body.levelId || req.body.level_id;
    const note = req.body.note;
    const branchId = req.body.branchId || req.body.branch_id;
    const packageId = req.body.packageId || req.body.package_id;
    const tuitionFee = req.body.tuitionFee || req.body.tuition_fee;
    const discountAmount = req.body.discountAmount || req.body.discount_amount;
    const scholarshipMonths = req.body.scholarshipMonths || req.body.scholarship_months;
    const giftId = req.body.giftId || req.body.gift_id;
    const giftName = req.body.giftName || req.body.gift_name;
    const paidAmount = req.body.paidAmount || req.body.paid_amount;
    const paymentStatus = req.body.paymentStatus || req.body.payment_status;

    if (!fullName || !parentName || !parentPhone) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc (họ tên, tên PH, SĐT)' });
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
      full_name: fullName,
      birth_year: birthYear || null,
      gender,
      address,
      parent_name: parentName,
      parent_phone: parentPhone,
      parent_email: parentEmail,
      subject_id: subjectId || null,
      level_id: levelId || null,
      package_id: packageId || null,
      tuition_fee: tuitionFee || 0,
      discount_amount: discountAmount || 0,
      scholarship_months: scholarshipMonths || 0,
      gift_id: giftId || null,
      gift_name: giftName || null,
      paid_amount: paidAmount || 0,
      payment_status: paymentStatus || 'pending',
      sessions_per_week: 1,
      note,
      sale_id: req.user.id,
      status: 'active'
    });

    res.status(201).json({ success: true, message: 'Thêm học sinh thành công', data: student });
  } catch (error) { next(error); }
};

export const update = async (req, res, next) => {
  try {
    const { fullName, birthYear, gender, address, parentName, parentPhone, parentEmail, subjectId, levelId, status, note } = req.body;

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

// Thay đổi trạng thái học sinh
export const changeStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, reason, expectedReturn, reserveMonths, refundAmount } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: 'Thiếu trạng thái mới' });
    }

    const validStatuses = ['pending', 'waiting', 'active', 'paused', 'expired', 'quit_paid', 'quit_refund', 'reserved', 'graduated'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ' });
    }

    const result = await StudentModel.changeStatus(id, status, {
      reason,
      expectedReturn,
      reserveMonths,
      refundAmount,
      changedBy: req.user.id
    });

    res.json({ success: true, message: 'Cập nhật trạng thái thành công', data: result });
  } catch (error) { next(error); }
};

// Xác nhận đã nhận thanh toán (sau khi hiện QR)
export const confirmPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount, paymentMethod, proofUrl, note } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Số tiền không hợp lệ' });
    }

    const result = await StudentModel.confirmPayment(id, {
      amount,
      paymentMethod: paymentMethod || 'bank_transfer',
      proofUrl: proofUrl || null,
      note,
      confirmedBy: req.user.id
    });

    res.json({ success: true, message: 'Đã ghi nhận thanh toán', data: result });
  } catch (error) { next(error); }
};

// Lấy thông tin enrollment preview (QR + student info)
export const getEnrollmentPreview = async (req, res, next) => {
  try {
    const student = await StudentModel.findByIdWithRelations(req.params.studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Không tìm thấy học sinh' });

    const feeTotal = student.fee_total || 0;
    const actualRevenue = student.actual_revenue || 0;
    const remainingAmount = Math.max(0, feeTotal - actualRevenue);

    // Generate VietQR URL
    let qrUrl = null;
    if (remainingAmount > 0) {
      const desc = encodeURIComponent(`${student.student_code} ${student.full_name}`.substring(0, 25));
      qrUrl = `https://img.vietqr.io/image/970422-0866766189-compact2.png?amount=${remainingAmount}&addInfo=${desc}`;
    }

    res.json({
      success: true,
      data: {
        student: {
          id: student.id,
          student_code: student.student_code,
          full_name: student.full_name,
          parent_name: student.parent_name,
          parent_phone: student.parent_phone
        },
        feeTotal,
        actualRevenue,
        remainingAmount,
        qrUrl
      }
    });
  } catch (error) { next(error); }
};

// Xuất đơn nhập học Word file
export const getEnrollmentForm = async (req, res, next) => {
  try {
    const student = await StudentModel.findByIdWithRelations(req.params.studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Không tìm thấy học sinh' });

    const feeTotal = student.fee_total || 0;
    const actualRevenue = student.actual_revenue || 0;
    const remainingAmount = Math.max(0, feeTotal - actualRevenue);

    // Import service dynamically
    const enrollmentService = (await import('../services/enrollmentFormService.js')).default;

    const data = {
      student: {
        id: student.id,
        student_code: student.student_code,
        full_name: student.full_name,
        birth_year: student.birth_year,
        address: student.address,
        school: student.school
      },
      parent: {
        name: student.parent_name,
        phone: student.parent_phone,
        email: student.parent_email,
        job: student.parent_job
      },
      course: {
        package_name: student.package_name,
        package_months: student.package_months || 0,
        scholarship_months: student.scholarship_months || 0,
        level_name: student.level_name || student.current_level_name,
        gifts: student.gifts || ''
      },
      payment: {
        fee_original: student.fee_original || 0,
        fee_discount: student.fee_discount || 0,
        fee_total: feeTotal,
        actual_revenue: actualRevenue,
        remaining: remainingAmount
      },
      ec_name: student.sale_name || '',
      branch_name: student.branch_name || 'Army Technology'
    };

    // Generate Word file
    const filePath = await enrollmentService.fillTemplate(data);

    // Send file
    res.download(filePath, `Don_nhap_hoc_${student.student_code}.docx`, (err) => {
      // Clean up temp file after download
      if (filePath) {
        fs.unlink(filePath, () => { });
      }
      if (err && !res.headersSent) {
        next(err);
      }
    });
  } catch (error) {
    console.error('Enrollment form error:', error);
    next(error);
  }
};

// ==================== DOCUMENTS ====================

// Get student documents
export const getDocuments = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [docs] = await StudentModel.db.query(`
      SELECT d.*, u.full_name as uploaded_by_name,
        CASE d.doc_type 
          WHEN 'receipt' THEN 'Phiếu thu'
          WHEN 'registration_form' THEN 'Đơn đăng ký'
          WHEN 'contract' THEN 'Hợp đồng'
          ELSE 'Khác'
        END as doc_type_display
      FROM student_documents d
      LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE d.student_id = ?
      ORDER BY d.created_at DESC
    `, [id]);
    res.json({ success: true, data: docs });
  } catch (error) { next(error); }
};

// Upload document
export const uploadDocument = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { doc_type, note } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Chưa chọn file' });
    }

    // Get file URL - Cloudinary returns path, local storage returns filename
    const fileUrl = req.file.path.startsWith('http')
      ? req.file.path
      : `/uploads/documents/${req.file.filename}`;

    const [result] = await StudentModel.db.query(`
      INSERT INTO student_documents (student_id, doc_type, file_name, file_url, file_type, file_size, note, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      doc_type || 'other',
      req.file.originalname,
      fileUrl,
      req.file.mimetype,
      req.file.size,
      note || null,
      req.user.id
    ]);

    res.json({
      success: true,
      message: 'Upload thành công',
      data: { id: result.insertId, file_url: fileUrl }
    });
  } catch (error) { next(error); }
};

// Delete document
export const deleteDocument = async (req, res, next) => {
  try {
    const { docId } = req.params;
    await StudentModel.db.query('DELETE FROM student_documents WHERE id = ?', [docId]);
    res.json({ success: true, message: 'Đã xóa tài liệu' });
  } catch (error) { next(error); }
};

// Upload avatar
export const uploadAvatar = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Chưa chọn ảnh' });
    }

    await StudentModel.db.query('UPDATE students SET avatar_url = ? WHERE id = ?', [req.file.path, id]);

    res.json({
      success: true,
      message: 'Cập nhật ảnh đại diện thành công',
      data: { avatar_url: req.file.path }
    });
  } catch (error) { next(error); }
};