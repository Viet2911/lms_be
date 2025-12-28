import BaseModel from './BaseModel.js';

class SessionModel extends BaseModel {
  constructor() {
    super('sessions');
  }

  async findAllWithRelations({ classId, teacherId, branchId, fromDate, toDate, status, page = 1, limit = 20 } = {}) {
    let sql = `
      SELECT s.*, c.class_name, c.class_code, c.branch_id, b.name as branch_name, b.code as branch_code,
             t.full_name as teacher_name
      FROM sessions s
      JOIN classes c ON s.class_id = c.id
      JOIN branches b ON c.branch_id = b.id
      LEFT JOIN users t ON s.teacher_id = t.id
      WHERE 1=1
    `;
    const params = [];

    if (branchId) { sql += ' AND c.branch_id = ?'; params.push(branchId); }
    if (classId) { sql += ' AND s.class_id = ?'; params.push(classId); }
    if (teacherId) { sql += ' AND (s.teacher_id = ? OR s.substitute_teacher_id = ?)'; params.push(teacherId, teacherId); }
    if (fromDate) { sql += ' AND s.session_date >= ?'; params.push(fromDate); }
    if (toDate) { sql += ' AND s.session_date <= ?'; params.push(toDate); }
    if (status === 'pending') sql += ' AND s.attendance_submitted = 0';
    else if (status === 'completed') sql += ' AND s.attendance_submitted = 1';

    const countSql = sql.replace(/SELECT .* FROM/, 'SELECT COUNT(*) as total FROM');
    const [countRows] = await this.db.query(countSql, params);
    const total = countRows[0]?.total || 0;

    sql += ' ORDER BY s.session_date DESC, s.start_time DESC LIMIT ? OFFSET ?';
    params.push(+limit, (+page - 1) * +limit);
    const [rows] = await this.db.query(sql, params);

    return { data: rows, pagination: { page: +page, limit: +limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findByIdWithRelations(id) {
    const [rows] = await this.db.query(
      `SELECT s.*, c.class_name, c.class_code, c.branch_id, b.name as branch_name, b.code as branch_code,
              t.full_name as teacher_name
       FROM sessions s
       JOIN classes c ON s.class_id = c.id
       JOIN branches b ON c.branch_id = b.id
       LEFT JOIN users t ON s.teacher_id = t.id
       WHERE s.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  async generateSessions(classId, count = 15) {
    const [classInfo] = await this.db.query('SELECT * FROM classes WHERE id = ?', [classId]);
    if (classInfo.length === 0) throw new Error('Lớp học không tồn tại');

    const cls = classInfo[0];
    const startDate = new Date(cls.start_date || new Date());
    const [lastSession] = await this.db.query('SELECT MAX(session_number) as max_num FROM sessions WHERE class_id = ?', [classId]);
    let sessionNum = (lastSession[0]?.max_num || 0) + 1;

    const sessions = [];
    let currentDate = new Date(startDate);

    for (let i = 0; i < count; i++) {
      if (i > 0) currentDate.setDate(currentDate.getDate() + 7);
      const sessionDate = currentDate.toISOString().split('T')[0];

      await this.db.query(
        `INSERT INTO sessions (class_id, session_number, session_date, start_time, end_time, teacher_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [classId, sessionNum++, sessionDate, cls.start_time, cls.end_time, cls.teacher_id]
      );
      sessions.push({ session_number: sessionNum - 1, session_date: sessionDate });
    }

    return sessions;
  }

  async getToday(userId = null, role = null, branchId = null) {
    let sql = `
      SELECT s.*, c.class_name, c.class_code, c.branch_id, b.name as branch_name, b.code as branch_code,
             t.full_name as teacher_name
      FROM sessions s
      JOIN classes c ON s.class_id = c.id
      JOIN branches b ON c.branch_id = b.id
      LEFT JOIN users t ON s.teacher_id = t.id
      WHERE s.session_date = CURDATE()
    `;
    const params = [];

    if (branchId) { sql += ' AND c.branch_id = ?'; params.push(branchId); }

    if (role === 'TEACHER' && userId) {
      sql += ' AND (s.teacher_id = ? OR s.substitute_teacher_id = ?)';
      params.push(userId, userId);
    } else if (role === 'CM' && userId) {
      sql += ' AND c.cm_id = ?';
      params.push(userId);
    }

    sql += ' ORDER BY b.name, s.start_time';
    const [rows] = await this.db.query(sql, params);
    return rows;
  }
}

export default new SessionModel();
