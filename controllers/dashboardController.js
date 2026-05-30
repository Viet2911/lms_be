import db from '../config/database.js';
import { getBranchFilter } from '../utils/branchHelper.js';
import SaleReportModel from '../models/SaleReportModel.js';

export const getAdmin = async (req, res, next) => {
  try {
    const branchId = getBranchFilter(req);
    const branchFilter = branchId ? ' AND branch_id = ?' : '';
    const branchClassFilter = branchId ? ' AND c.branch_id = ?' : '';
    const params = branchId ? [branchId] : [];
    const currentMonth = new Date().toISOString().slice(0, 7);

    const [
      [[students]], [[classes]], [[leads]], [[sessions]],
      [[teachers]], [[ecs]],
      [recentStudents], [recentLeads], [todaySessions], [pendingStudents]
    ] = await Promise.all([
      db.query(`SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='active') as active,
        COUNT(*) FILTER (WHERE status='pending') as pending,
        COUNT(*) FILTER (WHERE fee_status='expiring_soon') as expiring_soon,
        COUNT(*) FILTER (WHERE fee_status='expired') as expired
        FROM students WHERE 1=1${branchFilter}`, params),
      db.query(`SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='active') as active,
        COUNT(*) FILTER (WHERE status='completed') as completed,
        COUNT(*) FILTER (WHERE status='inactive') as inactive
        FROM classes WHERE 1=1${branchFilter}`, params),
      db.query(`SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='scheduled') as scheduled,
        COUNT(*) FILTER (WHERE status='waiting') as waiting,
        COUNT(*) FILTER (WHERE status='trial') as trial,
        COUNT(*) FILTER (WHERE status='converted') as converted,
        COUNT(*) FILTER (WHERE scheduled_date=CURRENT_DATE AND status IN ('scheduled','trial')) as today
        FROM leads WHERE 1=1${branchFilter}`, params),
      db.query(`SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE s.session_date=CURRENT_DATE) as today,
        COUNT(*) FILTER (WHERE s.attendance_submitted=true) as submitted
        FROM sessions s JOIN classes c ON s.class_id=c.id WHERE 1=1${branchClassFilter}`, params),
      db.query("SELECT COUNT(*) as total FROM users u JOIN roles r ON u.role_id=r.id WHERE r.name='TEACHER' AND u.is_active=true"),
      db.query("SELECT COUNT(*) as total FROM users u JOIN roles r ON u.role_id=r.id WHERE r.name='EC' AND u.is_active=true"),
      db.query(`SELECT s.id, s.full_name, s.student_code, s.created_at, b.code as branch_code
        FROM students s JOIN branches b ON s.branch_id=b.id
        WHERE 1=1${branchFilter.replace('branch_id','s.branch_id')} ORDER BY s.created_at DESC LIMIT 5`, params),
      db.query(`SELECT l.id, l.code, l.student_name, l.customer_phone,
        TO_CHAR(l.scheduled_date,'YYYY-MM-DD') as scheduled_date,
        l.scheduled_time, l.status, l.trial_sessions_attended, l.trial_sessions_max, s.name as subject_name, b.code as branch_code
        FROM leads l LEFT JOIN subjects s ON l.subject_id=s.id JOIN branches b ON l.branch_id=b.id
        WHERE l.status IN ('scheduled','waiting','trial')${branchFilter.replace('branch_id','l.branch_id')}
        ORDER BY CASE WHEN l.status='waiting' THEN 0 ELSE 1 END, l.scheduled_date, l.scheduled_time LIMIT 8`, params),
      db.query(`SELECT s.id, s.session_number, s.start_time, s.end_time, s.attendance_submitted, c.class_name,
        t.full_name as teacher_name, b.code as branch_code
        FROM sessions s JOIN classes c ON s.class_id=c.id JOIN branches b ON c.branch_id=b.id
        LEFT JOIN users t ON c.teacher_id=t.id
        WHERE s.session_date=CURRENT_DATE${branchClassFilter} ORDER BY b.code, s.start_time LIMIT 10`, params),
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
          FROM sale_reports WHERE TO_CHAR(report_month,'YYYY-MM')=?${branchId ? ' AND branch_id=?' : ''}`,
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

export const getOwner = async (req, res, next) => {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const branchId = getBranchFilter(req);
    const bf = branchId ? ' AND branch_id = ?' : '';
    const p = branchId ? [branchId] : [];

    const [[[students]], [[classes]], [[leads]]] = await Promise.all([
      db.query(`SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='active') as active,
        COUNT(*) FILTER (WHERE fee_status='expiring_soon') as expiring_soon,
        COUNT(*) FILTER (WHERE fee_status='expired') as expired
        FROM students WHERE 1=1${bf}`, p),
      db.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='active') as active FROM classes WHERE 1=1${bf}`, p),
      db.query(`SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='converted') as converted,
        COUNT(*) FILTER (WHERE EXTRACT(MONTH FROM created_at)=EXTRACT(MONTH FROM CURRENT_DATE)) as this_month
        FROM leads WHERE 1=1${bf}`, p),
    ]);

    let saleStats = { total_checkin: 0, total_revenue: 0, total_deposit: 0, total_expected: 0 };
    let topEcs = [], revenueByBranch = [], expiringStudents = [];
    try {
      const [[[stats]], [topRows], [branchRows], [expRows]] = await Promise.all([
        db.query(`SELECT COALESCE(SUM(checkin_count),0) as total_checkin, COALESCE(SUM(revenue),0) as total_revenue,
          COALESCE(SUM(deposit_total),0) as total_deposit, COALESCE(SUM(expected_revenue),0) as total_expected
          FROM sale_reports WHERE TO_CHAR(report_month,'YYYY-MM')=?${branchId ? ' AND branch_id=?' : ''}`,
          branchId ? [currentMonth, branchId] : [currentMonth]),
        db.query(`SELECT sr.ec_id, u.full_name as ec_name, b.code as branch_code,
          sr.revenue, sr.kpi_percent, sr.checkin_count, sr.leads_converted
          FROM sale_reports sr JOIN users u ON sr.ec_id=u.id
          LEFT JOIN user_branches ub ON u.id=ub.user_id LEFT JOIN branches b ON ub.branch_id=b.id
          WHERE TO_CHAR(sr.report_month,'YYYY-MM')=?${branchId ? ' AND sr.branch_id=?' : ''}
          ORDER BY sr.revenue DESC LIMIT 10`,
          branchId ? [currentMonth, branchId] : [currentMonth]),
        db.query(`SELECT b.id, b.name, b.code, COALESCE(SUM(sr.revenue),0) as revenue,
          COALESCE(SUM(sr.deposit_total),0) as deposit, COALESCE(SUM(sr.expected_revenue),0) as expected
          FROM branches b LEFT JOIN sale_reports sr ON b.id=sr.branch_id AND TO_CHAR(sr.report_month,'YYYY-MM')=?
          WHERE b.is_active=true${branchId ? ' AND b.id=?' : ''} GROUP BY b.id ORDER BY revenue DESC`,
          branchId ? [currentMonth, branchId] : [currentMonth]),
        db.query(`SELECT s.id, s.full_name, s.student_code, s.remaining_sessions, s.fee_status, b.code as branch_code
          FROM students s JOIN branches b ON s.branch_id=b.id
          WHERE s.fee_status IN ('expiring_soon','expired') AND s.status='active'${branchId ? ' AND s.branch_id=?' : ''}
          ORDER BY s.remaining_sessions ASC LIMIT 15`, p),
      ]);
      if (stats) saleStats = stats;
      topEcs = topRows; revenueByBranch = branchRows; expiringStudents = expRows;
    } catch (e) { }

    res.json({ success: true, data: { students, classes, leads, saleStats, topEcs, revenueByBranch, expiringStudents, currentMonth } });
  } catch (error) { next(error); }
};

