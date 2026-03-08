import LeadModel from '../models/LeadModel.js';
import StudentModel from '../models/StudentModel.js';
import PromotionModel from '../models/PromotionModel.js';
import telegramService from '../services/telegramService.js';
import { getBranchFilter, getCreateBranchId, getBranchCode } from '../utils/branchHelper.js';
import db from '../config/database.js';

// Helper to get sale filter based on role
function getSaleFilter(req) {
  // EC và SALE chỉ thấy leads của mình
  // HOEC, OM, ADMIN thấy tất cả (trong branch của họ)
  const role = req.user.role_name;
  if (role === 'EC' || role === 'SALE') {
    return req.user.id;
  }
  return null; // Không filter theo sale_id
}

// Lấy danh sách leads
export const getAll = async (req, res, next) => {
  try {
    const { status, fromDate, toDate, search, source, page = 1, limit = 20 } = req.query;
    const saleId = getSaleFilter(req);
    const branchId = getBranchFilter(req);

    const result = await LeadModel.findAllWithRelations({
      status, fromDate, toDate, search, source, saleId, branchId, page, limit
    });
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
};

// Thống kê
export const getStats = async (req, res, next) => {
  try {
    const saleId = getSaleFilter(req);
    const branchId = getBranchFilter(req);
    const stats = await LeadModel.getStats(saleId, branchId);
    res.json({ success: true, data: stats });
  } catch (error) { next(error); }
};

// Lấy chi tiết
export const getById = async (req, res, next) => {
  try {
    const lead = await LeadModel.findByIdWithRelations(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
    res.json({ success: true, data: lead });
  } catch (error) { next(error); }
};

// Lấy theo tháng (calendar)
export const getByMonth = async (req, res, next) => {
  try {
    const { year, month } = req.query;
    const saleId = getSaleFilter(req);
    const branchId = getBranchFilter(req);
    const data = await LeadModel.getByMonth(year, month, saleId, branchId);
    res.json({ success: true, data });
  } catch (error) { next(error); }
};

// Tạo mới (hỗ trợ nhiều học sinh)
export const create = async (req, res, next) => {
  try {
    const {
      customerName, customerPhone, customerEmail,
      students, // Array of {name, birthYear}
      studentName, studentBirthYear, // Legacy single student
      subjectId, levelId,
      scheduledDate, scheduledTime,
      source, note,
      expectedRevenue, // Dự kiến học phí
      saleId // Giao cho EC cụ thể (cho Manager)
    } = req.body;

    // Validation
    if (!customerName || !customerPhone) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin phụ huynh' });
    }

    // Check duplicate phone - cho phép trùng nếu lead cũ bị cancelled/lỗi
    const existingLead = await LeadModel.findByPhone(customerPhone);
    if (existingLead && existingLead.status !== 'cancelled') {
      return res.status(400).json({
        success: false,
        message: `SĐT đã tồn tại: ${existingLead.customer_name} - ${existingLead.student_name} (${existingLead.code})`,
        data: existingLead
      });
    }

    const finalBranchId = getCreateBranchId(req);
    if (!finalBranchId) {
      return res.status(400).json({ success: false, message: 'Cần chọn cơ sở' });
    }

    const branchCode = getBranchCode(req.user, finalBranchId);

    // Xác định status ban đầu
    let status = 'new';
    if (scheduledDate && scheduledTime) {
      status = 'scheduled';
    }

    // Xử lý danh sách học sinh
    let studentList = [];
    if (students && Array.isArray(students) && students.length > 0) {
      studentList = students.filter(s => s.name?.trim());
    } else if (studentName) {
      // Legacy: single student
      studentList = [{ name: studentName, birthYear: studentBirthYear }];
    }

    if (studentList.length === 0) {
      return res.status(400).json({ success: false, message: 'Cần nhập ít nhất 1 học sinh' });
    }

    // Tạo lead cho mỗi học sinh
    const createdLeads = [];
    // Nếu Manager giao cho EC cụ thể, dùng saleId đó, ngược lại dùng user hiện tại
    const assignedSaleId = saleId || req.user.id;

    for (let i = 0; i < studentList.length; i++) {
      const student = studentList[i];
      const code = await LeadModel.generateCode(branchCode);

      const lead = await LeadModel.create({
        branch_id: finalBranchId,
        code,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        student_name: student.name,
        student_birth_year: student.birthYear || null,
        subject_id: subjectId || null,
        level_id: levelId || null,
        scheduled_date: scheduledDate || null,
        scheduled_time: scheduledTime || null,
        status,
        source: source || null,
        expected_revenue: expectedRevenue || 0,
        note: studentList.length > 1 ? `${note || ''} [Anh/chị em: ${studentList.length} HS]`.trim() : note,
        sale_id: assignedSaleId
      });

      createdLeads.push(lead);
    }

    // Gửi thông báo Telegram
    try {
      const studentNames = studentList.map(s => s.name).join(', ');
      await telegramService.sendMessage(
        `🎯 <b>Lead mới!</b>\n` +
        `📋 Mã: ${createdLeads[0].code}${createdLeads.length > 1 ? ` (+${createdLeads.length - 1})` : ''}\n` +
        `👤 KH: ${customerName}\n` +
        `📱 SĐT: ${customerPhone}\n` +
        `👶 HS: ${studentNames}\n` +
        `📅 Lịch: ${scheduledDate ? `${scheduledDate} ${scheduledTime || ''}` : 'Chưa đặt lịch'}\n` +
        `👨‍💼 Sale: ${req.user.full_name}`
      );
    } catch (e) { console.error('Telegram error:', e); }

    res.status(201).json({
      success: true,
      message: `Tạo ${createdLeads.length} lead thành công`,
      data: createdLeads.length === 1 ? createdLeads[0] : createdLeads
    });
  } catch (error) { next(error); }
};

// Cập nhật
export const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      customerName, customerPhone, customerEmail,
      studentName, studentBirthYear,
      subjectId, levelId,
      scheduledDate, scheduledTime,
      status, source, note, rating, feedback,
      trialClassId, trialSessionsMax,
      expectedRevenue, // Dự kiến học phí
      actual_revenue, deposit_amount, fee_total // Thêm các field thanh toán
    } = req.body;

    const data = {};
    if (customerName) data.customer_name = customerName;
    if (customerPhone) data.customer_phone = customerPhone;
    if (customerEmail !== undefined) data.customer_email = customerEmail;
    if (studentName) data.student_name = studentName;
    if (studentBirthYear) data.student_birth_year = studentBirthYear;
    if (subjectId !== undefined) data.subject_id = subjectId || null;
    if (levelId !== undefined) data.level_id = levelId || null;
    if (scheduledDate !== undefined) data.scheduled_date = scheduledDate || null;
    if (scheduledTime !== undefined) data.scheduled_time = scheduledTime || null;
    if (status) data.status = status;
    if (source !== undefined) data.source = source;
    if (note !== undefined) data.note = note;
    if (rating !== undefined) data.rating = rating;
    if (feedback !== undefined) data.feedback = feedback;
    if (trialClassId !== undefined) data.trial_class_id = trialClassId || null;
    if (trialSessionsMax !== undefined) data.trial_sessions_max = trialSessionsMax;

    // Dự kiến học phí
    if (expectedRevenue !== undefined) data.expected_revenue = expectedRevenue;

    // Các field thanh toán
    if (actual_revenue !== undefined) data.actual_revenue = actual_revenue;
    if (deposit_amount !== undefined) data.deposit_amount = deposit_amount;
    if (fee_total !== undefined) data.fee_total = fee_total;

    await LeadModel.update(id, data);
    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (error) { next(error); }
};

