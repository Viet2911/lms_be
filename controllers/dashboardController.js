import db from '../config/database.js';
import { getBranchFilter } from '../utils/branchHelper.js';

// Dashboard ADMIN - Toàn quyền xem
export const getAdmin = async (req, res, next) => {
  try {
    const branchId = getBranchFilter(req);
    const branchFilter = branchId ? ' AND branch_id = ?' : '';
    const branchClassFilter = branchId ? ' AND c.branch_id = ?' : '';
    const params = branchId ? [branchId] : [];
    const currentMonth = new Date().toISOString().slice(0, 7);

    // Chạy song song tất cả queries độc lập
    const [
      [[students]], [[classes]], [[leads]], [[sessions]],
      [[teachers]], [[ecs]],
      [recentStudents], [recentLeads], [todaySessions], [pendingStudents]
    ] = await Promise.all([
      db.query(`SELECT COUNT(*) as total, SUM(status='active') as active, SUM(status='pending') as pending,
        SUM(fee_status='expiring_soon') as expiring_soon, SUM(fee_status='expired') as expired
        FROM students WHERE 1=1${branchFilter}`, params),
      db.query(`SELECT COUNT(*) as total, SUM(status='active') as active, SUM(status='completed') as completed,
        SUM(status='inactive') as inactive FROM classes WHERE 1=1${branchFilter}`, params),
      db.query(`SELECT COUNT(*) as total, SUM(status='scheduled') as scheduled, SUM(status='waiting') as waiting,
        SUM(status='trial') as trial, SUM(status='converted') as converted,
        SUM(scheduled_date=CURDATE() AND status IN ('scheduled','trial')) as today
        FROM leads WHERE 1=1${branchFilter}`, params),
      db.query(`SELECT COUNT(*) as total, SUM(s.session_date=CURDATE()) as today, SUM(s.attendance_submitted=1) as submitted
        FROM sessions s JOIN classes c ON s.class_id=c.id WHERE 1=1${branchClassFilter}`, params),
      db.query("SELECT COUNT(*) as total FROM users u JOIN roles r ON u.role_id=r.id WHERE r.name='TEACHER' AND u.is_active=1"),
      db.query("SELECT COUNT(*) as total FROM users u JOIN roles r ON u.role_id=r.id WHERE r.name='EC' AND u.is_active=1"),
      db.query(`SELECT s.id, s.full_name, s.student_code, s.created_at, b.code as branch_code
        FROM students s JOIN branches b ON s.branch_id=b.id
        WHERE 1=1${branchFilter.replace('branch_id','s.branch_id')} ORDER BY s.created_at DESC LIMIT 5`, params),
      db.query(`SELECT l.id, l.code, l.student_name, l.customer_phone, DATE_FORMAT(l.scheduled_date,'%Y-%m-%d') as scheduled_date,
        l.scheduled_time, l.status, l.trial_sessions_attended, l.trial_sessions_max, s.name as subject_name, b.code as branch_code
        FROM leads l LEFT JOIN subjects s ON l.subject_id=s.id JOIN branches b ON l.branch_id=b.id
        WHERE l.status IN ('scheduled','waiting','trial')${branchFilter.replace('branch_id','l.branch_id')}
        ORDER BY CASE WHEN l.status='waiting' THEN 0 ELSE 1 END, l.scheduled_date, l.scheduled_time LIMIT 8`, params),
      db.query(`SELECT s.id, s.session_number, s.start_time, s.end_time, s.attendance_submitted, c.class_name,
        t.full_name as teacher_name, b.code as branch_code
        FROM sessions s JOIN classes c ON s.class_id=c.id JOIN branches b ON c.branch_id=b.id
        LEFT JOIN users t ON c.teacher_id=t.id
        WHERE s.session_date=CURDATE()${branchClassFilter} ORDER BY b.code, s.start_time LIMIT 10`, params),
      db.query(`SELECT s.id, s.full_name, s.student_code, s.parent_phone, s.created_at, b.code as branch_code, sub.name as subject_name
        FROM students s JOIN branches b ON s.branch_id=b.id LEFT JOIN subjects sub ON s.subject_id=sub.id
        WHERE s.status='pending'${branchFilter.replace('branch_id','s.branch_id')} ORDER BY s.created_at DESC LIMIT 5`, params),
    ]);

    let saleStats = { total_checkin: 0, total_revenue: 0, total_deposit: 0, total_expected: 0, total_converted: 0 };
    let expiringStudents = [];
    try {
      const [[[stats]], [expRows]] = await Promise.all([
        db.query(`SELECT COALESCE(SUM(checkin_count),0) as total_checkin, COALESCE(SUM(revenue),0) as total_revenue,
          COALESCE(SUM(deposit_total),0) as total_deposit, COALESCE(SUM(expected_revenue),0) as total_expected,
          COALESCE(SUM(leads_converted),0) as total_converted
          FROM sale_reports WHERE DATE_FORMAT(report_month,'%Y-%m')=?${branchId ? ' AND branch_id=?' : ''}`,
          branchId ? [currentMonth, branchId] : [currentMonth]),
        db.query(`SELECT s.id, s.full_name, s.student_code, s.parent_phone, s.remaining_sessions, s.fee_status,
          b.code as branch_code,
          (SELECT c.class_name FROM class_students cs JOIN classes c ON cs.class_id=c.id WHERE cs.student_id=s.id AND cs.status='active' LIMIT 1) as class_name
          FROM students s JOIN branches b ON s.branch_id=b.id
          WHERE s.fee_status IN ('expiring_soon','expired') AND s.status='active'${branchId ? ' AND s.branch_id=?' : ''}
          ORDER BY s.remaining_sessions ASC LIMIT 10`, branchId ? [branchId] : []),
      ]);
      if (stats) saleStats = stats;
      expiringStudents = expRows;
    } catch (e) { /* table may not exist */ }

    res.json({
      success: true,
      data: {
        students, classes, teachers: teachers.total, ecs: ecs.total,
        leads, sessions, saleStats, expiringStudents,
        recentStudents, recentLeads, todaySessions, pendingStudents
      }
    });
  } catch (error) { next(error); }
};

