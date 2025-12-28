import BaseModel from './BaseModel.js';

class KpiModel extends BaseModel {
  constructor() {
    super('ec_kpi_targets');
  }

  // Lấy KPI target của EC theo tháng
  async getByEcAndMonth(ecId, month) {
    const [rows] = await this.db.query(`
      SELECT k.*, u.full_name as ec_name, b.name as branch_name
      FROM ec_kpi_targets k
      JOIN users u ON k.ec_id = u.id
      JOIN branches b ON k.branch_id = b.id
      WHERE k.ec_id = ? AND DATE_FORMAT(k.target_month, '%Y-%m') = ?
    `, [ecId, month]);
    return rows[0] || null;
  }

  // Lấy tất cả KPI targets theo tháng
  async getAllByMonth(month, branchId = null) {
    let sql = `
      SELECT k.*, u.full_name as ec_name, b.name as branch_name, b.code as branch_code
      FROM ec_kpi_targets k
      JOIN users u ON k.ec_id = u.id
      JOIN branches b ON k.branch_id = b.id
      WHERE DATE_FORMAT(k.target_month, '%Y-%m') = ?
    `;
    const params = [month];

    if (branchId) {
      sql += ' AND k.branch_id = ?';
      params.push(branchId);
    }

    sql += ' ORDER BY b.code, u.full_name';
    const [rows] = await this.db.query(sql, params);
    return rows;
  }

  // Tạo hoặc cập nhật KPI target
  async upsertKpi(ecId, branchId, month, data, createdBy = null) {
    const targetMonth = `${month}-01`;
    
    const [existing] = await this.db.query(
      'SELECT id FROM ec_kpi_targets WHERE ec_id = ? AND target_month = ?',
      [ecId, targetMonth]
    );

    if (existing.length > 0) {
      await this.db.query(
        `UPDATE ec_kpi_targets SET 
          target_revenue = ?, target_checkin = ?, target_conversion = ?
        WHERE id = ?`,
        [data.target_revenue, data.target_checkin, data.target_conversion, existing[0].id]
      );
      return { id: existing[0].id, updated: true };
    } else {
      const [result] = await this.db.query(
        `INSERT INTO ec_kpi_targets 
          (ec_id, branch_id, target_month, target_revenue, target_checkin, target_conversion, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [ecId, branchId, targetMonth, data.target_revenue, data.target_checkin, data.target_conversion, createdBy]
      );
      return { id: result.insertId, created: true };
    }
  }

  // Lấy danh sách EC chưa có KPI
  async getEcsWithoutKpi(month, branchId = null) {
    let sql = `
      SELECT u.id, u.full_name, b.id as branch_id, b.name as branch_name
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN user_branches ub ON u.id = ub.user_id
      LEFT JOIN branches b ON ub.branch_id = b.id
      WHERE r.name = 'EC' AND u.is_active = 1
        AND u.id NOT IN (
          SELECT ec_id FROM ec_kpi_targets WHERE DATE_FORMAT(target_month, '%Y-%m') = ?
        )
    `;
    const params = [month];

    if (branchId) {
      sql += ' AND ub.branch_id = ?';
      params.push(branchId);
    }

    const [rows] = await this.db.query(sql, params);
    return rows;
  }

  // Bulk set KPI cho nhiều EC
  async bulkSetKpi(targets, createdBy = null) {
    const results = [];
    for (const target of targets) {
      const result = await this.upsertKpi(
        target.ec_id, 
        target.branch_id, 
        target.month, 
        {
          target_revenue: target.target_revenue,
          target_checkin: target.target_checkin || 0,
          target_conversion: target.target_conversion || 0
        },
        createdBy
      );
      results.push({ ec_id: target.ec_id, ...result });
    }
    return results;
  }
}

export default new KpiModel();