// Xóa
export const remove = async (req, res, next) => {
  try {
    await LeadModel.delete(req.params.id);
    res.json({ success: true, message: 'Đã xóa' });
  } catch (error) { next(error); }
};

// Đánh dấu đã đến trải nghiệm / học thử
export const markAttended = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rating, feedback } = req.body;

    const lead = await LeadModel.findByIdWithRelations(id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy' });
    }

    // Nếu đang ở trạng thái trial, tăng số buổi đã học
    if (lead.status === 'trial') {
      await LeadModel.incrementTrialSessions(id);
    }

    // Cập nhật rating và feedback
    const updateData = {};
    if (rating) updateData.rating = rating;
    if (feedback) updateData.feedback = feedback;

    // Nếu chưa phải trial, chuyển sang attended
    if (lead.status === 'scheduled' || lead.status === 'new') {
      updateData.status = 'attended';
    }

    if (Object.keys(updateData).length > 0) {
      await LeadModel.update(id, updateData);
    }

    res.json({ success: true, message: 'Đã điểm danh thành công' });
  } catch (error) { next(error); }
};

// Đánh dấu không đến
export const markNoShow = async (req, res, next) => {
  try {
    await LeadModel.updateStatus(req.params.id, 'no_show');
    res.json({ success: true, message: 'Đã đánh dấu không đến' });
  } catch (error) { next(error); }
};

