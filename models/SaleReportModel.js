import BaseModel from './BaseModel.js';

class SaleReportModel extends BaseModel {
  constructor() {
    super('sale_reports');
  }

  getMonthRange(month) {
    const monthStart = `${month}-01`;
    const monthEndDate = new Date(monthStart);
    monthEndDate.setMonth(monthEndDate.getMonth() + 1);
    const monthEnd = monthEndDate.toISOString().slice(0, 10);
    return { monthStart, monthEnd };
  }

  // Subquery: thống kê doanh số từ students (actual_revenue) cho từng EC trong kỳ
  // Doanh số = SUM(actual_revenue)
  // Cọc      = SUM(deposit_amount) chỉ khi chưa đóng đủ (actual_revenue < fee_total)
  // Dự thu   = SUM(fee_total - actual_revenue) khi chưa đóng đủ
  _saleStatsSubquery() {
    return `
      SELECT
        l.sale_id,
        COALESCE(SUM(s.actual_revenue), 0)                                                           AS revenue,
        COALESCE(SUM(CASE WHEN s.actual_revenue < s.fee_total THEN s.deposit_amount ELSE 0 END), 0)  AS deposit_total,
        COALESCE(SUM(GREATEST(s.fee_total - s.actual_revenue, 0)), 0)                                AS expected_revenue,
        COUNT(*)                                                                                      AS leads_converted
      FROM leads l
      JOIN students s ON l.converted_student_id = s.id
      WHERE l.created_at >= ? AND l.created_at < ? AND l.status = 'converted'
      GROUP BY l.sale_id
    `;
  }

  _checkinSubquery() {
    return `
      SELECT sale_id, COUNT(*) AS checkin_count
      FROM leads
      WHERE created_at >= ? AND created_at < ? AND status IN ('attended', 'trial', 'converted')
      GROUP BY sale_id
    `;
  }

  // Lấy báo cáo của EC theo tháng
  async getByEcAndMonth(ecId, month) {
    const { monthStart, monthEnd } = this.getMonthRange(month);

    const [rows] = await this.db.query(`
      SELECT
        u.id                                          AS ec_id,
        u.full_name                                   AS ec_name,
        ub.branch_id,
        b.name                                        AS branch_name,
        b.code                                        AS branch_code,
        COALESCE(ck.checkin_count,   0)               AS checkin_count,
        COALESCE(ss.revenue,         0)               AS revenue,
        COALESCE(ss.deposit_total,   0)               AS deposit_total,
        COALESCE(ss.expected_revenue,0)               AS expected_revenue,
        COALESCE(ss.leads_converted, 0)               AS leads_converted,
        COALESCE(kt.target_revenue,  0)               AS kpi_target,
        CASE WHEN kt.target_revenue > 0
          THEN ROUND(COALESCE(ss.revenue, 0) / kt.target_revenue * 100)
          ELSE 0
        END                                           AS kpi_percent
      FROM users u
      LEFT JOIN user_branches ub ON ub.user_id = u.id
      LEFT JOIN branches b       ON ub.branch_id = b.id
      LEFT JOIN ec_kpi_targets kt ON kt.ec_id = u.id
        AND kt.target_month >= ? AND kt.target_month < ?
      LEFT JOIN (${this._saleStatsSubquery()}) ss ON ss.sale_id = u.id
      LEFT JOIN (${this._checkinSubquery()})   ck ON ck.sale_id = u.id
      WHERE u.id = ?
    `, [monthStart, monthEnd, monthStart, monthEnd, monthStart, monthEnd, ecId]);
    return rows[0] || null;
  }