// Dashboard CHỦ - Giống Admin + báo cáo tài chính
export const getOwner = async (req, res, next) => {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);

    const [[[students]], [[classes]], [[leads]]] = await Promise.all([
      db.query(`SELECT COUNT(*) as total, SUM(status='active') as active,
        SUM(fee_status='expiring_soon') as expiring_soon, SUM(fee_status='expired') as expired FROM students`),
      db.query(`SELECT COUNT(*) as total, SUM(status='active') as active FROM classes`),
      db.query(`SELECT COUNT(*) as total, SUM(status='converted') as converted,
        SUM(MONTH(created_at)=MONTH(CURDATE())) as this_month FROM leads`),
    ]);

    let saleStats = { total_checkin: 0, total_revenue: 0, total_deposit: 0, total_expected: 0 };
    let topEcs = [], revenueByBranch = [], expiringStudents = [];
    try {
      const [[[stats]], [topRows], [branchRows], [expRows]] = await Promise.all([
        db.query(`SELECT COALESCE(SUM(checkin_count),0) as total_checkin, COALESCE(SUM(revenue),0) as total_revenue,
          COALESCE(SUM(deposit_total),0) as total_deposit, COALESCE(SUM(expected_revenue),0) as total_expected
          FROM sale_reports WHERE DATE_FORMAT(report_month,'%Y-%m')=?`, [currentMonth]),
        db.query(`SELECT sr.ec_id, u.full_name as ec_name, b.code as branch_code,
          sr.revenue, sr.kpi_percent, sr.checkin_count, sr.leads_converted
          FROM sale_reports sr JOIN users u ON sr.ec_id=u.id
          LEFT JOIN user_branches ub ON u.id=ub.user_id LEFT JOIN branches b ON ub.branch_id=b.id
          WHERE DATE_FORMAT(sr.report_month,'%Y-%m')=? ORDER BY sr.revenue DESC LIMIT 10`, [currentMonth]),
        db.query(`SELECT b.id, b.name, b.code, COALESCE(SUM(sr.revenue),0) as revenue,
          COALESCE(SUM(sr.deposit_total),0) as deposit, COALESCE(SUM(sr.expected_revenue),0) as expected
          FROM branches b LEFT JOIN sale_reports sr ON b.id=sr.branch_id AND DATE_FORMAT(sr.report_month,'%Y-%m')=?
          WHERE b.is_active=1 GROUP BY b.id ORDER BY revenue DESC`, [currentMonth]),
        db.query(`SELECT s.id, s.full_name, s.student_code, s.remaining_sessions, s.fee_status, b.code as branch_code
          FROM students s JOIN branches b ON s.branch_id=b.id
          WHERE s.fee_status IN ('expiring_soon','expired') AND s.status='active'
          ORDER BY s.remaining_sessions ASC LIMIT 15`),
      ]);
      if (stats) saleStats = stats;
      topEcs = topRows; revenueByBranch = branchRows; expiringStudents = expRows;
    } catch (e) { }

    res.json({ success: true, data: { students, classes, leads, saleStats, topEcs, revenueByBranch, expiringStudents, currentMonth } });
  } catch (error) { next(error); }
};

