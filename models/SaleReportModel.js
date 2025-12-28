import BaseModel from './BaseModel.js';

class SaleReportModel extends BaseModel {
  constructor() {
    super('sale_reports');
  }

  // Lấy báo cáo của EC theo tháng
  async getByEcAndMonth(ecId, month) {
    const [rows] = await this.db.query(`
      SELECT sr.*, u.full_name as ec_name, b.name as branch_name, b.code as branch_code
      FROM sale_reports sr
      JOIN users u ON sr.ec_id = u.id
      JOIN branches b ON sr.branch_id = b.id
      WHERE sr.ec_id = ? AND DATE_FORMAT(sr.report_month, '%Y-%m') = ?
    `, [ecId, month]);
    return rows[0] || null;
  }

  // Lấy báo cáo tất cả EC theo tháng (cho HOEC/Admin)
  async getAllByMonth(month, branchId = null, hoecId = null) {
    let sql = `
      SELECT sr.*, 
             u.full_name as ec_name,
             b.name as branch_name, b.code as branch_code,
             RANK() OVER (ORDER BY sr.revenue DESC) as rank_all,
             RANK() OVER (PARTITION BY sr.branch_id ORDER BY sr.revenue DESC) as rank_branch
      FROM sale_reports sr
      JOIN users u ON sr.ec_id = u.id
      JOIN branches b ON sr.branch_id = b.id
      WHERE DATE_FORMAT(sr.report_month, '%Y-%m') = ?
    `;
    const params = [month];

    if (branchId) {
      sql += ' AND sr.branch_id = ?';
      params.push(branchId);
    }

    // Nếu là HOEC, chỉ lấy EC dưới quyền
    if (hoecId) {
      sql += ' AND sr.ec_id IN (SELECT ec_id FROM hoec_ec_assignments WHERE hoec_id = ?)';
      params.push(hoecId);
    }

    sql += ' ORDER BY sr.revenue DESC';
    const [rows] = await this.db.query(sql, params);
    return rows;
  }

  // Tổng hợp báo cáo theo tháng
  async getSummaryByMonth(month, branchId = null) {
    let sql = `
      SELECT 
        COUNT(DISTINCT sr.ec_id) as total_ec,
        SUM(sr.checkin_count) as total_checkin,
        SUM(sr.revenue) as total_revenue,
        SUM(sr.deposit_total) as total_deposit,
        SUM(sr.expected_revenue) as total_expected,
        SUM(sr.leads_new) as total_leads_new,
        SUM(sr.leads_converted) as total_converted,
        AVG(sr.kpi_percent) as avg_kpi,
        AVG(sr.conversion_rate) as avg_conversion
      FROM sale_reports sr
      WHERE DATE_FORMAT(sr.report_month, '%Y-%m') = ?
    `;
    const params = [month];

    if (branchId) {
      sql += ' AND sr.branch_id = ?';
      params.push(branchId);
    }

    const [rows] = await this.db.query(sql, params);
    return rows[0];
  }

  // Bảng xếp hạng theo doanh thu
  async getRankingByRevenue(month, branchId = null, limit = 10) {
    let sql = `
      SELECT sr.ec_id, u.full_name as ec_name,
             b.name as branch_name, b.code as branch_code,
             sr.revenue, sr.kpi_percent, sr.checkin_count, sr.leads_converted,
             sr.deposit_total, sr.expected_revenue
      FROM sale_reports sr
      JOIN users u ON sr.ec_id = u.id
      JOIN branches b ON sr.branch_id = b.id
      WHERE DATE_FORMAT(sr.report_month, '%Y-%m') = ?
    `;
    const params = [month];

    if (branchId) {
      sql += ' AND sr.branch_id = ?';
      params.push(branchId);
    }

    sql += ' ORDER BY sr.revenue DESC LIMIT ?';
    params.push(limit);

    const [rows] = await this.db.query(sql, params);
    return rows;
  }

