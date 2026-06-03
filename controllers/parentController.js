/**
 * parentController.js
 * API dành riêng cho tài khoản Phụ huynh (role = PH).
 * Phụ huynh chỉ được xem dữ liệu của học sinh được liên kết qua bảng parent_students.
 */

import db from '../config/database.js';

// ── Helper: kiểm tra phụ huynh có quyền xem học sinh này không ─────────────
async function assertParentAccess(parentId, studentId) {
  const [rows] = await db.query(
    `SELECT 1 FROM parent_students
     WHERE parent_id = ? AND student_id = ? AND is_active = true`,
    [parentId, studentId],
  );
  return rows.length > 0;
}

// ── Middleware: gắn vào route trước handler nếu có :studentId ───────────────
export const checkParentAccess = async (req, res, next) => {
  try {
    const studentId = parseInt(req.params.studentId, 10);
    if (!studentId) return res.status(400).json({ success: false, message: 'studentId không hợp lệ' });

    const ok = await assertParentAccess(req.user.id, studentId);
    if (!ok) return res.status(403).json({ success: false, message: 'Bạn không có quyền xem thông tin học sinh này' });

    req.studentId = studentId;
    next();
  } catch (error) { next(error); }
};

// ── GET /parent/children ─────────────────────────────────────────────────────
// Lấy danh sách con của phụ huynh đang đăng nhập
export const getMyChildren = async (req, res, next) => {
  try {
    const [children] = await db.query(
      `SELECT
         s.id,
         s.student_code,
         s.full_name,
         s.birth_year,
         s.gender,
         s.status,
         s.remaining_sessions,
         s.total_sessions,
         s.fee_status,
         s.subject_id,
         sub.name   AS subject_name,
         lv.name    AS level_name,
         c.class_name,
         c.id       AS class_id,
         ps.relationship,
         ps.id      AS link_id
       FROM parent_students ps
       JOIN students s  ON s.id = ps.student_id
       LEFT JOIN subjects sub ON sub.id = s.subject_id
       LEFT JOIN levels   lv  ON lv.id = s.current_level_id
       LEFT JOIN class_students cs ON cs.student_id = s.id AND cs.status = 'active'
       LEFT JOIN classes c ON c.id = cs.class_id
       WHERE ps.parent_id = ? AND ps.is_active = true
       ORDER BY s.full_name`,
      [req.user.id],
    );

    res.json({ success: true, data: children });
  } catch (error) { next(error); }
};