// Dashboard HOEC - Báo cáo sale team
export const getHoec = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const currentMonth = new Date().toISOString().slice(0, 7);

    // Lấy EC dưới quyền
    let myEcs = [];
    try {
      const [rows] = await db.query(`
        SELECT u.id, u.full_name, ub.branch_id, b.code as branch_code
        FROM hoec_ec_assignments hea
        JOIN users u ON hea.ec_id = u.id
        LEFT JOIN user_branches ub ON u.id = ub.user_id
        LEFT JOIN branches b ON ub.branch_id = b.id
        WHERE hea.hoec_id = ? AND u.is_active = 1
      `, [userId]);
      myEcs = rows;
    } catch (e) { }

    const ecIds = myEcs.length > 0 ? myEcs.map(e => e.id) : [0];

    // Tổng hợp sale
    let saleStats = { total_checkin: 0, total_revenue: 0, total_deposit: 0, total_expected: 0, avg_kpi: 0 };
    try {
      const [[stats]] = await db.query(`
        SELECT 
          COALESCE(SUM(checkin_count), 0) as total_checkin,
          COALESCE(SUM(revenue), 0) as total_revenue,
          COALESCE(SUM(deposit_total), 0) as total_deposit,
          COALESCE(SUM(expected_revenue), 0) as total_expected,
          COALESCE(AVG(kpi_percent), 0) as avg_kpi
        FROM sale_reports 
        WHERE DATE_FORMAT(report_month, '%Y-%m') = ? AND ec_id IN (?)
      `, [currentMonth, ecIds]);
      if (stats) saleStats = stats;
    } catch (e) { }

    // BXH EC theo doanh thu
    let ecRanking = [];
    try {
      const [rows] = await db.query(`
        SELECT sr.ec_id, u.full_name as ec_name, b.code as branch_code,
               sr.revenue, sr.kpi_percent, sr.checkin_count, sr.leads_converted,
               sr.deposit_total, sr.expected_revenue
        FROM sale_reports sr
        JOIN users u ON sr.ec_id = u.id
        LEFT JOIN user_branches ub ON u.id = ub.user_id
        LEFT JOIN branches b ON ub.branch_id = b.id
        WHERE DATE_FORMAT(sr.report_month, '%Y-%m') = ? AND sr.ec_id IN (?)
        ORDER BY sr.revenue DESC
      `, [currentMonth, ecIds]);
      ecRanking = rows;
    } catch (e) { }

    res.json({
      success: true,
      data: {
        myEcs,
        saleStats,
        ecRanking,
        currentMonth
      }
    });
  } catch (error) { next(error); }
};