export const getHoec = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const currentMonth = new Date().toISOString().slice(0, 7);

    let myEcs = [];
    try {
      const [rows] = await db.query(`
        SELECT u.id, u.full_name, ub.branch_id, b.code as branch_code
        FROM hoec_ec_assignments hea
        JOIN users u ON hea.ec_id = u.id
        LEFT JOIN user_branches ub ON u.id = ub.user_id
        LEFT JOIN branches b ON ub.branch_id = b.id
        WHERE hea.hoec_id = ? AND u.is_active = true
      `, [userId]);
      myEcs = rows;
    } catch (e) { }

    const ecIds = myEcs.length > 0 ? myEcs.map(e => e.id) : [0];

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
        WHERE TO_CHAR(report_month, 'YYYY-MM') = ? AND ec_id = ANY(?)
      `, [currentMonth, ecIds]);
      if (stats) saleStats = stats;
    } catch (e) { }

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
        WHERE TO_CHAR(sr.report_month, 'YYYY-MM') = ? AND sr.ec_id = ANY(?)
        ORDER BY sr.revenue DESC
      `, [currentMonth, ecIds]);
      ecRanking = rows;
    } catch (e) { }

    res.json({ success: true, data: { myEcs, saleStats, ecRanking, currentMonth } });
  } catch (error) { next(error); }
};

