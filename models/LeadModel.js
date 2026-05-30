import BaseModel from './BaseModel.js';

class LeadModel extends BaseModel {
  constructor() {
    super('leads');
  }

  async generateCode(branchCode) {
    const prefix = branchCode || 'LD';
    const timePart = Date.now().toString(36).toUpperCase();
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${timePart}${randomPart}`;
  }

  async findAllWithRelations({ status, fromDate, toDate, search, saleId, branchId, source, page = 1, limit = 20 } = {}) {
    let sql = `
      SELECT l.id, l.branch_id, l.code, l.customer_name, l.customer_phone, l.customer_email,
             l.student_name, l.student_birth_year, l.subject_id, l.level_id,
             TO_CHAR(l.scheduled_date, 'YYYY-MM-DD') as scheduled_date,
             l.scheduled_time, l.status, l.trial_class_id, l.trial_sessions_max,
             l.trial_sessions_attended, l.converted_student_id, l.rating, l.feedback,
             l.note, l.source, l.sale_id, l.created_at, l.updated_at,
             COALESCE(st.fee_total, l.fee_total, 0) as fee_total,
             COALESCE(st.actual_revenue, 0) as actual_revenue,
             COALESCE(st.deposit_amount, l.deposit_amount, 0) as deposit_amount,
             st.fee_status as student_fee_status,
             b.name as branch_name, b.code as branch_code,
             s.name as subject_name,
             lv.name as level_name,
             c.class_name as trial_class_name,
             u.full_name as sale_name,
             st.full_name as converted_student_name,
             st.student_code as converted_student_code
      FROM leads l
      LEFT JOIN branches b ON l.branch_id = b.id
      LEFT JOIN subjects s ON l.subject_id = s.id
      LEFT JOIN levels lv ON l.level_id = lv.id
      LEFT JOIN classes c ON l.trial_class_id = c.id
      LEFT JOIN users u ON l.sale_id = u.id
      LEFT JOIN students st ON l.converted_student_id = st.id
      WHERE 1=1
    `;
    const params = [];

    if (branchId) { sql += ' AND l.branch_id = ?'; params.push(branchId); }
    if (status) { sql += ' AND l.status = ?'; params.push(status); }
    if (source) { sql += ' AND l.source = ?'; params.push(source); }
    if (fromDate) { sql += ' AND l.scheduled_date >= ?'; params.push(fromDate); }
    if (toDate) { sql += ' AND l.scheduled_date <= ?'; params.push(toDate); }
    if (search) {
      sql += ' AND (l.customer_name ILIKE ? OR l.student_name ILIKE ? OR l.customer_phone ILIKE ? OR l.code ILIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (saleId) { sql += ' AND l.sale_id = ?'; params.push(saleId); }

    const countSql = sql.replace(/SELECT .* FROM/, 'SELECT COUNT(*) as total FROM');
    const [countRows] = await this.db.query(countSql, params);
    const total = parseInt(countRows[0]?.total || 0);

    sql += ' ORDER BY l.scheduled_date DESC, l.scheduled_time DESC, l.created_at DESC';
    sql += ' LIMIT ? OFFSET ?';
    params.push(+limit, (+page - 1) * +limit);

    const [rows] = await this.db.query(sql, params);
    return { data: rows, pagination: { page: +page, limit: +limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getByMonth(year, month, saleId = null, branchId = null) {
    let sql = `
      SELECT l.id, l.branch_id, l.code, l.customer_name, l.customer_phone, l.customer_email,
             l.student_name, l.student_birth_year, l.subject_id, l.level_id,
             TO_CHAR(l.scheduled_date, 'YYYY-MM-DD') as scheduled_date,
             l.scheduled_time, l.status, l.trial_class_id, l.trial_sessions_max,
             l.trial_sessions_attended, l.rating, l.feedback, l.note, l.source, l.sale_id,
             b.code as branch_code,
             s.name as subject_name
      FROM leads l
      LEFT JOIN branches b ON l.branch_id = b.id
      LEFT JOIN subjects s ON l.subject_id = s.id
      WHERE (
        (EXTRACT(YEAR FROM l.scheduled_date) = ? AND EXTRACT(MONTH FROM l.scheduled_date) = ?
         AND l.status IN ('scheduled', 'trial', 'waiting', 'attended'))
        OR (l.status = 'converted' AND EXTRACT(YEAR FROM l.scheduled_date) = ? AND EXTRACT(MONTH FROM l.scheduled_date) = ?)
      )
    `;
    const params = [year, month, year, month];

    if (branchId) { sql += ' AND l.branch_id = ?'; params.push(branchId); }
    if (saleId) { sql += ' AND l.sale_id = ?'; params.push(saleId); }

    sql += ' ORDER BY l.scheduled_date, l.scheduled_time';
    const [rows] = await this.db.query(sql, params);
    return rows;
  }

  async findByIdWithRelations(id) {
    const [rows] = await this.db.query(`
      SELECT l.*,
             TO_CHAR(l.scheduled_date, 'YYYY-MM-DD') as scheduled_date,
             b.name as branch_name, b.code as branch_code,
             s.name as subject_name,
             lv.name as level_name,
             c.id as trial_class_id, c.class_name as trial_class_name,
             u.full_name as sale_name,
             st.id as converted_student_id,
             st.full_name as converted_student_name,
             st.student_code as converted_student_code,
             COALESCE(st.fee_total, l.fee_total, 0) as fee_total,
             COALESCE(st.actual_revenue, 0) as actual_revenue,
             COALESCE(st.deposit_amount, l.deposit_amount, 0) as deposit_amount,
             st.fee_status as student_fee_status
      FROM leads l
      LEFT JOIN branches b ON l.branch_id = b.id
      LEFT JOIN subjects s ON l.subject_id = s.id
      LEFT JOIN levels lv ON l.level_id = lv.id
      LEFT JOIN classes c ON l.trial_class_id = c.id
      LEFT JOIN users u ON l.sale_id = u.id
      LEFT JOIN students st ON l.converted_student_id = st.id
      WHERE l.id = ?
    `, [id]);
    return rows[0] || null;
  }

  async getStats(saleId = null, branchId = null) {
    let whereClause = '1=1';
    const params = [];

    if (branchId) { whereClause += ' AND branch_id = ?'; params.push(branchId); }
    if (saleId) { whereClause += ' AND sale_id = ?'; params.push(saleId); }

    const [rows] = await this.db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'new') as "new",
        COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
        COUNT(*) FILTER (WHERE status = 'attended') as attended,
        COUNT(*) FILTER (WHERE status = 'waiting') as waiting,
        COUNT(*) FILTER (WHERE status = 'trial') as trial,
        COUNT(*) FILTER (WHERE status = 'converted') as converted,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        COUNT(*) FILTER (WHERE status = 'no_show') as no_show,
        COUNT(*) FILTER (WHERE scheduled_date = CURRENT_DATE AND status IN ('scheduled', 'trial')) as today,
        COUNT(*) FILTER (WHERE scheduled_date = CURRENT_DATE + INTERVAL '1 day' AND status = 'scheduled') as tomorrow,
        COUNT(*) FILTER (WHERE status = 'waiting') as pending_action
      FROM leads WHERE ${whereClause}
    `, params);

