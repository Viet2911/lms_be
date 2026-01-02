import BaseModel from './BaseModel.js';

class StudentModel extends BaseModel {
  constructor() {
    super('students');
  }

  generateCode(branchCode = 'HS') {
    return branchCode + '-' + Date.now().toString(36).toUpperCase();
  }

  async findAllWithRelations({ status, subjectId, search, saleId, branchId, feeStatus, page = 1, limit = 20 } = {}) {
    let sql = `
      SELECT s.*, b.name as branch_name, b.code as branch_code,
             sub.name as subject_name, l.name as level_name, u.full_name as sale_name,
             p.name as package_name, p.months as package_months,
             cl.name as current_level_name,
             (SELECT c.class_name FROM class_students cs JOIN classes c ON cs.class_id = c.id 
              WHERE cs.student_id = s.id AND cs.status = 'active' LIMIT 1) as class_name
      FROM students s
      JOIN branches b ON s.branch_id = b.id
      LEFT JOIN subjects sub ON s.subject_id = sub.id
      LEFT JOIN levels l ON s.level_id = l.id
      LEFT JOIN levels cl ON s.current_level_id = cl.id
      LEFT JOIN users u ON s.sale_id = u.id
      LEFT JOIN packages p ON s.package_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (branchId) { sql += ' AND s.branch_id = ?'; params.push(branchId); }
    if (saleId) { sql += ' AND s.sale_id = ?'; params.push(saleId); }
    if (status) { sql += ' AND s.status = ?'; params.push(status); }
    if (subjectId) { sql += ' AND s.subject_id = ?'; params.push(subjectId); }
    if (feeStatus) { sql += ' AND s.fee_status = ?'; params.push(feeStatus); }
    if (search) {
      sql += ' AND (s.full_name LIKE ? OR s.student_code LIKE ? OR s.parent_phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const countSql = sql.replace(/SELECT .* FROM/, 'SELECT COUNT(*) as total FROM');
    const [countRows] = await this.db.query(countSql, params);
    const total = countRows[0]?.total || 0;

    sql += ' ORDER BY s.created_at DESC LIMIT ? OFFSET ?';
    params.push(+limit, (+page - 1) * +limit);
    const [rows] = await this.db.query(sql, params);

    return { data: rows, pagination: { page: +page, limit: +limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findByIdWithRelations(id) {
    const [rows] = await this.db.query(
      `SELECT s.*, b.name as branch_name, b.code as branch_code,
              sub.name as subject_name, l.name as level_name, u.full_name as sale_name,
              p.name as package_name, p.months as package_months, p.sessions_count as package_sessions,
              cl.name as current_level_name
       FROM students s
       JOIN branches b ON s.branch_id = b.id
       LEFT JOIN subjects sub ON s.subject_id = sub.id
       LEFT JOIN levels l ON s.level_id = l.id
       LEFT JOIN levels cl ON s.current_level_id = cl.id
       LEFT JOIN users u ON s.sale_id = u.id
       LEFT JOIN packages p ON s.package_id = p.id
       WHERE s.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  async getStats(saleId = null, branchId = null) {
    let sql = `SELECT COUNT(*) as total,
      SUM(status = 'pending') as pending,
      SUM(status = 'waiting') as waiting,
      SUM(status = 'active') as active,
      SUM(status = 'paused') as paused,
      SUM(status = 'expired') as expired,
      SUM(status = 'quit_paid') as quit_paid,
      SUM(status = 'quit_refund') as quit_refund,
      SUM(status = 'reserved') as reserved,
      SUM(status = 'inactive') as inactive,
      SUM(status = 'graduated') as graduated,
      SUM(status = 'dropped') as dropped,
      SUM(fee_status = 'expiring_soon') as expiring_soon,
      SUM(payment_status = 'pending') as unpaid,
      SUM(payment_status = 'partial') as partial_paid,
      SUM(payment_status = 'paid') as fully_paid
      FROM students WHERE 1=1`;
    const params = [];
    if (branchId) { sql += ' AND branch_id = ?'; params.push(branchId); }
    if (saleId) { sql += ' AND sale_id = ?'; params.push(saleId); }
    const [rows] = await this.db.query(sql, params);
    return rows[0];
  }

  // Thay đổi trạng thái học sinh
  async changeStatus(studentId, newStatus, data = {}) {
    const student = await this.findById(studentId);
    if (!student) throw new Error('Học sinh không tồn tại');

    const oldStatus = student.status;

    // Update student status
    let updateSql = 'UPDATE students SET status = ?, status_changed_at = NOW()';
    const params = [newStatus];

    if (data.reason) {
      updateSql += ', status_reason = ?';
      params.push(data.reason);
    }

    if (newStatus === 'reserved' && data.reserveMonths) {
      updateSql += ', reserve_until = DATE_ADD(NOW(), INTERVAL ? MONTH)';
      params.push(data.reserveMonths);
    }

    if (newStatus === 'paused' && data.expectedReturn) {
      updateSql += ', expected_return_date = ?';
      params.push(data.expectedReturn);
    }

    if (newStatus === 'quit_refund' && data.refundAmount) {
      updateSql += ', refund_amount = ?';
      params.push(data.refundAmount);
    }

    updateSql += ' WHERE id = ?';
    params.push(studentId);

    await this.db.query(updateSql, params);

    // Log status change
    await this.db.query(`
      INSERT INTO student_status_logs (student_id, old_status, new_status, reason, changed_by, changed_at)
      VALUES (?, ?, ?, ?, ?, NOW())
    `, [studentId, oldStatus, newStatus, data.reason || null, data.changedBy || null]);

    return { oldStatus, newStatus };
  }

  // Lấy học sinh sắp hết phí
  async getExpiringStudents(branchId = null, limit = 20) {
    let sql = `
      SELECT s.id, s.full_name, s.student_code, s.parent_phone,
             s.remaining_sessions, s.fee_status, s.package_end_date,
             b.name as branch_name, b.code as branch_code,
             p.name as package_name,
             (SELECT c.class_name FROM class_students cs JOIN classes c ON cs.class_id = c.id 
              WHERE cs.student_id = s.id AND cs.status = 'active' LIMIT 1) as class_name
      FROM students s
      JOIN branches b ON s.branch_id = b.id
      LEFT JOIN packages p ON s.package_id = p.id
      WHERE s.fee_status IN ('expiring_soon', 'expired') AND s.status = 'active'
    `;
    const params = [];

    if (branchId) {
      sql += ' AND s.branch_id = ?';
      params.push(branchId);
    }

    sql += ' ORDER BY s.remaining_sessions ASC, s.fee_status DESC LIMIT ?';
    params.push(limit);

    const [rows] = await this.db.query(sql, params);
    return rows;
  }

  // Cập nhật số buổi sau khi điểm danh
  async decrementSession(studentId) {
    await this.db.query(`
      UPDATE students SET 
        used_sessions = used_sessions + 1,
        remaining_sessions = remaining_sessions - 1,
        level_sessions_completed = level_sessions_completed + 1,
        fee_status = CASE 
          WHEN remaining_sessions - 1 <= 0 THEN 'expired'
          WHEN remaining_sessions - 1 <= 4 THEN 'expiring_soon'
          ELSE 'active'
        END
      WHERE id = ? AND remaining_sessions > 0
    `, [studentId]);

    // Kiểm tra hoàn thành level
    const student = await this.findById(studentId);
    if (student && student.level_sessions_completed >= 15) {
      await this.completeLevel(studentId);
    }
  }

  // Hoàn thành level hiện tại
  async completeLevel(studentId) {
    const student = await this.findByIdWithRelations(studentId);
    if (!student || !student.current_level_id) return;

    // Lưu lịch sử
    await this.db.query(`
      UPDATE student_level_history SET 
        completed_at = CURDATE(), 
        sessions_completed = ?,
        status = 'completed'
      WHERE student_id = ? AND level_id = ? AND status = 'in_progress'
    `, [student.level_sessions_completed, studentId, student.current_level_id]);

    // Tìm level tiếp theo
    const [nextLevel] = await this.db.query(`
      SELECT id FROM levels 
      WHERE order_index > (SELECT order_index FROM levels WHERE id = ?)
      ORDER BY order_index ASC LIMIT 1
    `, [student.current_level_id]);

    if (nextLevel.length > 0) {
      // Chuyển sang level mới
      await this.db.query(`
        UPDATE students SET 
          current_level_id = ?,
          level_sessions_completed = 0
        WHERE id = ?
      `, [nextLevel[0].id, studentId]);

      // Tạo lịch sử level mới
      await this.db.query(`
        INSERT INTO student_level_history (student_id, level_id, started_at)
        VALUES (?, ?, CURDATE())
      `, [studentId, nextLevel[0].id]);
    }
  }

  // Gia hạn học phí
  async renewPackage(studentId, packageId, branchId, data) {
    const student = await this.findById(studentId);
    if (!student) throw new Error('Học viên không tồn tại');

    // Lấy giá gói
    const [priceRows] = await this.db.query(`
      SELECT COALESCE(bp.price, p.base_price) as price, p.sessions_count, p.months
      FROM packages p
      LEFT JOIN branch_packages bp ON p.id = bp.package_id AND bp.branch_id = ?
      WHERE p.id = ?
    `, [branchId, packageId]);

    if (priceRows.length === 0) throw new Error('Gói học không tồn tại');

    const pkg = priceRows[0];
    const scholarshipSessions = (data.scholarship_months || 0) * 4;
    const totalSessionsToAdd = pkg.sessions_count + scholarshipSessions;
    const finalPrice = pkg.price - (data.discount_amount || 0);
    const remainingAmount = finalPrice - (data.deposit_amount || 0);

    // Tạo renewal record
    const [result] = await this.db.query(`
      INSERT INTO student_renewals 
        (student_id, package_id, branch_id, ec_id, sessions_added, 
         scholarship_months, scholarship_sessions, package_price, 
         discount_amount, final_price, deposit_amount, paid_amount, 
         remaining_amount, status, start_date, end_date, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      studentId, packageId, branchId, data.ec_id || null,
      pkg.sessions_count, data.scholarship_months || 0, scholarshipSessions,
      pkg.price, data.discount_amount || 0, finalPrice,
      data.deposit_amount || 0, data.paid_amount || 0, remainingAmount,
      data.deposit_amount > 0 ? 'deposited' : 'pending',
      data.start_date || new Date(),
      data.end_date || null,
      data.note || null
    ]);

    // Cập nhật student nếu đã thanh toán đủ
    if (data.paid_amount >= finalPrice) {
      await this.db.query(`
        UPDATE students SET 
          package_id = ?,
          package_start_date = ?,
          package_end_date = DATE_ADD(?, INTERVAL ? MONTH),
          total_sessions = total_sessions + ?,
          scholarship_months = scholarship_months + ?,
          scholarship_sessions = scholarship_sessions + ?,
          remaining_sessions = remaining_sessions + ?,
          total_paid = total_paid + ?,
          fee_status = 'active'
        WHERE id = ?
      `, [
        packageId, data.start_date || new Date(),
        data.start_date || new Date(), pkg.months,
        pkg.sessions_count, data.scholarship_months || 0, scholarshipSessions,
        totalSessionsToAdd, finalPrice, studentId
      ]);

      // Cập nhật renewal status
      await this.db.query(
        'UPDATE student_renewals SET status = ?, payment_date = CURDATE() WHERE id = ?',
        ['paid', result.insertId]
      );
    }

    return { renewalId: result.insertId, totalSessionsAdded: totalSessionsToAdd };
  }

  async addToClass(studentId, classId) {
    await this.db.query(
      'INSERT INTO class_students (student_id, class_id, status) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE status = ?',
      [studentId, classId, 'active', 'active']
    );
  }

  async findByClass(classId) {
    const [rows] = await this.db.query(
      `SELECT s.*, cs.status as enrollment_status,
              s.remaining_sessions, s.fee_status, s.level_sessions_completed,
              cl.name as current_level_name
       FROM students s
       JOIN class_students cs ON s.id = cs.student_id
       LEFT JOIN levels cl ON s.current_level_id = cl.id
       WHERE cs.class_id = ? AND cs.status = 'active'
       ORDER BY s.full_name`,
      [classId]
    );
    return rows;
  }

  // Lấy lịch sử học phần của học sinh
  async getLevelHistory(studentId) {
    const [rows] = await this.db.query(`
      SELECT slh.*, l.name as level_name
      FROM student_level_history slh
      JOIN levels l ON slh.level_id = l.id
      WHERE slh.student_id = ?
      ORDER BY slh.started_at DESC
    `, [studentId]);
    return rows;
  }

  // Lấy lịch sử gia hạn của học sinh
  async getRenewalHistory(studentId) {
    const [rows] = await this.db.query(`
      SELECT sr.*, p.name as package_name, u.full_name as ec_name
      FROM student_renewals sr
      JOIN packages p ON sr.package_id = p.id
      LEFT JOIN users u ON sr.ec_id = u.id
      WHERE sr.student_id = ?
      ORDER BY sr.created_at DESC
    `, [studentId]);
    return rows;
  }

  // Xác nhận đã nhận thanh toán - cập nhật actual_revenue
  async confirmPayment(studentId, { amount, paymentMethod, proofUrl, note, confirmedBy }) {
    const conn = await this.db.getConnection();
    try {
      await conn.beginTransaction();

      // Lấy thông tin học sinh hiện tại
      const [students] = await conn.query(
        'SELECT id, actual_revenue, fee_total, fee_status, branch_id, sale_id FROM students WHERE id = ?',
        [studentId]
      );

      if (!students.length) {
        throw new Error('Không tìm thấy học sinh');
      }

      const student = students[0];
      const currentRevenue = parseFloat(student.actual_revenue) || 0;
      const paymentAmount = parseFloat(amount) || 0;
      const newActualRevenue = currentRevenue + paymentAmount;
      const feeTotal = parseFloat(student.fee_total) || 0;

      // Xác định trạng thái thanh toán mới
      let newFeeStatus = 'partial';
      if (newActualRevenue >= feeTotal && feeTotal > 0) {
        newFeeStatus = 'paid';
      } else if (newActualRevenue <= 0) {
        newFeeStatus = 'pending';
      }

      // Cập nhật actual_revenue và fee_status trong students
      const [updateResult] = await conn.query(`
        UPDATE students 
        SET actual_revenue = ?, fee_status = ?, updated_at = NOW()
        WHERE id = ?
      `, [newActualRevenue, newFeeStatus, studentId]);

      // Kiểm tra update có thành công không
      if (updateResult.affectedRows === 0) {
        throw new Error('Không thể cập nhật thông tin học sinh');
      }

      // Ghi nhận vào revenues (doanh thu)
      await conn.query(`
        INSERT INTO revenues (branch_id, student_id, ec_id, amount, type, payment_method, proof_url, note, created_at)
        VALUES (?, ?, ?, ?, 'tuition', ?, ?, ?, NOW())
      `, [student.branch_id, studentId, confirmedBy, paymentAmount, paymentMethod, proofUrl || null, note]);

      await conn.commit();

      return {
        studentId,
        previousRevenue: currentRevenue,
        newRevenue: newActualRevenue,
        feeStatus: newFeeStatus,
        amountReceived: paymentAmount
      };
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}

export default new StudentModel();