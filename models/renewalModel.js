import BaseModel from './BaseModel.js';

class RenewalModel extends BaseModel {
  constructor() {
    super('student_renewals');
  }

  // Lấy danh sách học sinh cần tái phí
  async getStudentsForRenewal(month, branchId = null, classId = null) {
    // Tính ngày đầu và cuối của tháng được chọn
    const monthStart = `${month}-01`;
    const monthEnd = new Date(month + '-01');
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    monthEnd.setDate(0);
    const monthEndStr = monthEnd.toISOString().slice(0, 10);

    // Ngày hiện tại
    const today = new Date().toISOString().slice(0, 10);

    // Ngày 30 ngày sau
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
    const thirtyDaysLaterStr = thirtyDaysLater.toISOString().slice(0, 10);

    let branchFilter = '';
    const params = [monthStart, monthEndStr, today, thirtyDaysLaterStr, today];

    if (branchId) {
      branchFilter = 'AND cs.branch_id = ?';
      params.push(branchId);
    }

    let classFilter = '';
    if (classId) {
      classFilter = 'AND cs.class_id = ?';
      params.push(classId);
    }

    const sql = `
      SELECT 
        s.id,
        s.student_code,
        s.full_name,
        s.parent_phone,
        s.fee_end_date,
        DATEDIFF(s.fee_end_date, CURDATE()) as days_remaining,
        c.id as class_id,
        c.class_name,
        c.subject_id,
        subj.name as subject_name,
        cm.full_name as cm_name,
        p.name as package_name,
        p.sessions as total_sessions,
        COALESCE(att.completed_sessions, 0) as completed_sessions,
        b.code as branch_code,
        b.name as branch_name,
        CASE 
          WHEN EXISTS (
            SELECT 1 FROM student_renewals sr 
            WHERE sr.student_id = s.id 
              AND DATE_FORMAT(sr.created_at, '%Y-%m') = DATE_FORMAT(?, '%Y-%m')
          ) THEN 'renewed'
          WHEN s.fee_end_date < ? THEN 'expired'
          WHEN s.fee_end_date <= ? THEN 'expiring'
          ELSE 'active'
        END as status
      FROM students s
      LEFT JOIN class_students cs ON cs.student_id = s.id AND cs.status = 'active'
      LEFT JOIN classes c ON c.id = cs.class_id
      LEFT JOIN subjects subj ON subj.id = c.subject_id
      LEFT JOIN users cm ON cm.id = c.cm_id
      LEFT JOIN branches b ON b.id = cs.branch_id
      LEFT JOIN packages p ON p.id = s.package_id
      LEFT JOIN (
        SELECT student_id, COUNT(*) as completed_sessions
        FROM session_attendance
        WHERE status IN ('present', 'late')
        GROUP BY student_id
      ) att ON att.student_id = s.id
      WHERE s.status = 'active'
        AND (
          s.fee_end_date BETWEEN ? AND ?
          OR s.fee_end_date < ?
          OR EXISTS (
            SELECT 1 FROM student_renewals sr 
            WHERE sr.student_id = s.id 
              AND DATE_FORMAT(sr.created_at, '%Y-%m') = DATE_FORMAT(?, '%Y-%m')
          )
        )
        ${branchFilter}
        ${classFilter}
      GROUP BY s.id
      ORDER BY 
        CASE 
          WHEN s.fee_end_date < CURDATE() THEN 1
          WHEN s.fee_end_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 2
          ELSE 3
        END,
        s.fee_end_date ASC
    `;

    params.push(monthStart); // For the last EXISTS check

    const [rows] = await this.db.query(sql, params);

    // Calculate stats
    const stats = {
      total: rows.length,
      expiring: rows.filter(r => r.status === 'expiring').length,
      expired: rows.filter(r => r.status === 'expired').length,
      renewed: rows.filter(r => r.status === 'renewed').length
    };

    return { students: rows, stats };
  }