// Dashboard OM - Quản lý lớp nhiều cơ sở
export const getOm = async (req, res, next) => {
  try {
    const branchId = getBranchFilter(req);
    const branchFilter = branchId ? ' AND c.branch_id = ?' : '';
    const params = branchId ? [branchId] : [];

    // Classes stats
    const [[classes]] = await db.query(`
      SELECT COUNT(*) as total, 
        SUM(c.status = 'active') as active
      FROM classes c WHERE 1=1${branchFilter}`, params);

    // Sessions today
    const [todaySessions] = await db.query(`
      SELECT s.id, s.session_number, s.start_time, s.end_time, s.attendance_submitted,
             c.class_name, c.id as class_id, t.full_name as teacher_name, b.code as branch_code,
             (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = c.id AND cs.status = 'active') as student_count
      FROM sessions s 
      JOIN classes c ON s.class_id = c.id 
      JOIN branches b ON c.branch_id = b.id
      LEFT JOIN users t ON c.teacher_id = t.id
      WHERE s.session_date = CURDATE()${branchFilter}
      ORDER BY b.code, s.start_time
    `, params);

    // Học viên sắp hết phí
    let expiringStudents = [];
    try {
      const [rows] = await db.query(`
        SELECT s.id, s.full_name, s.student_code, s.remaining_sessions, s.fee_status,
               b.code as branch_code,
               (SELECT c.class_name FROM class_students cs JOIN classes c ON cs.class_id = c.id 
                WHERE cs.student_id = s.id AND cs.status = 'active' LIMIT 1) as class_name
        FROM students s
        JOIN branches b ON s.branch_id = b.id
        WHERE s.fee_status IN ('expiring_soon', 'expired') AND s.status = 'active'
          ${branchId ? 'AND s.branch_id = ?' : ''}
        ORDER BY s.remaining_sessions ASC LIMIT 10
      `, branchId ? [branchId] : []);
      expiringStudents = rows;
    } catch (e) { }

    res.json({
      success: true,
      data: { classes, todaySessions, expiringStudents }
    });
  } catch (error) { next(error); }
};

// Dashboard CM - Quản lý 1 cơ sở
export const getCM = async (req, res, next) => {
  try {
    const branchId = getBranchFilter(req);
    if (!branchId) return res.status(400).json({ success: false, message: 'Không xác định được cơ sở' });

    const [[[students]], [[classes]], [[teachers]], [todaySessions], [pendingStudents]] = await Promise.all([
      db.query(`SELECT COUNT(*) as total, SUM(status='active') as active,
        SUM(fee_status='expiring_soon') as expiring_soon, SUM(fee_status='expired') as expired
        FROM students WHERE branch_id=?`, [branchId]),
      db.query(`SELECT COUNT(*) as total, SUM(status='active') as active FROM classes WHERE branch_id=?`, [branchId]),
      db.query(`SELECT COUNT(DISTINCT u.id) as total FROM users u JOIN roles r ON u.role_id=r.id
        JOIN user_branches ub ON u.id=ub.user_id WHERE r.name='TEACHER' AND ub.branch_id=? AND u.is_active=1`, [branchId]),
      db.query(`SELECT s.id, s.session_number, s.start_time, s.end_time, s.attendance_submitted,
        c.class_name, t.full_name as teacher_name
        FROM sessions s JOIN classes c ON s.class_id=c.id LEFT JOIN users t ON c.teacher_id=t.id
        WHERE s.session_date=CURDATE() AND c.branch_id=? ORDER BY s.start_time`, [branchId]),
      db.query(`SELECT s.id, s.full_name, s.student_code, s.parent_phone, sub.name as subject_name
        FROM students s LEFT JOIN subjects sub ON s.subject_id=sub.id
        WHERE s.status='pending' AND s.branch_id=? ORDER BY s.created_at DESC LIMIT 10`, [branchId]),
    ]);

    let expiringStudents = [];
    try {
      const [rows] = await db.query(`SELECT s.id, s.full_name, s.student_code, s.parent_phone, s.remaining_sessions, s.fee_status,
        (SELECT c.class_name FROM class_students cs JOIN classes c ON cs.class_id=c.id WHERE cs.student_id=s.id AND cs.status='active' LIMIT 1) as class_name
        FROM students s WHERE s.fee_status IN ('expiring_soon','expired') AND s.status='active' AND s.branch_id=?
        ORDER BY s.remaining_sessions ASC LIMIT 15`, [branchId]);
      expiringStudents = rows;
    } catch (e) { }

    res.json({ success: true, data: { students, classes, teachers: teachers.total, todaySessions, expiringStudents, pendingStudents } });
  } catch (error) { next(error); }
};