export const getOm = async (req, res, next) => {
  try {
    const branchId = getBranchFilter(req);
    const branchFilter = branchId ? ' AND c.branch_id = ?' : '';
    const params = branchId ? [branchId] : [];

    const [[classes]] = await db.query(`
      SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE c.status = 'active') as active
      FROM classes c WHERE 1=1${branchFilter}`, params);

    const [todaySessions] = await db.query(`
      SELECT s.id, s.session_number, s.start_time, s.end_time, s.attendance_submitted,
             c.class_name, c.id as class_id, t.full_name as teacher_name, b.code as branch_code,
             (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = c.id AND cs.status = 'active') as student_count
      FROM sessions s
      JOIN classes c ON s.class_id = c.id
      JOIN branches b ON c.branch_id = b.id
      LEFT JOIN users t ON c.teacher_id = t.id
      WHERE s.session_date = CURRENT_DATE${branchFilter}
      ORDER BY b.code, s.start_time
    `, params);

    let expiringStudents = [];
    try {
      const [rows] = await db.query(`
        SELECT s.id, s.full_name, s.student_code, s.remaining_sessions, s.fee_status,
               b.code as branch_code,
               (SELECT c.class_name FROM class_students cs JOIN classes c ON cs.class_id = c.id
                WHERE cs.student_id = s.id AND cs.status = 'active' LIMIT 1) as class_name
        FROM students s JOIN branches b ON s.branch_id = b.id
        WHERE s.fee_status IN ('expiring_soon', 'expired') AND s.status = 'active'
          ${branchId ? 'AND s.branch_id = ?' : ''}
        ORDER BY s.remaining_sessions ASC LIMIT 10
      `, branchId ? [branchId] : []);
      expiringStudents = rows;
    } catch (e) { }

    res.json({ success: true, data: { classes, todaySessions, expiringStudents } });
  } catch (error) { next(error); }
};