    return rows[0];
  }

  async updateStatus(id, status, extraData = {}) {
    const data = { status, ...extraData };
    if (status === 'converted' && !extraData.converted_at) {
      data.converted_at = new Date();
    }
    return this.update(id, data);
  }

  async assignTrialClass(id, classId) {
    return this.update(id, { trial_class_id: classId, status: 'trial' });
  }

  async incrementTrialSessions(id) {
    await this.db.query(
      'UPDATE leads SET trial_sessions_attended = trial_sessions_attended + 1 WHERE id = ?',
      [id]
    );
  }

  async convertToStudent(id, studentId, _actualRevenue = 0, _depositAmount = 0, feeTotal = 0) {
    return this.update(id, {
      status: 'converted',
      converted_student_id: studentId,
      converted_at: new Date(),
      fee_total: feeTotal
    });
  }

  async findByPhone(phone, branchId = null) {
    let sql = 'SELECT * FROM leads WHERE customer_phone = ?';
    const params = [phone];

    if (branchId) {
      sql += ' AND branch_id = ?';
      params.push(branchId);
    }

    sql += ' ORDER BY created_at DESC LIMIT 1';
    const [rows] = await this.db.query(sql, params);
    return rows[0] || null;
  }

  async addCallLog(data) {
    const sql = `INSERT INTO lead_call_logs (lead_id, user_id, duration, result, note, called_at, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, NOW()) RETURNING id`;
    const [rows] = await this.db.query(sql, [
      data.lead_id,
      data.user_id,
      data.duration || 0,
      data.result || null,
      data.note || null,
      data.called_at || new Date()
    ]);
    return rows[0]?.id;
  }

  async getCallLogs(leadId) {
    const sql = `SELECT cl.*, u.full_name as caller_name
                 FROM lead_call_logs cl
                 LEFT JOIN users u ON cl.user_id = u.id
                 WHERE cl.lead_id = ?
                 ORDER BY cl.called_at DESC
                 LIMIT 50`;
    const [rows] = await this.db.query(sql, [leadId]);
    return rows;
  }
}

export default new LeadModel();