// Gán lớp học thử
// Đặt lịch trải nghiệm (chỉ cần ngày, giờ, bộ môn)
export const assignTrialClass = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { scheduledDate, scheduledTime, subjectId, note } = req.body;

    if (!scheduledDate || !scheduledTime) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn ngày và giờ' });
    }

    const data = {
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      status: 'scheduled'
    };

    if (subjectId) data.subject_id = subjectId;
    if (note) data.note = note;

    await LeadModel.update(id, data);

    // Gửi thông báo
    const lead = await LeadModel.findByIdWithRelations(id);
    try {
      await telegramService.sendMessage(
        `📅 <b>Đặt lịch trải nghiệm!</b>\n` +
        `👶 HS: ${lead.student_name}\n` +
        `👤 PH: ${lead.customer_name} - ${lead.customer_phone}\n` +
        `📆 Ngày: ${scheduledDate}\n` +
        `⏰ Giờ: ${scheduledTime}\n` +
        (lead.subject_name ? `📚 Môn: ${lead.subject_name}` : '')
      );
    } catch (e) { console.error('Telegram error:', e); }

    res.json({ success: true, message: 'Đã đặt lịch trải nghiệm' });
  } catch (error) { next(error); }
};

// Hoàn thành 1 buổi học thử
export const completeSession = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { sessionNum } = req.body;

    const lead = await LeadModel.findByIdWithRelations(id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy' });
    }

    // Tăng số buổi đã học
    await LeadModel.incrementTrialSessions(id);
    const newSessionsAttended = (lead.trial_sessions_attended || 0) + 1;

    // Cập nhật status
    // Buổi 1 hoàn thành -> waiting (chờ quyết định: đặt B2 hoặc chuyển đổi)
    // Buổi 2, 3 hoàn thành -> vẫn waiting
    let newStatus = 'waiting';

    if (newSessionsAttended >= (lead.trial_sessions_max || 3)) {
      // Đã học đủ số buổi max -> chờ chuyển đổi
      newStatus = 'waiting';
    }

    await LeadModel.update(id, { status: newStatus });

    // Gửi thông báo Telegram
    try {
      await telegramService.sendMessage(
        `✅ <b>Hoàn thành buổi ${sessionNum}!</b>\n` +
        `👶 HS: ${lead.student_name}\n` +
        `📊 Tiến độ: ${newSessionsAttended}/${lead.trial_sessions_max || 3} buổi\n` +
        `⏳ Trạng thái: Chờ đặt lịch tiếp hoặc chuyển đổi`
      );
    } catch (e) { console.error('Telegram error:', e); }

    res.json({ success: true, message: `Đã hoàn thành buổi ${sessionNum}. Chờ đặt lịch tiếp hoặc chuyển đổi.` });
  } catch (error) { next(error); }
};