// ── GET /parent/children/:studentId ─────────────────────────────────────────
// Chi tiết học sinh (thông tin cơ bản + lớp + còn buổi)
export const getChildDetail = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT
         s.*,
         sub.name  AS subject_name,
         lv.name   AS level_name,
         c.class_name,
         c.id      AS class_id,
         c.start_time  AS class_start_time,
         c.end_time    AS class_end_time,
         c.study_days,
         u.full_name   AS teacher_name
       FROM students s
       LEFT JOIN subjects      sub ON sub.id = s.subject_id
       LEFT JOIN levels        lv  ON lv.id  = s.current_level_id
       LEFT JOIN class_students cs ON cs.student_id = s.id AND cs.status = 'active'
       LEFT JOIN classes       c   ON c.id = cs.class_id
       LEFT JOIN users         u   ON u.id  = c.teacher_id
       WHERE s.id = ?`,
      [req.studentId],
    );

    if (!rows.length) return res.status(404).json({ success: false, message: 'Không tìm thấy học sinh' });
    res.json({ success: true, data: rows[0] });
  } catch (error) { next(error); }
};

// ── GET /parent/children/:studentId/attendance ───────────────────────────────
// Lịch sử điểm danh của học sinh (30 buổi gần nhất)
export const getChildAttendance = async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const [rows] = await db.query(
      `SELECT
         a.id,
         a.status,
         a.note,
         a.created_at  AS marked_at,
         se.id         AS session_id,
         se.session_number,
         se.session_date,
         se.start_time,
         se.end_time,
         se.attendance_submitted,
         c.class_name,
         c.id          AS class_id
       FROM attendance a
       JOIN sessions se ON se.id = a.session_id
       JOIN classes  c  ON c.id  = se.class_id
       WHERE a.student_id = ?
       ORDER BY se.session_date DESC, se.start_time DESC
       LIMIT ?`,
      [req.studentId, limit],
    );

    // Tổng hợp thống kê
    const stats = rows.reduce(
      (acc, r) => {
        acc.total++;
        if (r.status === 'present') acc.present++;
        else if (r.status === 'late')    acc.late++;
        else if (r.status === 'absent')  acc.absent++;
        else if (r.status === 'excused') acc.excused++;
        return acc;
      },
      { total: 0, present: 0, late: 0, absent: 0, excused: 0 },
    );

    res.json({ success: true, data: { records: rows, stats } });
  } catch (error) { next(error); }
};

// ── GET /parent/children/:studentId/sessions ────────────────────────────────
// Danh sách buổi học của lớp học sinh đang học (kèm trạng thái điểm danh của học sinh)
export const getChildSessions = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT
         se.id,
         se.session_number,
         se.session_date,
         se.start_time,
         se.end_time,
         se.attendance_submitted,
         c.class_name,
         c.id             AS class_id,
         a.status         AS attendance_status,
         a.note           AS attendance_note,
         sf.rating        AS feedback_rating,
         sf.feedback      AS feedback_text,
         sf.homework_assigned
       FROM sessions se
       JOIN classes c ON c.id = se.class_id
       JOIN class_students cs ON cs.class_id = c.id AND cs.student_id = ? AND cs.status = 'active'
       LEFT JOIN attendance a ON a.session_id = se.id AND a.student_id = ?
       LEFT JOIN session_feedbacks sf ON sf.session_id = se.id AND sf.student_id = ?
       ORDER BY se.session_date DESC, se.start_time DESC`,
      [req.studentId, req.studentId, req.studentId],
    );

    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
};