// Dashboard EC (Sale) - Cá nhân
export const getSale = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthStart = `${currentMonth}-01`;
    const nextMonthStart = new Date(new Date(monthStart).setMonth(new Date(monthStart).getMonth() + 1)).toISOString().slice(0, 10);

    // My stats - tất cả leads của EC
    const [[myStats]] = await db.query(`
      SELECT 
        COUNT(*) as total_leads,
        SUM(status = 'scheduled') as scheduled,
        SUM(status = 'attended') as attended,
        SUM(status = 'trial') as trial,
        SUM(status = 'converted') as converted,
        SUM(status = 'waiting') as waiting,
        SUM(scheduled_date = CURDATE()) as today
      FROM leads WHERE sale_id = ?
    `, [userId]);

    // Tính doanh thu từ TẤT CẢ leads converted của EC (không chỉ trong tháng)
    // Doanh thu = actual_revenue của các lead đã converted
    const [[revenueStats]] = await db.query(`
      SELECT 
        COUNT(*) as leads_converted,
        COALESCE(SUM(actual_revenue), 0) as revenue,
        COALESCE(SUM(deposit_amount), 0) as deposit_total,
        COALESCE(SUM(fee_total - actual_revenue), 0) as expected_revenue
      FROM leads 
      WHERE sale_id = ? 
        AND status = 'converted'
    `, [userId]);

    // Đếm leads đang xử lý
    const [[pendingStats]] = await db.query(`
      SELECT COUNT(*) as checkin_count
      FROM leads 
      WHERE sale_id = ? 
        AND status IN ('scheduled', 'attended', 'trial', 'waiting')
    `, [userId]);

    // My KPI target
    let myKpi = null;
    try {
      const [[kpi]] = await db.query(`
        SELECT * FROM ec_kpi_targets 
        WHERE ec_id = ? AND DATE_FORMAT(target_month, '%Y-%m') = ?
      `, [userId, currentMonth]);
      myKpi = kpi;
    } catch (e) { }

    // Build myReport from calculated stats
    const revenue = revenueStats?.revenue || 0;
    const myReport = {
      revenue: revenue,
      deposit_total: revenueStats?.deposit_total || 0,
      expected_revenue: revenueStats?.expected_revenue || 0, // Tiền còn thiếu từ leads converted
      checkin_count: pendingStats?.checkin_count || 0,
      leads_converted: revenueStats?.leads_converted || 0,
      kpi_percent: myKpi?.target_revenue > 0
        ? Math.round(revenue / myKpi.target_revenue * 100)
        : 0
    };

    // Today leads - CHỈ leads của EC này
    const [todayLeads] = await db.query(`
      SELECT l.id, l.code, l.student_name, l.customer_name, l.customer_phone, 
             l.scheduled_time, l.status, l.actual_revenue, l.fee_total,
             s.name as subject_name
      FROM leads l
      LEFT JOIN subjects s ON l.subject_id = s.id
      WHERE l.sale_id = ? AND l.scheduled_date = CURDATE()
      ORDER BY l.scheduled_time
    `, [userId]);

    // Converted leads trong tháng - CHỈ leads của EC này
    const [convertedLeads] = await db.query(`
      SELECT l.id, l.code, l.student_name, l.customer_phone, 
             l.actual_revenue, l.deposit_amount, l.fee_total,
             DATE_FORMAT(l.converted_at, '%d/%m') as converted_date
      FROM leads l
      WHERE l.sale_id = ? 
        AND l.status = 'converted'
        AND l.converted_at >= ? AND l.converted_at < ?
      ORDER BY l.converted_at DESC LIMIT 10
    `, [userId, monthStart, nextMonthStart]);

    // Waiting leads
    const [waitingLeads] = await db.query(`
      SELECT l.id, l.code, l.student_name, l.customer_phone, l.trial_sessions_attended
      FROM leads l
      WHERE l.sale_id = ? AND l.status = 'waiting'
      ORDER BY l.updated_at DESC LIMIT 10
    `, [userId]);

    // My ranking
    let myRanking = { rank_branch: 0, rank_all: 0 };
    try {
      const [[ranking]] = await db.query(`
        SELECT 
          (SELECT COUNT(DISTINCT l2.sale_id) + 1 
           FROM leads l2 
           WHERE l2.status = 'converted'
             AND l2.converted_at >= ? AND l2.converted_at < ?
             AND COALESCE((SELECT SUM(actual_revenue) FROM leads 
                          WHERE sale_id = l2.sale_id AND status = 'converted'
                          AND converted_at >= ? AND converted_at < ?), 0) > ?
          ) as rank_all
        FROM dual
      `, [monthStart, nextMonthStart, monthStart, nextMonthStart, revenue]);
      if (ranking) myRanking = ranking;
    } catch (e) { console.error('Ranking error:', e); }

    res.json({
      success: true,
      data: {
        myStats, myReport, myKpi, myRanking,
        todayLeads, convertedLeads, waitingLeads,
        currentMonth
      }
    });
  } catch (error) { next(error); }
};