// Chuyển đổi thành học sinh chính thức (Full data)
export const convertToStudent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      studentName, birthYear, gender, school,
      customerName, customerPhone, parentJob, address,
      subjectId, levelId, sessionsPerWeek, startDate,
      classId,
      // Package & Fee
      packageId, feeOriginal, feeDiscount, feeTotal,
      // Scholarship
      scholarshipMonths, defaultScholarshipMonths, scholarshipNeedsApproval,
      // Payment
      paymentStatus, depositAmount, paidAmount,
      // Confirmed amount (số tiền đã xác nhận nhận được)
      confirmedAmount,
      // Promo
      programId, gifts,
      note
    } = req.body;

    const lead = await LeadModel.findByIdWithRelations(id);
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy lead' });
    }

    // Tạo học sinh mới
    const studentCode = await StudentModel.generateCode(lead.branch_code);

    // Format gifts string
    const giftsStr = gifts && gifts.length > 0
      ? gifts.map(g => g.name).join(', ')
      : '';

    // Số tiền đã xác nhận nhận được
    const actualPaid = parseFloat(confirmedAmount) || 0;
    const feeTotalNum = parseFloat(feeTotal) || 0;

    // Xác định fee_status dựa trên số tiền đã xác nhận
    let feeStatus = 'pending';
    if (actualPaid >= feeTotalNum && feeTotalNum > 0) {
      feeStatus = 'paid';
    } else if (actualPaid > 0) {
      feeStatus = 'partial';
    }

    const studentData = {
      branch_id: lead.branch_id,
      student_code: studentCode,
      full_name: studentName || lead.student_name,
      birth_year: birthYear || lead.student_birth_year,
      gender: gender || null,
      school: school || null,
      parent_name: customerName || lead.customer_name,
      parent_phone: customerPhone || lead.customer_phone,
      parent_email: lead.customer_email,
      parent_job: parentJob || null,
      address: address || null,
      subject_id: subjectId || lead.subject_id,
      level_id: levelId || lead.level_id,
      current_level_id: levelId || lead.level_id,
      sessions_per_week: sessionsPerWeek || 2,
      start_date: startDate || null,
      // Package info
      package_id: packageId || null,
      tuition_fee: feeOriginal || 0,
      discount_amount: feeDiscount || 0,
      fee_total: feeTotal || 0,
      // Scholarship
      scholarship_months: scholarshipMonths || 0,
      // Payment - Ghi nhận số tiền đã xác nhận
      deposit_amount: actualPaid,
      paid_amount: actualPaid,
      actual_revenue: actualPaid,
      fee_status: feeStatus,
      payment_status: feeStatus,
      // Gifts & Note
      gifts: giftsStr,
      note: note || null,
      // Sale
      sale_id: lead.sale_id,
      // Status
      status: classId ? 'active' : 'pending'
    };

    const student = await StudentModel.create(studentData);

    // Ghi nhận vào revenues nếu có tiền đã xác nhận
    if (actualPaid > 0) {
      const pool = (await import('../config/database.js')).default;
      await pool.query(`
        INSERT INTO revenues (branch_id, student_id, ec_id, amount, type, payment_method, note, created_at)
        VALUES (?, ?, ?, ?, 'tuition', 'bank_transfer', ?, NOW())
      `, [lead.branch_id, student.id, req.user.id, actualPaid, 'Thanh toán khi chuyển đổi']);
    }

    // Trừ quà tặng trong kho nếu có
    if (gifts && gifts.length > 0) {
      for (const gift of gifts) {
        if (gift.id) {
          await PromotionModel.decreaseItemStock(gift.id, 1, student.id, req.user.id);
        }
      }
    }

    // Cập nhật lead
    await LeadModel.convertToStudent(id, student.id, 0, 0, feeTotal || 0);

    // Gửi thông báo Telegram cho CM
    try {
      const remaining = feeTotalNum - actualPaid;
      await telegramService.sendMessage(
        `🎉 <b>Học viên mới${classId ? '' : ' chờ xếp lớp'}!</b>\n` +
        `👶 HS: ${studentName || lead.student_name}\n` +
        `📋 Mã: ${studentCode}\n` +
        `👤 PH: ${customerName || lead.customer_name} - ${customerPhone || lead.customer_phone}\n` +
        `📚 Môn: ${lead.subject_name || '-'}\n` +
        `💰 Học phí: ${feeTotalNum.toLocaleString('vi-VN')}đ\n` +
        `💵 Đã đóng: ${actualPaid.toLocaleString('vi-VN')}đ\n` +
        `📌 Còn nợ: ${remaining.toLocaleString('vi-VN')}đ\n` +
        `🎁 Quà: ${giftsStr || 'Không'}\n` +
        `👨‍💼 EC: ${lead.sale_name || '-'}\n` +
        (classId ? '' : `⏰ CM vui lòng xếp lớp!`)
      );
    } catch (e) { console.error('Telegram error:', e); }

    res.json({
      success: true,
      message: classId ? 'Đã chuyển đổi và xếp lớp thành công!' : 'Đã chuyển đổi thành học sinh. CM sẽ xếp lớp sau.',
      data: {
        id: student.id,
        studentId: student.id,
        student_code: studentCode,
        studentCode: studentCode,
        full_name: studentName || lead.student_name,
        fee_total: feeTotal || 0,
        deposit_amount: actualPaid,
        actual_revenue: actualPaid,
        remaining: feeTotalNum - actualPaid
      }
    });
  } catch (error) { next(error); }
};