  // Lấy báo cáo tất cả EC theo tháng
  async getAllByMonth(month, branchId = null, managerId = null) {
    const { monthStart, monthEnd } = this.getMonthRange(month);

    let sql = `
      SELECT
        u.id                                          AS ec_id,
        u.full_name                                   AS ec_name,
        u.manager_id,
        m.full_name                                   AS manager_name,
        ub.branch_id,
        b.name                                        AS branch_name,
        b.code                                        AS branch_code,
        COALESCE(ck.checkin_count,   0)               AS checkin_count,
        COALESCE(ss.revenue,         0)               AS revenue,
        COALESCE(ss.deposit_total,   0)               AS deposit_total,
        COALESCE(ss.expected_revenue,0)               AS expected_revenue,
        COALESCE(ss.leads_converted, 0)               AS leads_converted,
        COALESCE(kt.target_revenue,  0)               AS kpi_target,
        CASE WHEN kt.target_revenue > 0
          THEN ROUND(COALESCE(ss.revenue, 0) / kt.target_revenue * 100)
          ELSE 0
        END                                           AS kpi_percent
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN users m ON u.manager_id = m.id
      LEFT JOIN user_branches ub ON ub.user_id = u.id
      LEFT JOIN branches b       ON ub.branch_id = b.id
      LEFT JOIN ec_kpi_targets kt ON kt.ec_id = u.id
        AND kt.target_month >= ? AND kt.target_month < ?
      LEFT JOIN (${this._saleStatsSubquery()}) ss ON ss.sale_id = u.id
      LEFT JOIN (${this._checkinSubquery()})   ck ON ck.sale_id = u.id
      WHERE r.name IN ('ec', 'EC', 'sale', 'SALE')
    `;
    const params = [monthStart, monthEnd, monthStart, monthEnd, monthStart, monthEnd];

    if (branchId) {
      sql += ' AND ub.branch_id = ?';
      params.push(branchId);
    }
    if (managerId) {
      sql += ` AND (
        u.manager_id = ?
        OR u.manager_id IN (SELECT id FROM users WHERE manager_id = ?)
        OR u.id = ?
      )`;
      params.push(managerId, managerId, managerId);
    }

    sql += ' ORDER BY ss.revenue DESC';
    const [rows] = await this.db.query(sql, params);
    return rows;
  }

  // Tổng hợp báo cáo theo tháng
  async getSummaryByMonth(month, branchId = null, managerId = null) {
    const { monthStart, monthEnd } = this.getMonthRange(month);

    let managerFilter = '';
    if (managerId) {
      managerFilter = `AND (
        l.sale_id IN (SELECT id FROM users WHERE manager_id = ?)
        OR l.sale_id IN (SELECT id FROM users WHERE manager_id IN (SELECT id FROM users WHERE manager_id = ?))
        OR l.sale_id = ?
      )`;
    }

    const branchFilter = branchId ? 'AND l.branch_id = ?' : '';

    const sql = `
      SELECT
        (SELECT COUNT(DISTINCT l.sale_id)
         FROM leads l
         JOIN students s ON l.converted_student_id = s.id
         WHERE l.created_at >= ? AND l.created_at < ?
           AND l.status = 'converted'
           ${branchFilter} ${managerFilter}) AS total_ec,

        (SELECT COUNT(*)
         FROM leads l
         WHERE l.created_at >= ? AND l.created_at < ?
           AND l.status IN ('attended', 'trial', 'converted')
           ${branchFilter} ${managerFilter}) AS total_checkin,

        (SELECT COALESCE(SUM(s.actual_revenue), 0)
         FROM leads l
         JOIN students s ON l.converted_student_id = s.id
         WHERE l.created_at >= ? AND l.created_at < ?
           AND l.status = 'converted'
           ${branchFilter} ${managerFilter}) AS total_revenue,

        (SELECT COALESCE(SUM(CASE WHEN s.actual_revenue < s.fee_total THEN s.deposit_amount ELSE 0 END), 0)
         FROM leads l
         JOIN students s ON l.converted_student_id = s.id
         WHERE l.created_at >= ? AND l.created_at < ?
           AND l.status = 'converted'
           ${branchFilter} ${managerFilter}) AS total_deposit,

        (SELECT COALESCE(SUM(GREATEST(s.fee_total - s.actual_revenue, 0)), 0)
         FROM leads l
         JOIN students s ON l.converted_student_id = s.id
         WHERE l.created_at >= ? AND l.created_at < ?
           AND l.status = 'converted'
           ${branchFilter} ${managerFilter}) AS total_expected,

        (SELECT COUNT(*)
         FROM leads l
         WHERE l.created_at >= ? AND l.created_at < ?
           AND l.status = 'converted'
           ${branchFilter} ${managerFilter}) AS total_converted
    `;

    const params = [];
    const push = () => {
      params.push(monthStart, monthEnd);
      if (branchId)   params.push(branchId);
      if (managerId)  params.push(managerId, managerId, managerId);
    };
    // 6 subqueries
    push(); push(); push(); push(); push(); push();

    const [rows] = await this.db.query(sql, params);
    return rows[0];
  }