// ── GET /parent/children/:studentId/assignments ──────────────────────────────
// Bài tập về nhà của học sinh (30 BTVN gần nhất)
export const getChildAssignments = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT
         a.id,
         a.title,
         a.description,
         a.due_date,
         a.created_at,
         se.session_number,
         se.session_date,
         c.class_name,
         sub.status       AS submission_status,
         sub.score,
         sub.feedback     AS submission_feedback,
         sub.file_url     AS submission_file_url,
         sub.submitted_at,
         sub.graded_at,
         f.file_url       AS assignment_file_url,
         f.file_name      AS assignment_file_name
       FROM assignments a
       JOIN sessions se ON se.id = a.session_id
       JOIN classes  c  ON c.id  = se.class_id
       JOIN class_students cs ON cs.class_id = c.id AND cs.student_id = ? AND cs.status = 'active'
       LEFT JOIN assignment_submissions sub ON sub.assignment_id = a.id AND sub.student_id = ?
       LEFT JOIN files f ON f.id = a.file_id
       ORDER BY a.created_at DESC
       LIMIT 60`,
      [req.studentId, req.studentId],
    );

    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
};

// ── GET /parent/children/:studentId/feedbacks ────────────────────────────────
// Nhận xét buổi học của giáo viên về học sinh
export const getChildFeedbacks = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      `SELECT
         sf.id,
         sf.rating,
         sf.feedback,
         sf.homework_assigned,
         sf.parent_notified,
         sf.created_at,
         se.session_number,
         se.session_date,
         se.start_time,
         c.class_name,
         u.full_name AS teacher_name
       FROM session_feedbacks sf
       JOIN sessions se ON se.id = sf.session_id
       JOIN classes  c  ON c.id  = se.class_id
       JOIN users    u  ON u.id  = sf.created_by
       WHERE sf.student_id = ?
       ORDER BY se.session_date DESC
       LIMIT 60`,
      [req.studentId],
    );

    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
};

// ── GET /parent/children/:studentId/dashboard ────────────────────────────────
// Dashboard tổng hợp cho phụ huynh (recent attendance + upcoming sessions + unread feedbacks)
export const getChildDashboard = async (req, res, next) => {
  try {
    const studentId = req.studentId;

    // Thông tin cơ bản học sinh
    const [[student]] = await db.query(
      `SELECT s.id, s.full_name, s.student_code, s.remaining_sessions,
              s.status, s.fee_status,
              sub.name AS subject_name,
              lv.name  AS level_name,
              c.class_name, c.study_days,
              c.start_time AS class_start_time,
              c.end_time   AS class_end_time,
              u.full_name  AS teacher_name
       FROM students s
       LEFT JOIN subjects sub ON sub.id = s.subject_id
       LEFT JOIN levels   lv  ON lv.id  = s.current_level_id
       LEFT JOIN class_students cs ON cs.student_id = s.id AND cs.status = 'active'
       LEFT JOIN classes  c  ON c.id = cs.class_id
       LEFT JOIN users    u  ON u.id = c.teacher_id
       WHERE s.id = ?`,
      [studentId],
    );

    // 5 buổi gần nhất có điểm danh
    const [recentAttendance] = await db.query(
      `SELECT a.status, a.note, se.session_number, se.session_date, se.start_time, c.class_name
       FROM attendance a
       JOIN sessions se ON se.id = a.session_id
       JOIN classes  c  ON c.id  = se.class_id
       WHERE a.student_id = ?
       ORDER BY se.session_date DESC LIMIT 5`,
      [studentId],
    );

    // Buổi học sắp tới (trong 7 ngày)
    const [upcomingSessions] = await db.query(
      `SELECT se.id, se.session_number, se.session_date, se.start_time, se.end_time, c.class_name
       FROM sessions se
       JOIN classes c ON c.id = se.class_id
       JOIN class_students cs ON cs.class_id = c.id AND cs.student_id = ? AND cs.status = 'active'
       WHERE se.session_date >= CURRENT_DATE AND se.session_date <= CURRENT_DATE + INTERVAL '7 days'
       ORDER BY se.session_date, se.start_time
       LIMIT 5`,
      [studentId],
    );

    // Nhận xét chưa đọc (3 gần nhất)
    const [recentFeedbacks] = await db.query(
      `SELECT sf.rating, sf.feedback, sf.homework_assigned, sf.created_at,
              se.session_number, se.session_date, c.class_name, u.full_name AS teacher_name
       FROM session_feedbacks sf
       JOIN sessions se ON se.id = sf.session_id
       JOIN classes  c  ON c.id  = se.class_id
       JOIN users    u  ON u.id  = sf.created_by
       WHERE sf.student_id = ?
       ORDER BY sf.created_at DESC LIMIT 3`,
      [studentId],
    );

    // BTVN chưa nộp
    const [pendingAssignments] = await db.query(
      `SELECT a.id, a.title, a.due_date, se.session_number, c.class_name
       FROM assignments a
       JOIN sessions se ON se.id = a.session_id
       JOIN classes  c  ON c.id  = se.class_id
       JOIN class_students cs ON cs.class_id = c.id AND cs.student_id = ? AND cs.status = 'active'
       LEFT JOIN assignment_submissions sub ON sub.assignment_id = a.id AND sub.student_id = ?
       WHERE sub.id IS NULL
         AND (a.due_date IS NULL OR a.due_date >= CURRENT_DATE)
       ORDER BY a.due_date ASC
       LIMIT 5`,
      [studentId, studentId],
    );

    // Thống kê điểm danh tháng này
    const [attendanceStats] = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE a.status = 'present') AS present,
         COUNT(*) FILTER (WHERE a.status = 'late')    AS late,
         COUNT(*) FILTER (WHERE a.status = 'absent')  AS absent,
         COUNT(*) FILTER (WHERE a.status = 'excused') AS excused,
         COUNT(*) AS total
       FROM attendance a
       JOIN sessions se ON se.id = a.session_id
       WHERE a.student_id = ?
         AND DATE_TRUNC('month', se.session_date) = DATE_TRUNC('month', CURRENT_DATE)`,
      [studentId],
    );

    res.json({
      success: true,
      data: {
        student,
        recentAttendance,
        upcomingSessions,
        recentFeedbacks,
        pendingAssignments,
        attendanceStats: attendanceStats[0] ?? { present: 0, late: 0, absent: 0, excused: 0, total: 0 },
      },
    });
  } catch (error) { next(error); }
};