export const getCM = async (req, res, next) => {
  try {
    const branchId = getBranchFilter(req);
    if (!branchId) return res.status(400).json({ success: false, message: 'Không xác định được cơ sở' });

    const [[[students]], [[classes]], [[teachers]], [todaySessions], [pendingStudents]] = await Promise.all([
      db.query(`SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='active') as active,
        COUNT(*) FILTER (WHERE fee_status='expiring_soon') as expiring_soon,
        COUNT(*) FILTER (WHERE fee_status='expired') as expired
        FROM students WHERE branch_id=?`, [branchId]),
      db.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='active') as active FROM classes WHERE branch_id=?`, [branchId]),
      db.query(`SELECT COUNT(DISTINCT u.id) as total FROM users u JOIN roles r ON u.role_id=r.id
        JOIN user_branches ub ON u.id=ub.user_id WHERE r.name='TEACHER' AND ub.branch_id=? AND u.is_active=true`, [branchId]),
      db.query(`SELECT s.id, s.session_number, s.start_time, s.end_time, s.attendance_submitted,
        c.class_name, t.full_name as teacher_name
        FROM sessions s JOIN classes c ON s.class_id=c.id LEFT JOIN users t ON c.teacher_id=t.id
        WHERE s.session_date=CURRENT_DATE AND c.branch_id=? ORDER BY s.start_time`, [branchId]),
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

export const getSale = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const monthStart = `${month}-01`;
    const nextMonthStart = new Date(new Date(monthStart).setMonth(new Date(monthStart).getMonth() + 1)).toISOString().slice(0, 10);

    const myReport = await SaleReportModel.getByEcAndMonth(userId, month);
    const myKpi = myReport ? { target_revenue: myReport.kpi_target } : null;

    const [todayLeads] = await db.query(`
      SELECT l.id, l.code, l.student_name, l.customer_name, l.customer_phone,
             l.scheduled_time, l.status, l.actual_revenue, l.fee_total,
             s.name as subject_name
      FROM leads l LEFT JOIN subjects s ON l.subject_id = s.id
      WHERE l.sale_id = ? AND l.scheduled_date = CURRENT_DATE ORDER BY l.scheduled_time
    `, [userId]);

    const [convertedLeads] = await db.query(`
      SELECT l.id, l.code, l.student_name, l.customer_phone,
             COALESCE(s.actual_revenue, l.actual_revenue, 0) as actual_revenue,
             COALESCE(s.deposit_amount, l.deposit_amount, 0) as deposit_amount,
             COALESCE(s.fee_total, l.fee_total, 0) as fee_total,
             TO_CHAR(l.converted_at, 'DD/MM') as converted_date
      FROM leads l LEFT JOIN students s ON l.converted_student_id = s.id
      WHERE l.sale_id = ? AND l.status = 'converted' AND l.created_at >= ? AND l.created_at < ?
      ORDER BY l.converted_at DESC LIMIT 10
    `, [userId, monthStart, nextMonthStart]);

    let myRanking = { rank_all: '-', rank_branch: '-' };
    try {
      const [rankAll] = await SaleReportModel.db.query(`
        SELECT ec_id, revenue FROM (
          SELECT l.sale_id AS ec_id, COALESCE(SUM(s.actual_revenue), 0) AS revenue
          FROM leads l JOIN students s ON l.converted_student_id = s.id
          WHERE l.created_at >= ? AND l.created_at < ? AND l.status = 'converted'
          GROUP BY l.sale_id
        ) t ORDER BY revenue DESC
      `, [monthStart, nextMonthStart]);

      const myRevenue = parseFloat(myReport?.revenue || 0);
      const rankAllIdx = rankAll.findIndex(r => r.ec_id === userId);
      myRanking.rank_all = rankAllIdx >= 0 ? rankAllIdx + 1 : (myRevenue > 0 ? rankAll.length + 1 : '-');

      if (myReport?.branch_id) {
        const [rankBranch] = await SaleReportModel.db.query(`
          SELECT l.sale_id AS ec_id, COALESCE(SUM(s.actual_revenue), 0) AS revenue
          FROM leads l JOIN students s ON l.converted_student_id = s.id
          JOIN user_branches ub ON ub.user_id = l.sale_id AND ub.branch_id = ?
          WHERE l.created_at >= ? AND l.created_at < ? AND l.status = 'converted'
          GROUP BY l.sale_id ORDER BY revenue DESC
        `, [myReport.branch_id, monthStart, nextMonthStart]);
        const rankBrIdx = rankBranch.findIndex(r => r.ec_id === userId);
        myRanking.rank_branch = rankBrIdx >= 0 ? rankBrIdx + 1 : (myRevenue > 0 ? rankBranch.length + 1 : '-');
      }
    } catch (e) { }

    res.json({ success: true, data: { myReport, myKpi, myRanking, todayLeads, convertedLeads, currentMonth: month } });
  } catch (error) { next(error); }
};

export const getTeacher = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [myClasses] = await db.query(`
      SELECT c.id, c.class_name, c.schedule, c.status,
             s.name as subject_name, l.name as level_name,
             (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = c.id AND cs.status = 'active') as student_count,
             b.code as branch_code
      FROM classes c JOIN branches b ON c.branch_id = b.id
      LEFT JOIN subjects s ON c.subject_id = s.id LEFT JOIN levels l ON c.level_id = l.id
      WHERE c.teacher_id = ? AND c.status = 'active' ORDER BY c.class_name
    `, [userId]);

    const [todaySessions] = await db.query(`
      SELECT s.id, s.session_number, s.start_time, s.end_time, s.attendance_submitted,
             c.id as class_id, c.class_name
      FROM sessions s JOIN classes c ON s.class_id = c.id
      WHERE c.teacher_id = ? AND s.session_date = CURRENT_DATE ORDER BY s.start_time
    `, [userId]);

    const [upcomingSessions] = await db.query(`
      SELECT s.id, s.session_number, s.session_date, s.start_time, s.end_time,
             c.id as class_id, c.class_name
      FROM sessions s JOIN classes c ON s.class_id = c.id
      WHERE c.teacher_id = ? AND s.session_date > CURRENT_DATE
      ORDER BY s.session_date, s.start_time LIMIT 10
    `, [userId]);

    const [pendingAttendance] = await db.query(`
      SELECT s.id, s.session_number, s.session_date, c.class_name
      FROM sessions s JOIN classes c ON s.class_id = c.id
      WHERE c.teacher_id = ? AND s.session_date <= CURRENT_DATE AND s.attendance_submitted = false
      ORDER BY s.session_date DESC LIMIT 5
    `, [userId]);

    res.json({ success: true, data: { myClasses, todaySessions, upcomingSessions, pendingAttendance } });
  } catch (error) { next(error); }
};

export const getDashboardAdmin = async (req, res) => {
  try {
    const { branchId } = req.query;
    const bf  = getBranchFilter(req, branchId);
    const bfL = getBranchFilter(req, branchId, 'l');
    const bfC = getBranchFilter(req, branchId, 'c');

    const [studentStats] = await db.query(
      `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'active') as active
       FROM students WHERE 1=1 ${bf.sql}`, bf.params
    );
    const [classStats] = await db.query(
      `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'active') as active
       FROM classes WHERE 1=1 ${bf.sql}`, bf.params
    );
    const [leadStats] = await db.query(
      `SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE scheduled_date = CURRENT_DATE) as today,
        COUNT(*) FILTER (WHERE status = 'waiting') as waiting,
        COUNT(*) FILTER (WHERE status = 'trial') as trial,
        COUNT(*) FILTER (WHERE status = 'converted'
          AND EXTRACT(MONTH FROM converted_at) = EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(YEAR FROM converted_at) = EXTRACT(YEAR FROM CURRENT_DATE)) as converted
       FROM leads WHERE 1=1 ${bf.sql}`, bf.params
    );
    const [recentLeads] = await db.query(
      `SELECT l.id, l.code, l.student_name, l.customer_name, l.customer_phone,
              l.status, l.scheduled_date, l.scheduled_time, b.code as branch_code
       FROM leads l LEFT JOIN branches b ON l.branch_id = b.id
       WHERE l.status IN ('new', 'scheduled', 'waiting') ${bfL.sql}
       ORDER BY CASE WHEN l.scheduled_date = CURRENT_DATE THEN 0 ELSE 1 END, l.scheduled_date ASC, l.created_at DESC
       LIMIT 10`, bfL.params
    );
    const [todaySessions] = await db.query(
      `SELECT s.id, s.session_number, s.start_time, s.end_time, s.status,
              c.class_name, c.class_code, u.full_name as teacher_name,
              (SELECT COUNT(*) FROM class_students WHERE class_id = c.id AND status = 'active') as student_count
       FROM sessions s JOIN classes c ON s.class_id = c.id LEFT JOIN users u ON c.teacher_id = u.id
       WHERE s.session_date = CURRENT_DATE AND s.status = 'scheduled' ${bfC.sql}
       ORDER BY s.start_time LIMIT 10`, bfC.params
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
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getDashboardEC = async (req, res) => {
  try {
    const userId = req.user.id;

    const [stats] = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE scheduled_date = CURRENT_DATE) as today,
        COUNT(*) FILTER (WHERE status = 'waiting') as waiting,
        COUNT(*) FILTER (WHERE status = 'converted' AND EXTRACT(MONTH FROM converted_at) = EXTRACT(MONTH FROM CURRENT_DATE)) as converted
      FROM leads WHERE sale_id = ?
    `, [userId]);

    const [myTasks] = await db.query(`
      SELECT id, code, student_name, customer_phone, status, scheduled_date, scheduled_time
      FROM leads WHERE sale_id = ? AND status IN ('new', 'scheduled', 'waiting', 'trial')
      ORDER BY CASE WHEN scheduled_date = CURRENT_DATE THEN 0 ELSE 1 END, scheduled_date ASC LIMIT 20
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
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getDashboardTeacher = async (req, res) => {
  try {
    const userId = req.user.id;

    const [classCount] = await db.query(
      `SELECT COUNT(*) as count FROM classes WHERE teacher_id = ? AND status = 'active'`, [userId]
    );
    const [todayCount] = await db.query(`
      SELECT COUNT(*) as count FROM sessions s JOIN classes c ON s.class_id = c.id
      WHERE c.teacher_id = ? AND s.session_date = CURRENT_DATE AND s.status = 'scheduled'
    `, [userId]);
    const [studentCount] = await db.query(`
      SELECT COUNT(DISTINCT cs.student_id) as count FROM class_students cs JOIN classes c ON cs.class_id = c.id
      WHERE c.teacher_id = ? AND c.status = 'active' AND cs.status = 'active'
    `, [userId]);
    const [schedule] = await db.query(`
      SELECT s.id, s.session_number, s.start_time, s.end_time, c.class_name, c.room,
             (SELECT COUNT(*) FROM class_students WHERE class_id = c.id AND status = 'active') as student_count
      FROM sessions s JOIN classes c ON s.class_id = c.id
      WHERE c.teacher_id = ? AND s.session_date = CURRENT_DATE AND s.status = 'scheduled'
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
    res.status(500).json({ success: false, message: error.message });
  }
};