  // Lấy báo cáo theo cấu trúc Team
  async getByTeamHierarchy(month, branchId = null, currentUser) {
    const { monthStart, monthEnd } = this.getMonthRange(month);

    const role   = currentUser.role_name?.toUpperCase();
    const userId = currentUser.id;

    let managerFilter = '';
    const params = [monthStart, monthEnd, monthStart, monthEnd, monthStart, monthEnd];

    if (role === 'HOEC' || role === 'HOCM') {
      managerFilter = 'AND (u.manager_id = ? OR u.id = ?)';
      params.push(userId, userId);
    } else if (role === 'BM') {
      managerFilter = `AND (u.manager_id = ? OR u.manager_id IN (SELECT id FROM users WHERE manager_id = ?) OR u.id = ?)`;
      params.push(userId, userId, userId);
    }

    if (branchId) {
      managerFilter += ' AND ub.branch_id = ?';
      params.push(branchId);
    }

    const sql = `
      SELECT
        u.id,
        u.full_name,
        u.manager_id,
        r.name                   AS role_name,
        r.display_name           AS role_display,
        m.full_name              AS manager_name,
        mr.name                  AS manager_role,
        mr.display_name          AS manager_role_display,
        ub.branch_id,
        b.code                   AS branch_code,
        b.name                   AS branch_name,
        COALESCE(ss.revenue,       0) AS revenue,
        COALESCE(ck.checkin_count, 0) AS checkin_count,
        COALESCE(kt.target_revenue,0) AS kpi_target,
        CASE WHEN kt.target_revenue > 0
          THEN ROUND(COALESCE(ss.revenue, 0) / kt.target_revenue * 100)
          ELSE 0
        END AS kpi_percent
      FROM users u
      JOIN roles r    ON u.role_id = r.id
      LEFT JOIN users m   ON u.manager_id = m.id
      LEFT JOIN roles mr  ON m.role_id    = mr.id
      LEFT JOIN user_branches ub ON ub.user_id = u.id
      LEFT JOIN branches b       ON ub.branch_id = b.id
      LEFT JOIN ec_kpi_targets kt ON kt.ec_id = u.id
        AND kt.target_month >= ? AND kt.target_month < ?
      LEFT JOIN (${this._saleStatsSubquery()}) ss ON ss.sale_id = u.id
      LEFT JOIN (${this._checkinSubquery()})   ck ON ck.sale_id = u.id
      WHERE u.is_active = 1
        AND r.name IN ('GDV','BM','QLCS','HOEC','HOCM','OM','CM','EC','SALE')
        ${managerFilter}
      ORDER BY
        CASE r.name WHEN 'GDV' THEN 1 WHEN 'BM' THEN 2 WHEN 'QLCS' THEN 3
          WHEN 'HOEC' THEN 4 WHEN 'HOCM' THEN 5 WHEN 'OM' THEN 6 WHEN 'CM' THEN 7 ELSE 10 END,
        ss.revenue DESC
    `;

    const [users] = await this.db.query(sql, params);
    return this.buildTeamTree(users);
  }

