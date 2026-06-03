import BaseModel from './BaseModel.js';

class KpiModel extends BaseModel {
  constructor() {
    super('ec_kpi_targets');
  }

  async getByEcAndMonth(ecId, month) {
    const [rows] = await this.db.query(`
      SELECT k.*, u.full_name as ec_name, b.name as branch_name
      FROM ec_kpi_targets k
      JOIN users u ON k.ec_id = u.id
      JOIN branches b ON k.branch_id = b.id
      WHERE k.ec_id = ? AND TO_CHAR(k.target_month, 'YYYY-MM') = ?
    `, [ecId, month]);
    return rows[0] || null;
  }

  async getAllByMonth(month, branchId = null) {
    let sql = `
      SELECT k.*, u.full_name as ec_name, b.name as branch_name, b.code as branch_code
      FROM ec_kpi_targets k
      JOIN users u ON k.ec_id = u.id
      JOIN branches b ON k.branch_id = b.id
      WHERE TO_CHAR(k.target_month, 'YYYY-MM') = ?
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

  async upsertKpi(ecId, branchId, month, data, createdBy = null) {
    const targetMonth = `${month}-01`;

    const [existing] = await this.db.query(
      'SELECT id FROM ec_kpi_targets WHERE ec_id = ? AND target_month = ?',
      [ecId, targetMonth]
    );

    if (existing.length > 0) {
      await this.db.query(
        `UPDATE ec_kpi_targets SET
          target_revenue = ?, target_leads = ?, target_conversions = ?
        WHERE id = ?`,
        [data.target_revenue, data.target_checkin || 0, data.target_conversion || 0, existing[0].id]
      );
      return { id: existing[0].id, updated: true };
    } else {
      const [rows] = await this.db.query(
        `INSERT INTO ec_kpi_targets
          (ec_id, branch_id, target_month, target_revenue, target_leads, target_conversions)
        VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
        [ecId, branchId, targetMonth, data.target_revenue, data.target_checkin || 0, data.target_conversion || 0]
      );
      return { id: rows[0]?.id, created: true };
    }
  }

  async getEcsWithoutKpi(month, branchId = null) {
    let sql = `
      SELECT u.id, u.full_name, b.id as branch_id, b.name as branch_name
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN user_branches ub ON u.id = ub.user_id
      LEFT JOIN branches b ON ub.branch_id = b.id
      WHERE r.name = 'EC' AND u.is_active = true
        AND u.id NOT IN (
          SELECT ec_id FROM ec_kpi_targets WHERE TO_CHAR(target_month, 'YYYY-MM') = ?
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
