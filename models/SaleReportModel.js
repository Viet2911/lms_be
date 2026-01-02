import BaseModel from './BaseModel.js';

class SaleReportModel extends BaseModel {
  constructor() {
    super('sale_reports');
  }

  // Lấy báo cáo của EC theo tháng - Doanh thu từ revenues (theo tháng thanh toán)
  async getByEcAndMonth(ecId, month) {
    const [rows] = await this.db.query(`
      SELECT 
        u.id as ec_id,
        u.full_name as ec_name,
        ub.branch_id,
        b.name as branch_name, 
        b.code as branch_code,
        COALESCE(lead_stats.checkin_count, 0) as checkin_count,
        COALESCE(rev_stats.revenue, 0) as revenue,
        COALESCE(lead_stats.deposit_total, 0) as deposit_total,
        COALESCE(lead_stats.expected_revenue, 0) as expected_revenue,
        COALESCE(lead_stats.leads_converted, 0) as leads_converted,
        COALESCE(kt.target_revenue, 0) as kpi_target,
        CASE WHEN kt.target_revenue > 0 
          THEN ROUND(COALESCE(rev_stats.revenue, 0) / kt.target_revenue * 100)
          ELSE 0 
        END as kpi_percent
      FROM users u
      LEFT JOIN user_branches ub ON ub.user_id = u.id
      LEFT JOIN branches b ON ub.branch_id = b.id
      LEFT JOIN ec_kpi_targets kt ON kt.ec_id = u.id AND DATE_FORMAT(kt.target_month, '%Y-%m') = ?
      LEFT JOIN (
        SELECT ec_id, SUM(amount) as revenue
        FROM revenues
        WHERE DATE_FORMAT(created_at, '%Y-%m') = ? AND type = 'tuition'
        GROUP BY ec_id
      ) rev_stats ON rev_stats.ec_id = u.id
      LEFT JOIN (
        SELECT 
          l.sale_id,
          SUM(CASE WHEN l.status IN ('attended', 'trial', 'converted') THEN 1 ELSE 0 END) as checkin_count,
          SUM(CASE WHEN l.status = 'converted' THEN COALESCE(s.deposit_amount, 0) ELSE 0 END) as deposit_total,
          SUM(CASE WHEN l.status = 'converted' THEN GREATEST(COALESCE(s.fee_total, 0) - COALESCE(s.actual_revenue, 0), 0) ELSE 0 END) as expected_revenue,
          SUM(CASE WHEN l.status = 'converted' THEN 1 ELSE 0 END) as leads_converted
        FROM leads l
        LEFT JOIN students s ON l.converted_student_id = s.id
        WHERE DATE_FORMAT(l.created_at, '%Y-%m') = ?
        GROUP BY l.sale_id
      ) lead_stats ON lead_stats.sale_id = u.id
      WHERE u.id = ?
    `, [month, month, month, ecId]);
    return rows[0] || null;
  }

