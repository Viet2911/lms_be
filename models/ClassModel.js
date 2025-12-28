import BaseModel from './BaseModel.js';

class ClassModel extends BaseModel {
  constructor() {
    super('classes');
  }

  generateCode(branchCode = 'CLS') {
    return branchCode + '-' + Date.now().toString(36).toUpperCase();
  }

  async findAllWithRelations({ status, subjectId, teacherId, cmId, branchId, search, page = 1, limit = 20 } = {}) {
    let sql = `
      SELECT c.*, b.name as branch_name, b.code as branch_code,
             s.name as subject_name, l.name as level_name,
             t.full_name as teacher_name, cm.full_name as cm_name,
             (SELECT COUNT(*) FROM class_students WHERE class_id = c.id AND status = 'active') as student_count
      FROM classes c
      JOIN branches b ON c.branch_id = b.id
      LEFT JOIN subjects s ON c.subject_id = s.id
      LEFT JOIN levels l ON c.level_id = l.id
      LEFT JOIN users t ON c.teacher_id = t.id
      LEFT JOIN users cm ON c.cm_id = cm.id
      WHERE 1=1
    `;
    const params = [];

    if (branchId) { sql += ' AND c.branch_id = ?'; params.push(branchId); }
    if (status) { sql += ' AND c.status = ?'; params.push(status); }
    if (subjectId) { sql += ' AND c.subject_id = ?'; params.push(subjectId); }
    if (teacherId) { sql += ' AND c.teacher_id = ?'; params.push(teacherId); }
    if (cmId) { sql += ' AND c.cm_id = ?'; params.push(cmId); }
    if (search) {
      sql += ' AND (c.class_name LIKE ? OR c.class_code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const countSql = sql.replace(/SELECT .* FROM/, 'SELECT COUNT(*) as total FROM');
    const [countRows] = await this.db.query(countSql, params);
    const total = countRows[0]?.total || 0;

    sql += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
    params.push(+limit, (+page - 1) * +limit);
    const [rows] = await this.db.query(sql, params);

    return { data: rows, pagination: { page: +page, limit: +limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findByIdWithRelations(id) {
    const [rows] = await this.db.query(
      `SELECT c.*, b.name as branch_name, b.code as branch_code,
              s.name as subject_name, l.name as level_name,
              t.full_name as teacher_name, cm.full_name as cm_name,
              (SELECT COUNT(*) FROM class_students WHERE class_id = c.id AND status = 'active') as student_count
       FROM classes c
       JOIN branches b ON c.branch_id = b.id
       LEFT JOIN subjects s ON c.subject_id = s.id
       LEFT JOIN levels l ON c.level_id = l.id
       LEFT JOIN users t ON c.teacher_id = t.id
       LEFT JOIN users cm ON c.cm_id = cm.id
       WHERE c.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  async getStudents(classId) {
    const [rows] = await this.db.query(
      `SELECT s.*, cs.enrolled_at,
              (SELECT COUNT(*) FROM attendance a JOIN sessions ss ON a.session_id = ss.id 
               WHERE a.student_id = s.id AND ss.class_id = ? AND a.status = 'present') as present_count,
              (SELECT COUNT(*) FROM attendance a JOIN sessions ss ON a.session_id = ss.id 
               WHERE a.student_id = s.id AND ss.class_id = ? AND a.status = 'absent') as absent_count
       FROM students s
       JOIN class_students cs ON s.id = cs.student_id
       WHERE cs.class_id = ? AND cs.status = 'active'
       ORDER BY s.full_name`,
      [classId, classId, classId]
    );
    return rows;
  }

  async addStudent(classId, studentId) {
    const [existing] = await this.db.query(
      'SELECT id FROM class_students WHERE class_id = ? AND student_id = ?',
      [classId, studentId]
    );
    if (existing.length > 0) throw new Error('Học sinh đã có trong lớp');

    await this.db.query(
      'INSERT INTO class_students (class_id, student_id, status) VALUES (?, ?, "active")',
      [classId, studentId]
    );
    return { success: true };
  }

  async removeStudent(classId, studentId) {
    await this.db.query(
      'UPDATE class_students SET status = "removed" WHERE class_id = ? AND student_id = ?',
      [classId, studentId]
    );
    return { success: true };
  }

  async getStats(branchId = null) {
    let sql = 'SELECT COUNT(*) as total, SUM(status = \'active\') as active FROM classes WHERE 1=1';
    const params = [];
    if (branchId) { sql += ' AND branch_id = ?'; params.push(branchId); }
    const [rows] = await this.db.query(sql, params);
    return rows[0];
  }
}

export default new ClassModel();
