import BaseModel from './BaseModel.js';

class ExperienceModel extends BaseModel {
  constructor() {
    super('experience_schedules');
  }

  generateCode(branchCode = 'EXP') {
    return branchCode + '-' + Date.now().toString(36).toUpperCase();
  }

  async findAllWithRelations({ status, fromDate, toDate, search, saleId, branchId, page = 1, limit = 20 } = {}) {
    let sql = `
      SELECT e.id, e.code, e.branch_id, b.name as branch_name, b.code as branch_code,
             e.customer_name, e.customer_phone, e.customer_email,
             e.student_name, e.student_birth_year, e.subject_id,
             DATE_FORMAT(e.scheduled_date, '%Y-%m-%d') as scheduled_date,
             e.scheduled_time, e.duration_minutes, e.status, e.rating, e.feedback, e.note, e.sale_id, e.created_at,
             s.name as subject_name, l.name as level_name, u.full_name as sale_name
      FROM experience_schedules e
      JOIN branches b ON e.branch_id = b.id
      LEFT JOIN subjects s ON e.subject_id = s.id
      LEFT JOIN levels l ON e.level_id = l.id
      LEFT JOIN users u ON e.sale_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (branchId) { sql += ' AND e.branch_id = ?'; params.push(branchId); }
    if (saleId) { sql += ' AND e.sale_id = ?'; params.push(saleId); }
    if (status) { sql += ' AND e.status = ?'; params.push(status); }
    if (fromDate) { sql += ' AND e.scheduled_date >= ?'; params.push(fromDate); }
    if (toDate) { sql += ' AND e.scheduled_date <= ?'; params.push(toDate); }
    if (search) {
      sql += ' AND (e.customer_name LIKE ? OR e.student_name LIKE ? OR e.customer_phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const countSql = sql.replace(/SELECT .* FROM/, 'SELECT COUNT(*) as total FROM');
    const [countRows] = await this.db.query(countSql, params);
    const total = countRows[0]?.total || 0;

    sql += ' ORDER BY e.scheduled_date DESC, e.scheduled_time DESC LIMIT ? OFFSET ?';
    params.push(+limit, (+page - 1) * +limit);
    const [rows] = await this.db.query(sql, params);

    return { data: rows, pagination: { page: +page, limit: +limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findByIdWithRelations(id) {
    const [rows] = await this.db.query(
      `SELECT e.id, e.code, e.branch_id, b.name as branch_name, b.code as branch_code,
              e.customer_name, e.customer_phone, e.customer_email,
              e.student_name, e.student_birth_year, e.subject_id, e.level_id,
              DATE_FORMAT(e.scheduled_date, '%Y-%m-%d') as scheduled_date,
              e.scheduled_time, e.duration_minutes, e.status, e.rating, e.feedback, e.note, e.sale_id, e.created_at,
              s.name as subject_name, l.name as level_name, u.full_name as sale_name
       FROM experience_schedules e
       JOIN branches b ON e.branch_id = b.id
       LEFT JOIN subjects s ON e.subject_id = s.id
       LEFT JOIN levels l ON e.level_id = l.id
       LEFT JOIN users u ON e.sale_id = u.id
       WHERE e.id = ?`,
      [id]
    );
    if (rows.length === 0) return null;

    const [trials] = await this.db.query(
      'SELECT id, code, status FROM trial_students WHERE experience_id = ?',
      [id]
    );
    return { ...rows[0], trialStudent: trials[0] || null };
  }

  async getStats(saleId = null, branchId = null) {
    let sql = `SELECT COUNT(*) as total,
      SUM(status = 'pending') as pending,
      SUM(status = 'completed') as completed,
      SUM(status = 'converted') as converted,
      SUM(scheduled_date = CURDATE()) as today
      FROM experience_schedules WHERE 1=1`;
    const params = [];
    if (branchId) { sql += ' AND branch_id = ?'; params.push(branchId); }
    if (saleId) { sql += ' AND sale_id = ?'; params.push(saleId); }
    const [rows] = await this.db.query(sql, params);
    return rows[0];
  }

  async getByMonth(year, month, saleId = null, branchId = null) {
    let sql = `
      SELECT e.id, e.code, e.branch_id, b.code as branch_code,
             e.customer_name, e.customer_phone, e.student_name, e.student_birth_year,
             DATE_FORMAT(e.scheduled_date, '%Y-%m-%d') as scheduled_date,
             e.scheduled_time, e.status, s.name as subject_name
      FROM experience_schedules e
      JOIN branches b ON e.branch_id = b.id
      LEFT JOIN subjects s ON e.subject_id = s.id
      WHERE YEAR(e.scheduled_date) = ? AND MONTH(e.scheduled_date) = ?
    `;
    const params = [year, month];
    if (branchId) { sql += ' AND e.branch_id = ?'; params.push(branchId); }
    if (saleId) { sql += ' AND e.sale_id = ?'; params.push(saleId); }
    sql += ' ORDER BY e.scheduled_date, e.scheduled_time';
    const [rows] = await this.db.query(sql, params);
    return rows;
  }
}

export default new ExperienceModel();