  // Lấy báo cáo tất cả EC theo tháng - Doanh thu từ revenues
  async getAllByMonth(month, branchId = null, hoecId = null) {
    let sql = `
      SELECT 
        u.id as ec_id,
        u.full_name as ec_name,
        ub.branch_id,
        b.name as branch_name, 
        b.code as branch_code,
        COALESCE(lead_stats.checkin_count, 0) as checkin_count,
        COALESCE(rev_stats.revenue, 0) as revenue,
        COALESCE(lead_stats.deposit_total, 0) as deposit_total,
        COALESCE(lead_stats.expected_revenue, 0) as expected_revenue,
        COALESCE(lead_stats.leads_converted, 0) as leads_converted,
        COALESCE(kt.target_revenue, 0) as kpi_target,
        CASE WHEN kt.target_revenue > 0 
          THEN ROUND(COALESCE(rev_stats.revenue, 0) / kt.target_revenue * 100)
          ELSE 0 
        END as kpi_percent
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN user_branches ub ON ub.user_id = u.id
      LEFT JOIN branches b ON ub.branch_id = b.id
      LEFT JOIN ec_kpi_targets kt ON kt.ec_id = u.id AND DATE_FORMAT(kt.target_month, '%Y-%m') = ?
      LEFT JOIN (
        SELECT ec_id, SUM(amount) as revenue
        FROM revenues
        WHERE DATE_FORMAT(created_at, '%Y-%m') = ? AND type = 'tuition'
        GROUP BY ec_id
      ) rev_stats ON rev_stats.ec_id = u.id
      LEFT JOIN (
        SELECT 
          l.sale_id,
          SUM(CASE WHEN l.status IN ('attended', 'trial', 'converted') THEN 1 ELSE 0 END) as checkin_count,
          SUM(CASE WHEN l.status = 'converted' THEN COALESCE(s.deposit_amount, 0) ELSE 0 END) as deposit_total,
          SUM(CASE WHEN l.status = 'converted' THEN GREATEST(COALESCE(s.fee_total, 0) - COALESCE(s.actual_revenue, 0), 0) ELSE 0 END) as expected_revenue,
          SUM(CASE WHEN l.status = 'converted' THEN 1 ELSE 0 END) as leads_converted
        FROM leads l
        LEFT JOIN students s ON l.converted_student_id = s.id
        WHERE DATE_FORMAT(l.created_at, '%Y-%m') = ?
        GROUP BY l.sale_id
      ) lead_stats ON lead_stats.sale_id = u.id
      WHERE r.name IN ('ec', 'EC', 'sale', 'SALE')
    `;
    const params = [month, month, month];

    if (branchId) {
      sql += ' AND ub.branch_id = ?';
      params.push(branchId);
    }

    sql += ' ORDER BY revenue DESC';
    const [rows] = await this.db.query(sql, params);
    return rows;
  }

  // Tổng hợp báo cáo theo tháng - Revenue từ revenues table
  async getSummaryByMonth(month, branchId = null) {
    let sql = `
      SELECT 
        (SELECT COUNT(DISTINCT ec_id) FROM revenues WHERE DATE_FORMAT(created_at, '%Y-%m') = ? AND type = 'tuition' ${branchId ? 'AND branch_id = ?' : ''}) as total_ec,
        (SELECT COUNT(*) FROM leads WHERE DATE_FORMAT(created_at, '%Y-%m') = ? AND status IN ('attended', 'trial', 'converted') ${branchId ? 'AND branch_id = ?' : ''}) as total_checkin,
        (SELECT COALESCE(SUM(amount), 0) FROM revenues WHERE DATE_FORMAT(created_at, '%Y-%m') = ? AND type = 'tuition' ${branchId ? 'AND branch_id = ?' : ''}) as total_revenue,
        (SELECT COALESCE(SUM(s.deposit_amount), 0) FROM leads l JOIN students s ON l.converted_student_id = s.id WHERE DATE_FORMAT(l.created_at, '%Y-%m') = ? AND l.status = 'converted' ${branchId ? 'AND l.branch_id = ?' : ''}) as total_deposit,
        (SELECT COALESCE(SUM(GREATEST(s.fee_total - s.actual_revenue, 0)), 0) FROM leads l JOIN students s ON l.converted_student_id = s.id WHERE DATE_FORMAT(l.created_at, '%Y-%m') = ? AND l.status = 'converted' ${branchId ? 'AND l.branch_id = ?' : ''}) as total_expected,
        (SELECT COUNT(*) FROM leads WHERE DATE_FORMAT(created_at, '%Y-%m') = ? AND status = 'converted' ${branchId ? 'AND branch_id = ?' : ''}) as total_converted
    `;

    const params = branchId
      ? [month, branchId, month, branchId, month, branchId, month, branchId, month, branchId, month, branchId]
      : [month, month, month, month, month, month];

    const [rows] = await this.db.query(sql, params);
    return rows[0];
  }