// Check duplicate phone
export const checkPhone = async (req, res, next) => {
  try {
    const { phone } = req.query;
    const branchId = getBranchFilter(req);
    const existing = await LeadModel.findByPhone(phone, branchId);

    res.json({
      success: true,
      exists: !!existing,
      data: existing ? {
        id: existing.id,
        code: existing.code,
        customerName: existing.customer_name,
        studentName: existing.student_name,
        status: existing.status
      } : null
    });
  } catch (error) { next(error); }
};

// ============ CALL LOGS ============

// Add call log
export const addCallLog = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { duration, result, note, called_at } = req.body;

    await LeadModel.addCallLog({
      lead_id: id,
      user_id: req.user.id,
      duration: duration || 0,
      result: result || null,
      note: note || null,
      called_at: called_at || new Date()
    });

    res.json({ success: true, message: 'Đã lưu ghi chú cuộc gọi' });
  } catch (error) { next(error); }
};

// Get call logs
export const getCallLogs = async (req, res, next) => {
  try {
    const { id } = req.params;
    const logs = await LeadModel.getCallLogs(id);
    res.json({ success: true, data: logs });
  } catch (error) { next(error); }
};

// ============ TRIAL REPORT ============

// Get trial attendance report
export const getTrialReport = async (req, res, next) => {
  try {
    const { start_date, end_date, branch_id, branchId, source, status, search, page = 1, limit = 50 } = req.query;
    const effectiveBranchId = branch_id || branchId || getBranchFilter(req);
    const offset = (page - 1) * limit;

    // Main query - leads that have scheduled or attended trials
    // Dùng scheduled_date cho ngày hẹn, updated_at cho ngày đến (khi status thay đổi)
    let sql = `
      SELECT 
        l.id, l.student_name, l.customer_name, l.customer_phone, l.source,
        l.status, l.scheduled_date, 
        CASE WHEN l.status IN ('attended', 'waiting', 'converted') THEN DATE(l.updated_at) ELSE NULL END as attended_date,
        l.note, l.trial_sessions_attended,
        b.name as branch_name,
        u.full_name as ec_name
      FROM leads l
      LEFT JOIN branches b ON l.branch_id = b.id
      LEFT JOIN users u ON l.sale_id = u.id
      WHERE l.status IN ('scheduled', 'attended', 'waiting', 'converted')
    `;
    const params = [];

    // Date filter - by scheduled_date hoặc updated_at (ngày đến)
    if (start_date) {
      sql += ' AND (l.scheduled_date >= ? OR (l.status IN ("attended", "waiting", "converted") AND DATE(l.updated_at) >= ?))';
      params.push(start_date, start_date);
    }
    if (end_date) {
      sql += ' AND (l.scheduled_date <= ? OR (l.status IN ("attended", "waiting", "converted") AND DATE(l.updated_at) <= ?))';
      params.push(end_date, end_date);
    }
    if (effectiveBranchId) {
      sql += ' AND l.branch_id = ?';
      params.push(effectiveBranchId);
    }
    if (source) {
      sql += ' AND l.source = ?';
      params.push(source);
    }
    if (status) {
      sql += ' AND l.status = ?';
      params.push(status);
    }
    if (search) {
      sql += ' AND (l.student_name LIKE ? OR l.customer_name LIKE ? OR l.customer_phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    // Count total
    const countSql = sql.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
    const [countResult] = await LeadModel.db.query(countSql, params);
    const total = countResult[0]?.total || 0;

    // Add pagination
    sql += ' ORDER BY COALESCE(l.updated_at, l.scheduled_date) DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [rows] = await LeadModel.db.query(sql, params);

    // Summary query
    let summarySql = `
      SELECT 
        COUNT(*) as total_scheduled,
        COUNT(CASE WHEN status IN ('attended', 'waiting', 'converted') THEN 1 END) as attended,
        COUNT(CASE WHEN status = 'converted' THEN 1 END) as converted,
        COUNT(CASE WHEN status = 'waiting' THEN 1 END) as waiting
      FROM leads
      WHERE status IN ('scheduled', 'attended', 'waiting', 'converted')
    `;
    const summaryParams = [];

    if (start_date) {
      summarySql += ' AND (scheduled_date >= ? OR (status IN ("attended", "waiting", "converted") AND DATE(updated_at) >= ?))';
      summaryParams.push(start_date, start_date);
    }
    if (end_date) {
      summarySql += ' AND (scheduled_date <= ? OR (status IN ("attended", "waiting", "converted") AND DATE(updated_at) <= ?))';
      summaryParams.push(end_date, end_date);
    }
    if (effectiveBranchId) {
      summarySql += ' AND branch_id = ?';
      summaryParams.push(effectiveBranchId);
    }

    const [summaryResult] = await LeadModel.db.query(summarySql, summaryParams);

    res.json({
      success: true,
      data: rows,
      summary: {
        scheduled: summaryResult[0]?.total_scheduled || 0,
        attended: summaryResult[0]?.attended || 0,
        converted: summaryResult[0]?.converted || 0,
        waiting: summaryResult[0]?.waiting || 0
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) { next(error); }
};

// Export trial report as CSV
export const exportTrialReport = async (req, res, next) => {
  try {
    const { start_date, end_date, branch_id, branchId, source, status } = req.query;
    const effectiveBranchId = branch_id || branchId || getBranchFilter(req);

    let sql = `
      SELECT
        l.student_name as 'Tên học sinh',
        l.customer_name as 'Tên phụ huynh',
        l.customer_phone as 'SĐT',
        l.source as 'Nguồn',
        b.name as 'Cơ sở',
        DATE_FORMAT(l.scheduled_date, '%d/%m/%Y') as 'Ngày hẹn',
        CASE WHEN l.status IN ('attended', 'waiting', 'converted') 
          THEN DATE_FORMAT(l.updated_at, '%d/%m/%Y') ELSE '' END as 'Ngày đến',
        l.trial_sessions_attended as 'Số buổi TN',
        CASE l.status 
          WHEN 'attended' THEN 'Đã đến'
          WHEN 'converted' THEN 'Đã chuyển đổi'
          WHEN 'waiting' THEN 'Chờ xử lý'
          WHEN 'scheduled' THEN 'Đã hẹn'
          ELSE l.status
        END as 'Trạng thái',
        u.full_name as 'EC phụ trách',
        l.note as 'Ghi chú'
      FROM leads l
      LEFT JOIN branches b ON l.branch_id = b.id
      LEFT JOIN users u ON l.sale_id = u.id
      WHERE l.status IN ('scheduled', 'attended', 'waiting', 'converted')
    `;
    const params = [];

    if (start_date) {
      sql += ' AND (l.scheduled_date >= ? OR (l.status IN ("attended", "waiting", "converted") AND DATE(l.updated_at) >= ?))';
      params.push(start_date, start_date);
    }
    if (end_date) {
      sql += ' AND (l.scheduled_date <= ? OR (l.status IN ("attended", "waiting", "converted") AND DATE(l.updated_at) <= ?))';
      params.push(end_date, end_date);
    }
    if (effectiveBranchId) {
      sql += ' AND l.branch_id = ?';
      params.push(effectiveBranchId);
    }
    if (source) {
      sql += ' AND l.source = ?';
      params.push(source);
    }
    if (status) {
      sql += ' AND l.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY COALESCE(l.updated_at, l.scheduled_date) DESC';

    const [rows] = await LeadModel.db.query(sql, params);

    // Generate CSV
    if (!rows.length) {
      return res.status(404).json({ success: false, message: 'Không có dữ liệu' });
    }

    const headers = Object.keys(rows[0]);
    const csvContent = '\uFEFF' + // BOM for UTF-8
      headers.join(',') + '\n' +
      rows.map(row => headers.map(h => `"${(row[h] || '').toString().replace(/"/g, '""')}"`).join(',')).join('\n');

    const filename = `bao-cao-trai-nghiem-${start_date || 'all'}-${end_date || 'all'}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) { next(error); }
};
export const getCalendar = async (req, res) => {
  try {
    const { year, month, branchId } = req.query;

    if (!year || !month) {
      return res.status(400).json({
        success: false,
        message: 'Vui lòng cung cấp year và month'
      });
    }

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

    let query = `
      SELECT 
        l.id,
        l.code,
        l.student_name,
        l.customer_name,
        l.customer_phone,
        l.status,
        l.scheduled_date,
        l.scheduled_time,
        l.source,
        l.note,
        b.code as branch_code,
        b.name as branch_name,
        u.full_name as sale_name
      FROM leads l
      LEFT JOIN branches b ON l.branch_id = b.id
      LEFT JOIN users u ON l.sale_id = u.id
      WHERE l.scheduled_date BETWEEN ? AND ?
    `;

    const params = [startDate, endDate];

    // Branch filter
    if (branchId) {
      query += ` AND l.branch_id = ?`;
      params.push(branchId);
    } else if (!req.user.is_system_wide && req.user.primaryBranch) {
      // Nếu không phải system wide, lọc theo branch của user
      query += ` AND l.branch_id = ?`;
      params.push(req.user.primaryBranch.id);
    }

    // Role-based filter
    const role = req.user.role_name;
    if (!['ADMIN', 'GDV', 'CHU', 'QLCS', 'HOEC'].includes(role)) {
      query += ` AND l.sale_id = ?`;
      params.push(req.user.id);
    }

    query += ` ORDER BY l.scheduled_date, l.scheduled_time`;

    const [rows] = await db.query(query, params);

    res.json({ success: true, data: rows });

  } catch (error) {
    console.error('Get calendar error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};


// GET /api/leads/stats
export const getLeadStats = async (req, res) => {
  try {
    const { branchId } = req.query;

    let query = `SELECT status, COUNT(*) as count FROM leads WHERE 1=1`;
    const params = [];

    // Branch filter
    if (branchId) {
      query += ` AND branch_id = ?`;
      params.push(branchId);
    } else if (!req.user.is_system_wide && req.user.primaryBranch) {
      query += ` AND branch_id = ?`;
      params.push(req.user.primaryBranch.id);
    }

    // Role-based filter
    const role = req.user.role_name;
    if (!['ADMIN', 'GDV', 'CHU', 'QLCS', 'HOEC'].includes(role)) {
      query += ` AND sale_id = ?`;
      params.push(req.user.id);
    }

    query += ` GROUP BY status`;

    const [rows] = await db.query(query, params);

    const stats = {
      total: 0,
      new: 0,
      scheduled: 0,
      attended: 0,
      waiting: 0,
      trial: 0,
      converted: 0,
      cancelled: 0,
      no_show: 0
    };

    rows.forEach(row => {
      if (Object.prototype.hasOwnProperty.call(stats, row.status)) {
        stats[row.status] = row.count;
      }
      stats.total += row.count;
    });

    res.json({ success: true, data: stats });

  } catch (error) {
    console.error('Get lead stats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