  // Build tree structure from flat user list
  buildTeamTree(users) {
    const managerRoles = ['GDV', 'BM', 'QLCS', 'HOEC', 'HOCM', 'OM', 'CM'];
    const ecRoles = ['EC', 'SALE'];

    const userIds = new Set(users.map(u => u.id));
    const topManagers = users.filter(u =>
      managerRoles.includes(u.role_name?.toUpperCase()) &&
      (!u.manager_id || !userIds.has(u.manager_id))
    );

    const buildNode = (manager) => {
      const directReports  = users.filter(u => u.manager_id === manager.id);
      const subManagers    = directReports.filter(u => managerRoles.includes(u.role_name?.toUpperCase()));
      const members        = directReports.filter(u => ecRoles.includes(u.role_name?.toUpperCase()));

      let teamRevenue = 0, teamCheckin = 0;

      const processedSubManagers = subManagers.map(sm => {
        const node = buildNode(sm);
        teamRevenue += (node.own_revenue || 0) + (node.team_revenue || 0);
        teamCheckin += (node.own_checkin || 0) + (node.team_checkin || 0);
        return node;
      });

      members.forEach(m => {
        teamRevenue += m.revenue       || 0;
        teamCheckin += m.checkin_count || 0;
      });

      return {
        manager_id:   manager.id,
        manager_name: manager.full_name,
        role_name:    manager.role_name,
        role_display: manager.role_display,
        branch_code:  manager.branch_code,
        own_revenue:  manager.revenue       || 0,
        own_checkin:  manager.checkin_count || 0,
        team_revenue: teamRevenue,
        team_checkin: teamCheckin,
        member_count: members.length + subManagers.reduce((s, sm) => s + (sm.member_count || 0), 0),
        sub_managers: processedSubManagers.length ? processedSubManagers : undefined,
        members: members.length ? members.map(m => ({
          ec_id:         m.id,
          ec_name:       m.full_name,
          branch_code:   m.branch_code,
          revenue:       m.revenue       || 0,
          checkin_count: m.checkin_count || 0,
          kpi_percent:   m.kpi_percent   || 0,
        })) : undefined,
      };
    };

    if (topManagers.length === 0) {
      const grouped = {};
      users.forEach(u => {
        if (ecRoles.includes(u.role_name?.toUpperCase())) {
          const mgr = u.manager_name || 'Không có quản lý';
          if (!grouped[mgr]) {
            grouped[mgr] = {
              manager_id:   u.manager_id || 0,
              manager_name: mgr,
              role_name:    u.manager_role || '',
              role_display: u.manager_role_display || mgr,
              team_revenue: 0, team_checkin: 0, member_count: 0, members: [],
            };
          }
          grouped[mgr].members.push({
            ec_id:         u.id,
            ec_name:       u.full_name,
            branch_code:   u.branch_code,
            revenue:       u.revenue       || 0,
            checkin_count: u.checkin_count || 0,
            kpi_percent:   u.kpi_percent   || 0,
          });
          grouped[mgr].team_revenue += u.revenue       || 0;
          grouped[mgr].team_checkin += u.checkin_count || 0;
          grouped[mgr].member_count++;
        }
      });
      return Object.values(grouped);
    }

    return topManagers.map(m => buildNode(m));
  }

