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
  async getAllByMonth(month, branchId = null, managerId = null) {
    let sql = `
      SELECT 
        u.id as ec_id,
        u.full_name as ec_name,
        u.manager_id,
        m.full_name as manager_name,
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
      LEFT JOIN users m ON u.manager_id = m.id
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

    // Filter by manager hierarchy - get direct reports and their reports
    if (managerId) {
      sql += ` AND (
        u.manager_id = ? 
        OR u.manager_id IN (SELECT id FROM users WHERE manager_id = ?)
        OR u.id = ?
      )`;
      params.push(managerId, managerId, managerId);
    }

    sql += ' ORDER BY revenue DESC';
    const [rows] = await this.db.query(sql, params);
    return rows;
  }

  // Tổng hợp báo cáo theo tháng - Revenue từ revenues table
  async getSummaryByMonth(month, branchId = null, managerId = null) {
    // Build user filter for manager hierarchy
    let userFilter = '';
    const baseParams = [];

    if (managerId) {
      userFilter = `AND (
        r.ec_id IN (SELECT id FROM users WHERE manager_id = ?)
        OR r.ec_id IN (SELECT id FROM users WHERE manager_id IN (SELECT id FROM users WHERE manager_id = ?))
        OR r.ec_id = ?
      )`;
      baseParams.push(managerId, managerId, managerId);
    }

    let sql = `
      SELECT 
        (SELECT COUNT(DISTINCT ec_id) FROM revenues r WHERE DATE_FORMAT(created_at, '%Y-%m') = ? AND type = 'tuition' ${branchId ? 'AND branch_id = ?' : ''} ${userFilter}) as total_ec,
        (SELECT COUNT(*) FROM leads l WHERE DATE_FORMAT(created_at, '%Y-%m') = ? AND status IN ('attended', 'trial', 'converted') ${branchId ? 'AND branch_id = ?' : ''} ${managerId ? 'AND (l.sale_id IN (SELECT id FROM users WHERE manager_id = ?) OR l.sale_id IN (SELECT id FROM users WHERE manager_id IN (SELECT id FROM users WHERE manager_id = ?)) OR l.sale_id = ?)' : ''}) as total_checkin,
        (SELECT COALESCE(SUM(amount), 0) FROM revenues r WHERE DATE_FORMAT(created_at, '%Y-%m') = ? AND type = 'tuition' ${branchId ? 'AND branch_id = ?' : ''} ${userFilter}) as total_revenue,
        (SELECT COALESCE(SUM(s.deposit_amount), 0) FROM leads l JOIN students s ON l.converted_student_id = s.id WHERE DATE_FORMAT(l.created_at, '%Y-%m') = ? AND l.status = 'converted' ${branchId ? 'AND l.branch_id = ?' : ''} ${managerId ? 'AND (l.sale_id IN (SELECT id FROM users WHERE manager_id = ?) OR l.sale_id = ?)' : ''}) as total_deposit,
        (SELECT COALESCE(SUM(GREATEST(s.fee_total - s.actual_revenue, 0)), 0) FROM leads l JOIN students s ON l.converted_student_id = s.id WHERE DATE_FORMAT(l.created_at, '%Y-%m') = ? AND l.status = 'converted' ${branchId ? 'AND l.branch_id = ?' : ''} ${managerId ? 'AND (l.sale_id IN (SELECT id FROM users WHERE manager_id = ?) OR l.sale_id = ?)' : ''}) as total_expected,
        (SELECT COUNT(*) FROM leads l WHERE DATE_FORMAT(l.created_at, '%Y-%m') = ? AND l.status = 'converted' ${branchId ? 'AND l.branch_id = ?' : ''} ${managerId ? 'AND (l.sale_id IN (SELECT id FROM users WHERE manager_id = ?) OR l.sale_id = ?)' : ''}) as total_converted
    `;

    // Build params based on filters
    let params = [];
    // total_ec
    params.push(month);
    if (branchId) params.push(branchId);
    if (managerId) params.push(managerId, managerId, managerId);
    // total_checkin
    params.push(month);
    if (branchId) params.push(branchId);
    if (managerId) params.push(managerId, managerId, managerId);
    // total_revenue
    params.push(month);
    if (branchId) params.push(branchId);
    if (managerId) params.push(managerId, managerId, managerId);
    // total_deposit
    params.push(month);
    if (branchId) params.push(branchId);
    if (managerId) params.push(managerId, managerId);
    // total_expected
    params.push(month);
    if (branchId) params.push(branchId);
    if (managerId) params.push(managerId, managerId);
    // total_converted
    params.push(month);
    if (branchId) params.push(branchId);
    if (managerId) params.push(managerId, managerId);

    const [rows] = await this.db.query(sql, params);
    return rows[0];
  }

  // Lấy báo cáo theo cấu trúc Team
  async getByTeamHierarchy(month, branchId = null, currentUser) {
    const role = currentUser.role_name?.toUpperCase();
    const userId = currentUser.id;

    // Lấy tất cả managers và EC kèm theo manager của họ
    let managerFilter = '';
    const params = [month, month, month];

    // Filter theo role của user hiện tại
    if (role === 'HOEC' || role === 'HOCM') {
      // HOEC chỉ xem team của mình
      managerFilter = 'AND (u.manager_id = ? OR u.id = ?)';
      params.push(userId, userId);
    } else if (role === 'BM') {
      // BM xem HOEC và team của họ
      managerFilter = `AND (u.manager_id = ? OR u.manager_id IN (SELECT id FROM users WHERE manager_id = ?) OR u.id = ?)`;
      params.push(userId, userId, userId);
    }

    if (branchId) {
      managerFilter += ' AND ub.branch_id = ?';
      params.push(branchId);
    }

    // Query để lấy tất cả users với thống kê
    const sql = `
      SELECT 
        u.id,
        u.full_name,
        u.manager_id,
        r.name as role_name,
        r.display_name as role_display,
        m.full_name as manager_name,
        mr.name as manager_role,
        mr.display_name as manager_role_display,
        ub.branch_id,
        b.code as branch_code,
        b.name as branch_name,
        COALESCE(rev.revenue, 0) as revenue,
        COALESCE(lead_stats.checkin_count, 0) as checkin_count,
        COALESCE(kt.target_revenue, 0) as kpi_target,
        CASE WHEN kt.target_revenue > 0 
          THEN ROUND(COALESCE(rev.revenue, 0) / kt.target_revenue * 100)
          ELSE 0 
        END as kpi_percent
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN users m ON u.manager_id = m.id
      LEFT JOIN roles mr ON m.role_id = mr.id
      LEFT JOIN user_branches ub ON ub.user_id = u.id
      LEFT JOIN branches b ON ub.branch_id = b.id
      LEFT JOIN ec_kpi_targets kt ON kt.ec_id = u.id AND DATE_FORMAT(kt.target_month, '%Y-%m') = ?
      LEFT JOIN (
        SELECT ec_id, SUM(amount) as revenue
        FROM revenues
        WHERE DATE_FORMAT(created_at, '%Y-%m') = ? AND type = 'tuition'
        GROUP BY ec_id
      ) rev ON rev.ec_id = u.id
      LEFT JOIN (
        SELECT sale_id, COUNT(*) as checkin_count
        FROM leads
        WHERE DATE_FORMAT(created_at, '%Y-%m') = ? AND status IN ('attended', 'trial', 'converted')
        GROUP BY sale_id
      ) lead_stats ON lead_stats.sale_id = u.id
      WHERE u.is_active = 1 
        AND r.name IN ('GDV', 'BM', 'QLCS', 'HOEC', 'HOCM', 'OM', 'CM', 'EC', 'SALE')
        ${managerFilter}
      ORDER BY 
        CASE r.name WHEN 'GDV' THEN 1 WHEN 'BM' THEN 2 WHEN 'QLCS' THEN 3 WHEN 'HOEC' THEN 4 WHEN 'HOCM' THEN 5 WHEN 'OM' THEN 6 WHEN 'CM' THEN 7 ELSE 10 END,
        rev.revenue DESC
    `;

    const [users] = await this.db.query(sql, params);

    // Xây dựng cấu trúc tree
    return this.buildTeamTree(users);
  }

  // Build tree structure from flat user list
  buildTeamTree(users) {
    const managerRoles = ['GDV', 'BM', 'QLCS', 'HOEC', 'HOCM', 'OM', 'CM'];
    const ecRoles = ['EC', 'SALE'];

    // Tìm top-level managers (không có manager hoặc manager không trong list)
    const userIds = new Set(users.map(u => u.id));
    const topManagers = users.filter(u =>
      managerRoles.includes(u.role_name?.toUpperCase()) &&
      (!u.manager_id || !userIds.has(u.manager_id))
    );

    // Build tree recursively
    const buildNode = (manager) => {
      const directReports = users.filter(u => u.manager_id === manager.id);
      const subManagers = directReports.filter(u => managerRoles.includes(u.role_name?.toUpperCase()));
      const members = directReports.filter(u => ecRoles.includes(u.role_name?.toUpperCase()));

      // Calculate team totals
      let teamRevenue = 0;
      let teamCheckin = 0;

      const processedSubManagers = subManagers.map(sm => {
        const node = buildNode(sm);
        teamRevenue += (node.own_revenue || 0) + (node.team_revenue || 0);
        teamCheckin += (node.own_checkin || 0) + (node.team_checkin || 0);
        return node;
      });

      members.forEach(m => {
        teamRevenue += m.revenue || 0;
        teamCheckin += m.checkin_count || 0;
      });

      return {
        manager_id: manager.id,
        manager_name: manager.full_name,
        role_name: manager.role_name,
        role_display: manager.role_display,
        branch_code: manager.branch_code,
        own_revenue: manager.revenue || 0,
        own_checkin: manager.checkin_count || 0,
        team_revenue: teamRevenue,
        team_checkin: teamCheckin,
        member_count: members.length + subManagers.reduce((sum, sm) => sum + (sm.member_count || 0), 0),
        sub_managers: processedSubManagers.length > 0 ? processedSubManagers : undefined,
        members: members.length > 0 ? members.map(m => ({
          ec_id: m.id,
          ec_name: m.full_name,
          branch_code: m.branch_code,
          revenue: m.revenue || 0,
          checkin_count: m.checkin_count || 0,
          kpi_percent: m.kpi_percent || 0
        })) : undefined
      };
    };

    // If no top managers found, just return flat list grouped by manager
    if (topManagers.length === 0) {
      // Group EC by their manager
      const grouped = {};
      users.forEach(u => {
        if (ecRoles.includes(u.role_name?.toUpperCase())) {
          const mgr = u.manager_name || 'Không có quản lý';
          if (!grouped[mgr]) {
            grouped[mgr] = {
              manager_id: u.manager_id || 0,
              manager_name: mgr,
              role_name: u.manager_role || '',
              role_display: u.manager_role_display || mgr,
              team_revenue: 0,
              team_checkin: 0,
              member_count: 0,
              members: []
            };
          }
          grouped[mgr].members.push({
            ec_id: u.id,
            ec_name: u.full_name,
            branch_code: u.branch_code,
            revenue: u.revenue || 0,
            checkin_count: u.checkin_count || 0,
            kpi_percent: u.kpi_percent || 0
          });
          grouped[mgr].team_revenue += u.revenue || 0;
          grouped[mgr].team_checkin += u.checkin_count || 0;
          grouped[mgr].member_count++;
        }
      });
      return Object.values(grouped);
    }

    return topManagers.map(m => buildNode(m));
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