  // Bảng xếp hạng theo doanh thu - từ revenues
  async getRankingByRevenue(month, branchId = null, limit = 10) {
    let sql = `
      SELECT 
        u.id as ec_id,
        u.full_name as ec_name,
        b.name as branch_name, 
        b.code as branch_code,
        COALESCE(rev_stats.revenue, 0) as revenue,
        COALESCE(lead_stats.checkin_count, 0) as checkin_count,
        COALESCE(lead_stats.leads_converted, 0) as leads_converted,
        COALESCE(lead_stats.deposit_total, 0) as deposit_total,
        COALESCE(lead_stats.expected_revenue, 0) as expected_revenue,
        COALESCE(kt.target_revenue, 0) as kpi_target,
        CASE WHEN kt.target_revenue > 0 
          THEN ROUND(COALESCE(rev_stats.revenue, 0) / kt.target_revenue * 100)
          ELSE 0 
        END as kpi_percent
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN user_branches ub ON ub.user_id = u.id
      LEFT JOIN branches b ON ub.branch_id = b.id
      LEFT JOIN ec_kpi_targets kt ON kt.ec_id = u.id AND DATE_FORMAT(kt.target_month, '%Y-%m') = ?
      LEFT JOIN (
        SELECT ec_id, SUM(amount) as revenue
        FROM revenues
        WHERE DATE_FORMAT(created_at, '%Y-%m') = ? AND type = 'tuition'
        GROUP BY ec_id
      ) rev_stats ON rev_stats.ec_id = u.id
      LEFT JOIN (
        SELECT 
          l.sale_id,
          SUM(CASE WHEN l.status IN ('attended', 'trial', 'converted') THEN 1 ELSE 0 END) as checkin_count,
          SUM(CASE WHEN l.status = 'converted' THEN COALESCE(s.deposit_amount, 0) ELSE 0 END) as deposit_total,
          SUM(CASE WHEN l.status = 'converted' THEN GREATEST(COALESCE(s.fee_total, 0) - COALESCE(s.actual_revenue, 0), 0) ELSE 0 END) as expected_revenue,
          SUM(CASE WHEN l.status = 'converted' THEN 1 ELSE 0 END) as leads_converted
        FROM leads l
        LEFT JOIN students s ON l.converted_student_id = s.id
        WHERE DATE_FORMAT(l.created_at, '%Y-%m') = ?
        GROUP BY l.sale_id
      ) lead_stats ON lead_stats.sale_id = u.id
      WHERE r.name IN ('ec', 'EC', 'sale', 'SALE') AND COALESCE(rev_stats.revenue, 0) > 0
    `;
    const params = [month, month, month];

    if (branchId) {
      sql += ' AND ub.branch_id = ?';
      params.push(branchId);
    }

    sql += ' ORDER BY revenue DESC LIMIT ?';
    params.push(limit);

    const [rows] = await this.db.query(sql, params);
    return rows;
  }

  // Bảng xếp hạng theo KPI %
  async getRankingByKpi(month, branchId = null, limit = 10) {
    let sql = `
      SELECT 
        u.id as ec_id,
        u.full_name as ec_name,
        b.name as branch_name, 
        b.code as branch_code,
        COALESCE(rev_stats.revenue, 0) as revenue,
        COALESCE(kt.target_revenue, 0) as kpi_target,
        CASE WHEN kt.target_revenue > 0 
          THEN ROUND(COALESCE(rev_stats.revenue, 0) / kt.target_revenue * 100)
          ELSE 0 
        END as kpi_percent,
        COALESCE(lead_stats.checkin_count, 0) as checkin_count
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN user_branches ub ON ub.user_id = u.id
      LEFT JOIN branches b ON ub.branch_id = b.id
      INNER JOIN ec_kpi_targets kt ON kt.ec_id = u.id AND DATE_FORMAT(kt.target_month, '%Y-%m') = ?
      LEFT JOIN (
        SELECT ec_id, SUM(amount) as revenue
        FROM revenues
        WHERE DATE_FORMAT(created_at, '%Y-%m') = ? AND type = 'tuition'
        GROUP BY ec_id
      ) rev_stats ON rev_stats.ec_id = u.id
      LEFT JOIN (
        SELECT sale_id, COUNT(*) as checkin_count
        FROM leads
        WHERE DATE_FORMAT(created_at, '%Y-%m') = ? AND status IN ('attended', 'trial', 'converted')
        GROUP BY sale_id
      ) lead_stats ON lead_stats.sale_id = u.id
      WHERE r.name IN ('ec', 'EC', 'sale', 'SALE') AND kt.target_revenue > 0
    `;
    const params = [month, month, month];

    if (branchId) {
      sql += ' AND ub.branch_id = ?';
      params.push(branchId);
    }

    sql += ' ORDER BY kpi_percent DESC LIMIT ?';
    params.push(limit);

    const [rows] = await this.db.query(sql, params);
    return rows;
  }