// ── ADMIN: Liên kết phụ huynh với học sinh ───────────────────────────────────
export const linkParentStudent = async (req, res, next) => {
  try {
    const { parent_id, student_id, relationship = 'parent', note } = req.body;
    if (!parent_id || !student_id) {
      return res.status(400).json({ success: false, message: 'Thiếu parent_id hoặc student_id' });
    }

    // Kiểm tra parent có role PH không
    const [[parentUser]] = await db.query(
      `SELECT u.id, r.name AS role_name
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.id = ? AND u.is_active = true`,
      [parent_id],
    );
    if (!parentUser) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản phụ huynh' });
    }
    if (parentUser.role_name !== 'PH') {
      return res.status(400).json({ success: false, message: 'Tài khoản này không phải role Phụ huynh (PH)' });
    }

    // Kiểm tra học sinh tồn tại
    const [[student]] = await db.query('SELECT id FROM students WHERE id = ?', [student_id]);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy học sinh' });
    }

    // Upsert liên kết
    await db.query(
      `INSERT INTO parent_students (parent_id, student_id, relationship, note, created_by, is_active)
       VALUES (?, ?, ?, ?, ?, true)
       ON CONFLICT (parent_id, student_id)
       DO UPDATE SET relationship = EXCLUDED.relationship,
                     note = EXCLUDED.note,
                     is_active = true,
                     created_by = EXCLUDED.created_by`,
      [parent_id, student_id, relationship, note || null, req.user.id],
    );

    res.json({ success: true, message: 'Đã liên kết phụ huynh với học sinh thành công' });
  } catch (error) { next(error); }
};

// ── ADMIN: Hủy liên kết ─────────────────────────────────────────────────────
export const unlinkParentStudent = async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.query(
      `UPDATE parent_students SET is_active = false WHERE id = ?`,
      [id],
    );
    res.json({ success: true, message: 'Đã hủy liên kết' });
  } catch (error) { next(error); }
};

// ── ADMIN: Xem danh sách học sinh của một phụ huynh ─────────────────────────
export const getParentChildren = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      `SELECT
         ps.id AS link_id, ps.relationship, ps.is_active, ps.created_at,
         s.id AS student_id, s.student_code, s.full_name, s.status,
         s.remaining_sessions, sub.name AS subject_name
       FROM parent_students ps
       JOIN students s ON s.id = ps.student_id
       LEFT JOIN subjects sub ON sub.id = s.subject_id
       WHERE ps.parent_id = ?
       ORDER BY ps.is_active DESC, s.full_name`,
      [id],
    );
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
};

// ── ADMIN: Xem danh sách phụ huynh của một học sinh ─────────────────────────
export const getStudentParents = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const [rows] = await db.query(
      `SELECT
         ps.id AS link_id, ps.relationship, ps.is_active, ps.created_at,
         u.id  AS parent_id, u.full_name, u.username, u.phone, u.email
       FROM parent_students ps
       JOIN users u ON u.id = ps.parent_id
       WHERE ps.student_id = ?
       ORDER BY ps.is_active DESC, u.full_name`,
      [studentId],
    );
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
};