  // Tạo renewal mới
  async createRenewal(data) {
    const { student_id, package_id, renewal_type, new_class_id, promotion_id, scholarship_months, deposit_amount, paid_amount, payment_status, note, created_by } = data;

    // Lấy thông tin package
    const [pkgRows] = await this.db.query('SELECT * FROM packages WHERE id = ?', [package_id]);
    if (!pkgRows.length) {
      throw new Error('Gói học không tồn tại');
    }
    const pkg = pkgRows[0];
    const pkgPrice = parseFloat(pkg.price) || parseFloat(pkg.base_price) || 0;
    const pkgMonths = parseInt(pkg.months) || 0;
    const pkgSessions = parseInt(pkg.sessions_count) || parseInt(pkg.sessions) || 0;

    // Tính giá sau khuyến mãi
    let promoDiscount = 0;

    if (promotion_id) {
      const [promoRows] = await this.db.query('SELECT * FROM promotion_programs WHERE id = ?', [promotion_id]);
      if (promoRows.length) {
        const promo = promoRows[0];
        if (promo.discount_type === 'percent') {
          promoDiscount = Math.round(pkgPrice * (parseFloat(promo.discount_value) || 0) / 100);
        } else {
          promoDiscount = parseFloat(promo.discount_value) || 0;
        }
      }
    }

    // Học bổng = thêm tháng học miễn phí, KHÔNG trừ tiền
    const bonusMonths = parseInt(scholarship_months) || 0;
    const totalMonths = pkgMonths + bonusMonths;

    const finalPrice = Math.max(0, pkgPrice - promoDiscount);
    const actualPaid = parseFloat(paid_amount) || parseFloat(deposit_amount) || 0;
    const remainingAmount = Math.max(0, finalPrice - actualPaid);

    // Bắt đầu transaction
    const conn = await this.db.getConnection();
    try {
      await conn.beginTransaction();

      // 1. Tạo renewal record
      const [renewalResult] = await conn.query(`
        INSERT INTO student_renewals 
        (student_id, package_id, renewal_type, new_class_id, promotion_id, 
         original_price, discount_amount, scholarship_months, final_price, deposit_amount, paid_amount, remaining_amount, payment_status,
         note, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `, [student_id, package_id, renewal_type, new_class_id || null, promotion_id || null,
        pkgPrice, promoDiscount, bonusMonths, finalPrice, parseFloat(deposit_amount) || 0, actualPaid, remainingAmount, payment_status || 'pending',
        note || '', created_by]);

      // 2. Cập nhật student - thêm sessions và gia hạn fee_end_date
      const [studentRows] = await conn.query('SELECT * FROM students WHERE id = ?', [student_id]);
      const student = studentRows[0];

      // Tính ngày hết phí mới
      let newFeeEndDate;
      if (student.fee_end_date && new Date(student.fee_end_date) > new Date()) {
        // Còn hạn - cộng thêm từ ngày hết phí cũ
        newFeeEndDate = new Date(student.fee_end_date);
      } else {
        // Hết hạn - tính từ hôm nay
        newFeeEndDate = new Date();
      }

      // Tính số tháng = tháng gói + học bổng
      newFeeEndDate.setMonth(newFeeEndDate.getMonth() + totalMonths);

      await conn.query(`
        UPDATE students SET 
          package_id = ?,
          fee_end_date = ?,
          tuition_fee = COALESCE(tuition_fee, 0) + ?,
          discount_amount = COALESCE(discount_amount, 0) + ?,
          paid_amount = COALESCE(paid_amount, 0) + ?,
          scholarship_months = COALESCE(scholarship_months, 0) + ?,
          sessions_remaining = COALESCE(sessions_remaining, 0) + ?,
          fee_status = 'active',
          updated_at = NOW()
        WHERE id = ?
      `, [package_id, newFeeEndDate.toISOString().slice(0, 10),
        pkgPrice, promoDiscount, actualPaid, bonusMonths, pkgSessions,
        student_id]);

      // 3. Nếu là khóa mới và có chọn lớp mới - thêm vào lớp mới
      if (renewal_type === 'new' && new_class_id) {
        // Kiểm tra xem đã trong lớp chưa
        const [existingClass] = await conn.query(
          'SELECT * FROM class_students WHERE student_id = ? AND class_id = ?',
          [student_id, new_class_id]
        );

        if (!existingClass.length) {
          // Lấy branch của lớp mới
          const [classRows] = await conn.query('SELECT branch_id FROM classes WHERE id = ?', [new_class_id]);
          const branchId = classRows[0]?.branch_id;

          await conn.query(`
            INSERT INTO class_students (student_id, class_id, branch_id, status, enrolled_at)
            VALUES (?, ?, ?, 'active', NOW())
          `, [student_id, new_class_id, branchId]);
        }
      }

      // 4. Ghi nhận revenue nếu có đặt cọc
      if (deposit_amount > 0) {
        // Lấy EC của student
        const ecId = student.ec_id || created_by;

        await conn.query(`
          INSERT INTO revenues (student_id, ec_id, amount, type, note, created_at)
          VALUES (?, ?, ?, 'renewal_deposit', ?, NOW())
        `, [student_id, ecId, deposit_amount, `Cọc tái phí - ${pkg.name}`]);
      }

      await conn.commit();

      return {
        renewal_id: renewalResult.insertId,
        new_fee_end_date: newFeeEndDate.toISOString().slice(0, 10),
        final_price: finalPrice,
        remaining_amount: remainingAmount
      };

    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  // Lấy lịch sử tái phí của học sinh
  async getRenewalHistory(studentId) {
    const [rows] = await this.db.query(`
      SELECT sr.*, 
             p.name as package_name, p.sessions,
             promo.name as promotion_name,
             c.class_name as new_class_name,
             u.full_name as created_by_name
      FROM student_renewals sr
      LEFT JOIN packages p ON p.id = sr.package_id
      LEFT JOIN promotions promo ON promo.id = sr.promotion_id
      LEFT JOIN classes c ON c.id = sr.new_class_id
      LEFT JOIN users u ON u.id = sr.created_by
      WHERE sr.student_id = ?
      ORDER BY sr.created_at DESC
    `, [studentId]);

    return rows;
  }

  // Báo cáo tái phí theo tháng
  async getRenewalReport(month, branchId = null) {
    let branchFilter = '';
    const params = [month];

    if (branchId) {
      branchFilter = 'AND cs.branch_id = ?';
      params.push(branchId);
    }

    const [rows] = await this.db.query(`
      SELECT 
        DATE(sr.created_at) as date,
        COUNT(*) as count,
        SUM(sr.final_price) as total_value,
        SUM(sr.deposit_amount) as total_deposit,
        SUM(sr.remaining_amount) as total_remaining
      FROM student_renewals sr
      JOIN students s ON s.id = sr.student_id
      LEFT JOIN class_students cs ON cs.student_id = s.id AND cs.status = 'active'
      WHERE DATE_FORMAT(sr.created_at, '%Y-%m') = ?
        ${branchFilter}
      GROUP BY DATE(sr.created_at)
      ORDER BY date
    `, params);

    return rows;
  }
}

export default new RenewalModel();