// Dashboard Teacher
export const getTeacher = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // My classes
    const [myClasses] = await db.query(`
      SELECT c.id, c.class_name, c.schedule, c.status,
             s.name as subject_name, l.name as level_name,
             (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = c.id AND cs.status = 'active') as student_count,
             b.code as branch_code
      FROM classes c
      JOIN branches b ON c.branch_id = b.id
      LEFT JOIN subjects s ON c.subject_id = s.id
      LEFT JOIN levels l ON c.level_id = l.id
      WHERE c.teacher_id = ? AND c.status = 'active'
      ORDER BY c.class_name
    `, [userId]);

    // Today sessions
    const [todaySessions] = await db.query(`
      SELECT s.id, s.session_number, s.start_time, s.end_time, s.attendance_submitted,
             c.id as class_id, c.class_name
      FROM sessions s
      JOIN classes c ON s.class_id = c.id
      WHERE c.teacher_id = ? AND s.session_date = CURDATE()
      ORDER BY s.start_time
    `, [userId]);

    // Upcoming sessions
    const [upcomingSessions] = await db.query(`
      SELECT s.id, s.session_number, s.session_date, s.start_time, s.end_time,
             c.id as class_id, c.class_name
      FROM sessions s
      JOIN classes c ON s.class_id = c.id
      WHERE c.teacher_id = ? AND s.session_date > CURDATE()
      ORDER BY s.session_date, s.start_time
      LIMIT 10
    `, [userId]);

    // Pending attendance
    const [pendingAttendance] = await db.query(`
      SELECT s.id, s.session_number, s.session_date, c.class_name
      FROM sessions s
      JOIN classes c ON s.class_id = c.id
      WHERE c.teacher_id = ? AND s.session_date <= CURDATE() AND s.attendance_submitted = 0
      ORDER BY s.session_date DESC
      LIMIT 5
    `, [userId]);

    res.json({
      success: true,
      data: {
        myClasses,
        todaySessions,
        upcomingSessions,
        pendingAttendance
      }
    });
  } catch (error) { next(error); }
};