  // Bảng xếp hạng theo doanh thu
  async getRankingByRevenue(month, branchId = null, limit = 10) {
    const { monthStart, monthEnd } = this.getMonthRange(month);

    let sql = `
      SELECT
        u.id                                          AS ec_id,
        u.full_name                                   AS ec_name,
        b.name                                        AS branch_name,
        b.code                                        AS branch_code,
        COALESCE(ss.revenue,         0)               AS revenue,
        COALESCE(ck.checkin_count,   0)               AS checkin_count,
        COALESCE(ss.leads_converted, 0)               AS leads_converted,
        COALESCE(ss.deposit_total,   0)               AS deposit_total,
        COALESCE(ss.expected_revenue,0)               AS expected_revenue,
        COALESCE(kt.target_revenue,  0)               AS kpi_target,
        CASE WHEN kt.target_revenue > 0
          THEN ROUND(COALESCE(ss.revenue, 0) / kt.target_revenue * 100)
          ELSE 0
        END                                           AS kpi_percent
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN user_branches ub ON ub.user_id = u.id
      LEFT JOIN branches b       ON ub.branch_id = b.id
      LEFT JOIN ec_kpi_targets kt ON kt.ec_id = u.id
        AND kt.target_month >= ? AND kt.target_month < ?
      LEFT JOIN (${this._saleStatsSubquery()}) ss ON ss.sale_id = u.id
      LEFT JOIN (${this._checkinSubquery()})   ck ON ck.sale_id = u.id
      WHERE r.name IN ('ec', 'EC', 'sale', 'SALE') AND COALESCE(ss.revenue, 0) > 0
    `;
    const params = [monthStart, monthEnd, monthStart, monthEnd, monthStart, monthEnd];

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
    const { monthStart, monthEnd } = this.getMonthRange(month);

    let sql = `
      SELECT
        u.id                                          AS ec_id,
        u.full_name                                   AS ec_name,
        b.name                                        AS branch_name,
        b.code                                        AS branch_code,
        COALESCE(ss.revenue,       0)                 AS revenue,
        COALESCE(ck.checkin_count, 0)                 AS checkin_count,
        COALESCE(kt.target_revenue,0)                 AS kpi_target,
        CASE WHEN kt.target_revenue > 0
          THEN ROUND(COALESCE(ss.revenue, 0) / kt.target_revenue * 100)
          ELSE 0
        END                                           AS kpi_percent
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN user_branches ub ON ub.user_id = u.id
      LEFT JOIN branches b       ON ub.branch_id = b.id
      INNER JOIN ec_kpi_targets kt ON kt.ec_id = u.id
        AND kt.target_month >= ? AND kt.target_month < ?
      LEFT JOIN (${this._saleStatsSubquery()}) ss ON ss.sale_id = u.id
      LEFT JOIN (${this._checkinSubquery()})   ck ON ck.sale_id = u.id
      WHERE r.name IN ('ec', 'EC', 'sale', 'SALE') AND kt.target_revenue > 0
    `;
    const params = [monthStart, monthEnd, monthStart, monthEnd, monthStart, monthEnd];

    if (branchId) {
      sql += ' AND ub.branch_id = ?';
      params.push(branchId);
    }

    sql += ' ORDER BY kpi_percent DESC LIMIT ?';
    params.push(limit);

    const [rows] = await this.db.query(sql, params);
    return rows;
  }

  // Danh sách dự thu (còn nợ) với phân trang
  async getExpectedRevenueList(month, branchId = null, page = 1, limit = 50) {
    const { monthStart, monthEnd } = this.getMonthRange(month);

    const baseFromWhere = `
      FROM students s
      JOIN leads l ON l.converted_student_id = s.id
      LEFT JOIN users u ON l.sale_id = u.id
      LEFT JOIN branches b ON s.branch_id = b.id
      WHERE l.created_at >= ? AND l.created_at < ?
        AND l.status = 'converted'
        AND s.actual_revenue < s.fee_total
        ${branchId ? 'AND s.branch_id = ?' : ''}
    `;

    const countParams = [monthStart, monthEnd];
    if (branchId) countParams.push(branchId);

    const [countRows] = await this.db.query(
      `SELECT COUNT(*) as total ${baseFromWhere}`,
      countParams
    );

    const total    = countRows[0]?.total || 0;
    const safeLimit = Math.max(1, Math.min(parseInt(limit, 10) || 50, 200));
    const safePage  = Math.max(1, parseInt(page, 10) || 1);
    const offset    = (safePage - 1) * safeLimit;

    const listParams = [monthStart, monthEnd];
    if (branchId) listParams.push(branchId);
    listParams.push(safeLimit, offset);

    const [rows] = await this.db.query(
      `SELECT
        s.id                                                   AS student_id,
        s.student_code,
        s.full_name                                            AS student_name,
        l.customer_name,
        COALESCE(l.customer_phone, s.parent_phone)             AS customer_phone,
        s.fee_total,
        s.deposit_amount,
        s.actual_revenue,
        (s.fee_total - s.actual_revenue)                       AS remaining,
        s.fee_status,
        u.full_name                                            AS ec_name,
        b.name                                                 AS branch_name,
        b.code                                                 AS branch_code
      ${baseFromWhere}
      ORDER BY (s.fee_total - s.actual_revenue) DESC
      LIMIT ? OFFSET ?`,
      listParams
    );

    return {
      items: rows,
      pagination: {
        page: safePage, limit: safeLimit, total,
        totalPages: total ? Math.ceil(total / safeLimit) : 1,
      },
    };
  }