  // Lấy danh sách doanh thu dự kiến (còn nợ)
  async getExpectedRevenueList(month, branchId = null) {
    let sql = `
      SELECT 
        s.id as student_id,
        s.student_code,
        s.full_name as student_name,
        s.parent_phone,
        s.fee_total,
        s.actual_revenue,
        (s.fee_total - s.actual_revenue) as remaining,
        s.fee_status,
        u.full_name as ec_name,
        b.name as branch_name
      FROM students s
      JOIN leads l ON l.converted_student_id = s.id
      LEFT JOIN users u ON l.sale_id = u.id
      LEFT JOIN branches b ON s.branch_id = b.id
      WHERE DATE_FORMAT(l.created_at, '%Y-%m') = ?
        AND s.fee_total > s.actual_revenue
    `;
    const params = [month];

    if (branchId) {
      sql += ' AND s.branch_id = ?';
      params.push(branchId);
    }

    sql += ' ORDER BY (s.fee_total - s.actual_revenue) DESC';
    const [rows] = await this.db.query(sql, params);
    return rows;
  }

  // Lấy danh sách đã thanh toán đủ
  async getFullPaidList(month, branchId = null) {
    let sql = `
      SELECT 
        s.id as student_id,
        s.student_code,
        s.full_name as student_name,
        s.parent_phone,
        s.fee_total,
        s.actual_revenue,
        s.fee_status,
        u.full_name as ec_name,
        b.name as branch_name
      FROM students s
      JOIN leads l ON l.converted_student_id = s.id
      LEFT JOIN users u ON l.sale_id = u.id
      LEFT JOIN branches b ON s.branch_id = b.id
      WHERE DATE_FORMAT(l.created_at, '%Y-%m') = ?
        AND s.actual_revenue >= s.fee_total
    `;
    const params = [month];

    if (branchId) {
      sql += ' AND s.branch_id = ?';
      params.push(branchId);
    }

    sql += ' ORDER BY s.actual_revenue DESC';
    const [rows] = await this.db.query(sql, params);
    return rows;
  }

  // Tính toán và cập nhật báo cáo
  async calculateAndUpdateReport(ecId, month, branchId) {
    const report = await this.getByEcAndMonth(ecId, month);
    if (!report) return null;

    await this.db.query(`
      INSERT INTO sale_reports (ec_id, branch_id, report_month, checkin_count, revenue, deposit_total, expected_revenue, leads_converted, kpi_target, kpi_percent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        checkin_count = VALUES(checkin_count),
        revenue = VALUES(revenue),
        deposit_total = VALUES(deposit_total),
        expected_revenue = VALUES(expected_revenue),
        leads_converted = VALUES(leads_converted),
        kpi_target = VALUES(kpi_target),
        kpi_percent = VALUES(kpi_percent),
        updated_at = NOW()
    `, [
      ecId, branchId, month + '-01',
      report.checkin_count, report.revenue, report.deposit_total,
      report.expected_revenue, report.leads_converted,
      report.kpi_target, report.kpi_percent
    ]);

    return report;
  }
}

export default new SaleReportModel();