// GET /api/dashboard/admin
export const getDashboardAdmin = async (req, res) => {
  try {
    const { branchId } = req.query;

    // Build filters
    const bf = getBranchFilter(req, branchId);
    const bfL = getBranchFilter(req, branchId, 'l');
    const bfC = getBranchFilter(req, branchId, 'c');

    const [studentStats] = await db.query(
      `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
       FROM students WHERE 1=1 ${bf.sql}`,
      bf.params
    );

    const [classStats] = await db.query(
      `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
       FROM classes WHERE 1=1 ${bf.sql}`,
      bf.params
    );

    const [leadStats] = await db.query(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN scheduled_date = CURDATE() THEN 1 ELSE 0 END) as today,
        SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) as waiting,
        SUM(CASE WHEN status = 'trial' THEN 1 ELSE 0 END) as trial,
        SUM(CASE WHEN status = 'converted' AND MONTH(converted_at) = MONTH(CURDATE()) AND YEAR(converted_at) = YEAR(CURDATE()) THEN 1 ELSE 0 END) as converted
       FROM leads WHERE 1=1 ${bf.sql}`,
      bf.params
    );

    const [recentLeads] = await db.query(
      `SELECT l.id, l.code, l.student_name, l.customer_name, l.customer_phone, 
              l.status, l.scheduled_date, l.scheduled_time, b.code as branch_code
       FROM leads l
       LEFT JOIN branches b ON l.branch_id = b.id
       WHERE l.status IN ('new', 'scheduled', 'waiting') ${bfL.sql}
       ORDER BY CASE WHEN l.scheduled_date = CURDATE() THEN 0 ELSE 1 END, l.scheduled_date ASC, l.created_at DESC
       LIMIT 10`,
      bfL.params
    );

    const [todaySessions] = await db.query(
      `SELECT s.id, s.session_number, s.start_time, s.end_time, s.status,
              c.class_name, c.class_code, u.full_name as teacher_name,
              (SELECT COUNT(*) FROM class_students WHERE class_id = c.id AND status = 'active') as student_count
       FROM sessions s
       JOIN classes c ON s.class_id = c.id
       LEFT JOIN users u ON c.teacher_id = u.id
       WHERE s.session_date = CURDATE() AND s.status = 'scheduled' ${bfC.sql}
       ORDER BY s.start_time
       LIMIT 10`,
      bfC.params
    );

    res.json({
      success: true,
      data: {
        students: studentStats[0] || { total: 0, active: 0 },
        classes: classStats[0] || { total: 0, active: 0 },
        leads: leadStats[0] || { total: 0, today: 0, waiting: 0, trial: 0, converted: 0 },
        recentLeads: recentLeads || [],
        todaySessions: todaySessions || []
      }
    });

  } catch (error) {
    console.error('Dashboard admin error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};


// GET /api/dashboard/ec
export const getDashboardEC = async (req, res) => {
  try {
    const userId = req.user.id;

    const [stats] = await db.query(`
      SELECT 
        SUM(CASE WHEN scheduled_date = CURDATE() THEN 1 ELSE 0 END) as today,
        SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) as waiting,
        SUM(CASE WHEN status = 'converted' AND MONTH(converted_at) = MONTH(CURDATE()) THEN 1 ELSE 0 END) as converted
      FROM leads WHERE sale_id = ?
    `, [userId]);

    const [myTasks] = await db.query(`
      SELECT id, code, student_name, customer_phone, status, scheduled_date, scheduled_time
      FROM leads
      WHERE sale_id = ? AND status IN ('new', 'scheduled', 'waiting', 'trial')
      ORDER BY CASE WHEN scheduled_date = CURDATE() THEN 0 ELSE 1 END, scheduled_date ASC
      LIMIT 20
    `, [userId]);

    res.json({
      success: true,
      data: {
        today: stats[0] ? (stats[0].today || 0) : 0,
        waiting: stats[0] ? (stats[0].waiting || 0) : 0,
        converted: stats[0] ? (stats[0].converted || 0) : 0,
        myTasks: myTasks || []
      }
    });

  } catch (error) {
    console.error('Dashboard EC error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};


// GET /api/dashboard/teacher
export const getDashboardTeacher = async (req, res) => {
  try {
    const userId = req.user.id;

    const [classCount] = await db.query(
      `SELECT COUNT(*) as count FROM classes WHERE teacher_id = ? AND status = 'active'`,
      [userId]
    );

    const [todayCount] = await db.query(`
      SELECT COUNT(*) as count FROM sessions s
      JOIN classes c ON s.class_id = c.id
      WHERE c.teacher_id = ? AND s.session_date = CURDATE() AND s.status = 'scheduled'
    `, [userId]);

    const [studentCount] = await db.query(`
      SELECT COUNT(DISTINCT cs.student_id) as count
      FROM class_students cs
      JOIN classes c ON cs.class_id = c.id
      WHERE c.teacher_id = ? AND c.status = 'active' AND cs.status = 'active'
    `, [userId]);

    const [schedule] = await db.query(`
      SELECT s.id, s.session_number, s.start_time, s.end_time, c.class_name, c.room,
             (SELECT COUNT(*) FROM class_students WHERE class_id = c.id AND status = 'active') as student_count
      FROM sessions s
      JOIN classes c ON s.class_id = c.id
      WHERE c.teacher_id = ? AND s.session_date = CURDATE() AND s.status = 'scheduled'
      ORDER BY s.start_time
    `, [userId]);

    res.json({
      success: true,
      data: {
        classes: classCount[0] ? classCount[0].count : 0,
        todaySessions: todayCount[0] ? todayCount[0].count : 0,
        students: studentCount[0] ? studentCount[0].count : 0,
        schedule: schedule || []
      }
    });

  } catch (error) {
    console.error('Dashboard teacher error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
