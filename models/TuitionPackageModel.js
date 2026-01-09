import BaseModel from './BaseModel.js';

class TuitionPackageModel extends BaseModel {
  constructor() {
    super('tuition_packages');
  }

  // Lấy tất cả gói học phí
  async getAll(subjectId = null) {
    let sql = `
      SELECT tp.*, s.name as subject_name,
             COALESCE(tp.default_scholarship_months, 0) as default_scholarship_months
      FROM tuition_packages tp
      LEFT JOIN subjects s ON tp.subject_id = s.id
      WHERE tp.is_active = 1
    `;
    const params = [];

    if (subjectId) {
      sql += ` AND (tp.subject_id = ? OR tp.subject_id IS NULL)`;
      params.push(subjectId);
    }

    sql += ` ORDER BY tp.subject_id, tp.duration_months`;
    const [rows] = await this.db.query(sql, params);
    return rows;
  }

  // Lấy gói theo ID
  async getById(id) {
    const [rows] = await this.db.query(`
      SELECT tp.*, s.name as subject_name,
             COALESCE(tp.default_scholarship_months, 0) as default_scholarship_months
      FROM tuition_packages tp
      LEFT JOIN subjects s ON tp.subject_id = s.id
      WHERE tp.id = ?
    `, [id]);
    return rows[0] || null;
  }

  // Tạo gói mới
  async create(data) {
    const [result] = await this.db.query(`
      INSERT INTO tuition_packages (code, name, subject_id, duration_months, sessions_per_week, price, description, default_scholarship_months)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [data.code, data.name, data.subject_id || null, data.duration_months, data.sessions_per_week, data.price, data.description, data.default_scholarship_months || 0]);
    return result;
  }

  // Cập nhật gói
  async updatePackage(id, data) {
    const [result] = await this.db.query(`
      UPDATE tuition_packages SET
        code = ?, name = ?, subject_id = ?, duration_months = ?, 
        sessions_per_week = ?, price = ?, description = ?, is_active = ?,
        default_scholarship_months = ?
      WHERE id = ?
    `, [data.code, data.name, data.subject_id || null, data.duration_months,
    data.sessions_per_week, data.price, data.description, data.is_active,
    data.default_scholarship_months || 0, id]);
    return result;
  }

  // Xóa gói (soft delete)
  async deletePackage(id) {
    const [result] = await this.db.query(`
      UPDATE tuition_packages SET is_active = 0 WHERE id = ?
    `, [id]);
    return result;
  }
}

export default new TuitionPackageModel();