  // Bảng xếp hạng theo KPI %
  async getRankingByKpi(month, branchId = null, limit = 10) {
    let sql = `
      SELECT sr.ec_id, u.full_name as ec_name,
             b.name as branch_name, b.code as branch_code,
             sr.revenue, sr.kpi_target, sr.kpi_percent, sr.checkin_count
      FROM sale_reports sr
      JOIN users u ON sr.ec_id = u.id
      JOIN branches b ON sr.branch_id = b.id
      WHERE DATE_FORMAT(sr.report_month, '%Y-%m') = ?
    `;
    const params = [month];

    if (branchId) {
      sql += ' AND sr.branch_id = ?';
      params.push(branchId);
    }

    sql += ' ORDER BY sr.kpi_percent DESC LIMIT ?';
    params.push(limit);

    const [rows] = await this.db.query(sql, params);
    return rows;
  }

  // Cập nhật hoặc tạo báo cáo
  async upsertReport(ecId, branchId, month, data) {
    const reportMonth = `${month}-01`;
    
    const [existing] = await this.db.query(
      'SELECT id FROM sale_reports WHERE ec_id = ? AND report_month = ?',
      [ecId, reportMonth]
    );

    if (existing.length > 0) {
      await this.db.query(
        `UPDATE sale_reports SET 
          checkin_count = ?, revenue = ?, deposit_total = ?, expected_revenue = ?,
          kpi_target = ?, kpi_percent = ?, leads_new = ?, leads_trial = ?,
          leads_converted = ?, conversion_rate = ?
        WHERE id = ?`,
        [
          data.checkin_count, data.revenue, data.deposit_total, data.expected_revenue,
          data.kpi_target, data.kpi_percent, data.leads_new, data.leads_trial,
          data.leads_converted, data.conversion_rate, existing[0].id
        ]
      );
      return { id: existing[0].id, updated: true };
    } else {
      const [result] = await this.db.query(
        `INSERT INTO sale_reports 
          (ec_id, branch_id, report_month, checkin_count, revenue, deposit_total, 
           expected_revenue, kpi_target, kpi_percent, leads_new, leads_trial,
           leads_converted, conversion_rate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ecId, branchId, reportMonth, data.checkin_count, data.revenue, 
          data.deposit_total, data.expected_revenue, data.kpi_target, 
          data.kpi_percent, data.leads_new, data.leads_trial,
          data.leads_converted, data.conversion_rate
        ]
      );
      return { id: result.insertId, created: true };
    }
  }

  // Tính toán và cập nhật báo cáo từ dữ liệu leads
  async calculateAndUpdateReport(ecId, branchId, month) {
    const reportMonth = `${month}-01`;
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;

    // Lấy KPI target
    const [kpiRows] = await this.db.query(
      `SELECT target_revenue FROM ec_kpi_targets 
       WHERE ec_id = ? AND DATE_FORMAT(target_month, '%Y-%m') = ?`,
      [ecId, month]
    );
    const kpiTarget = kpiRows[0]?.target_revenue || 0;

    // Tính các chỉ số từ leads
    const [stats] = await this.db.query(`
      SELECT 
        COUNT(*) as leads_new,
        SUM(status IN ('scheduled', 'attended', 'trial')) as leads_trial,
        SUM(status = 'converted') as leads_converted,
        SUM(CASE WHEN status = 'attended' OR status = 'converted' THEN 1 ELSE 0 END) as checkin_count,
        SUM(actual_revenue) as revenue,
        SUM(deposit_amount) as deposit_total,
        SUM(CASE WHEN status IN ('trial', 'scheduled') THEN expected_revenue ELSE 0 END) as expected_revenue
      FROM leads 
      WHERE sale_id = ? 
        AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 MONTH)
    `, [ecId, startDate, startDate]);

    const data = {
      checkin_count: stats[0].checkin_count || 0,
      revenue: stats[0].revenue || 0,
      deposit_total: stats[0].deposit_total || 0,
      expected_revenue: stats[0].expected_revenue || 0,
      kpi_target: kpiTarget,
      kpi_percent: kpiTarget > 0 ? Math.round((stats[0].revenue || 0) / kpiTarget * 100 * 100) / 100 : 0,
      leads_new: stats[0].leads_new || 0,
      leads_trial: stats[0].leads_trial || 0,
      leads_converted: stats[0].leads_converted || 0,
      conversion_rate: stats[0].leads_new > 0 
        ? Math.round((stats[0].leads_converted || 0) / stats[0].leads_new * 100 * 100) / 100 
        : 0
    };

    return this.upsertReport(ecId, branchId, month, data);
  }
}

export default new SaleReportModel();
