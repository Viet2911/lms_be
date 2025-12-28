import BaseModel from './BaseModel.js';

class TrialModel extends BaseModel {
  constructor() {
    super('trial_students');
  }

  generateCode(branchCode = 'TRI') {
    return branchCode + '-' + Date.now().toString(36).toUpperCase();
  }

  async findAllWithRelations({ status, search, saleId, branchId, page = 1, limit = 20 } = {}) {
    let sql = `
      SELECT ts.*, b.name as branch_name, b.code as branch_code,
             e.code as experience_code, s.name as subject_name, l.name as level_name, u.full_name as sale_name,
             (SELECT c.class_name FROM trial_class_students tcs JOIN classes c ON tcs.class_id = c.id 
              WHERE tcs.trial_student_id = ts.id LIMIT 1) as class_name
      FROM trial_students ts
      JOIN branches b ON ts.branch_id = b.id
      LEFT JOIN experience_schedules e ON ts.experience_id = e.id
      LEFT JOIN subjects s ON ts.subject_id = s.id
      LEFT JOIN levels l ON ts.level_id = l.id
      LEFT JOIN users u ON ts.sale_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (branchId) { sql += ' AND ts.branch_id = ?'; params.push(branchId); }
    if (saleId) { sql += ' AND ts.sale_id = ?'; params.push(saleId); }
    if (status) { sql += ' AND ts.status = ?'; params.push(status); }
    if (search) {
      sql += ' AND (ts.full_name LIKE ? OR ts.code LIKE ? OR ts.parent_phone LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const countSql = sql.replace(/SELECT .* FROM/, 'SELECT COUNT(*) as total FROM');
    const [countRows] = await this.db.query(countSql, params);
    const total = countRows[0]?.total || 0;

    sql += ' ORDER BY ts.created_at DESC LIMIT ? OFFSET ?';
    params.push(+limit, (+page - 1) * +limit);
    const [rows] = await this.db.query(sql, params);

    return { data: rows, pagination: { page: +page, limit: +limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findByIdWithRelations(id) {
    const [rows] = await this.db.query(
      `SELECT ts.*, b.name as branch_name, b.code as branch_code,
              e.code as experience_code, s.name as subject_name, l.name as level_name, u.full_name as sale_name
       FROM trial_students ts
       JOIN branches b ON ts.branch_id = b.id
       LEFT JOIN experience_schedules e ON ts.experience_id = e.id
       LEFT JOIN subjects s ON ts.subject_id = s.id
       LEFT JOIN levels l ON ts.level_id = l.id
       LEFT JOIN users u ON ts.sale_id = u.id
       WHERE ts.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  async getStats(saleId = null, branchId = null) {
    let sql = `SELECT COUNT(*) as total,
      SUM(status = 'active') as active,
      SUM(status = 'converted') as converted,
      SUM(status = 'active' AND sessions_attended >= 2) as nearing_limit
      FROM trial_students WHERE 1=1`;
    const params = [];
    if (branchId) { sql += ' AND branch_id = ?'; params.push(branchId); }
    if (saleId) { sql += ' AND sale_id = ?'; params.push(saleId); }
    const [rows] = await this.db.query(sql, params);
    return rows[0];
  }
}

export default new TrialModel();