  // Danh sách đã thanh toán đủ với phân trang
  async getFullPaidList(month, branchId = null, page = 1, limit = 50) {
    const { monthStart, monthEnd } = this.getMonthRange(month);

    const baseFromWhere = `
      FROM students s
      JOIN leads l ON l.converted_student_id = s.id
      LEFT JOIN users u ON l.sale_id = u.id
      LEFT JOIN branches b ON s.branch_id = b.id
      WHERE l.created_at >= ? AND l.created_at < ?
        AND l.status = 'converted'
        AND s.actual_revenue >= s.fee_total
        ${branchId ? 'AND s.branch_id = ?' : ''}
    `;

    const countParams = [monthStart, monthEnd];
    if (branchId) countParams.push(branchId);

    const [countRows] = await this.db.query(
      `SELECT COUNT(*) as total ${baseFromWhere}`,
      countParams
    );

    const total    = countRows[0]?.total || 0;
    const safeLimit = Math.max(1, Math.min(parseInt(limit, 10) || 50, 200));
    const safePage  = Math.max(1, parseInt(page, 10) || 1);
    const offset    = (safePage - 1) * safeLimit;

    const listParams = [monthStart, monthEnd];
    if (branchId) listParams.push(branchId);
    listParams.push(safeLimit, offset);

    const [rows] = await this.db.query(
      `SELECT
        s.id                                                   AS student_id,
        s.student_code,
        s.full_name                                            AS student_name,
        l.customer_name,
        COALESCE(l.customer_phone, s.parent_phone)             AS customer_phone,
        s.fee_total,
        s.deposit_amount,
        s.actual_revenue,
        s.fee_status,
        u.full_name                                            AS ec_name,
        b.name                                                 AS branch_name,
        b.code                                                 AS branch_code
      ${baseFromWhere}
      ORDER BY s.actual_revenue DESC
      LIMIT ? OFFSET ?`,
      listParams
    );

    return {
      items: rows,
      pagination: {
        page: safePage, limit: safeLimit, total,
        totalPages: total ? Math.ceil(total / safeLimit) : 1,
      },
    };
  }

  // Tính toán và cập nhật báo cáo cache
  async calculateAndUpdateReport(ecId, branchId, month) {
    const report = await this.getByEcAndMonth(ecId, month);
    if (!report) return null;

    await this.db.query(`
      INSERT INTO sale_reports
        (ec_id, branch_id, report_month, checkin_count, revenue, deposit_total, expected_revenue, leads_converted, kpi_target, kpi_percent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        checkin_count    = VALUES(checkin_count),
        revenue          = VALUES(revenue),
        deposit_total    = VALUES(deposit_total),
        expected_revenue = VALUES(expected_revenue),
        leads_converted  = VALUES(leads_converted),
        kpi_target       = VALUES(kpi_target),
        kpi_percent      = VALUES(kpi_percent),
        updated_at       = NOW()
    `, [
      ecId, branchId, month + '-01',
      report.checkin_count, report.revenue, report.deposit_total,
      report.expected_revenue, report.leads_converted,
      report.kpi_target, report.kpi_percent,
    ]);

    return report;
  }
}

export default new SaleReportModel();
