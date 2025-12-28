import BaseModel from './BaseModel.js';

class AssignmentModel extends BaseModel {
  constructor() {
    super('assignments');
  }

  async findAllWithRelations({ classId, sessionId, status, teacherId, cmId, branchId, page = 1, limit = 20 } = {}) {
    let sql = `
      SELECT a.*, c.class_name, c.branch_id, b.name as branch_name, b.code as branch_code,
             s.session_number, DATE_FORMAT(s.session_date, '%Y-%m-%d') as session_date,
             u.full_name as created_by_name, f.file_url,
             (SELECT COUNT(*) FROM assignment_submissions WHERE assignment_id = a.id) as submission_count,
             (SELECT COUNT(*) FROM assignment_submissions WHERE assignment_id = a.id AND status = 'graded') as graded_count
      FROM assignments a
      JOIN classes c ON a.class_id = c.id
      JOIN branches b ON c.branch_id = b.id
      LEFT JOIN sessions s ON a.session_id = s.id
      LEFT JOIN users u ON a.created_by = u.id
      LEFT JOIN files f ON a.file_id = f.id
      WHERE 1=1
    `;
    const params = [];

    if (branchId) { sql += ' AND c.branch_id = ?'; params.push(branchId); }
    if (classId) { sql += ' AND a.class_id = ?'; params.push(classId); }
    if (sessionId) { sql += ' AND a.session_id = ?'; params.push(sessionId); }
    if (status) { sql += ' AND a.status = ?'; params.push(status); }
    if (teacherId) { sql += ' AND c.teacher_id = ?'; params.push(teacherId); }
    if (cmId) { sql += ' AND c.cm_id = ?'; params.push(cmId); }

    const countSql = sql.replace(/SELECT .* FROM/, 'SELECT COUNT(*) as total FROM');
    const [countRows] = await this.db.query(countSql, params);
    const total = countRows[0]?.total || 0;

    sql += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
    params.push(+limit, (+page - 1) * +limit);
    const [rows] = await this.db.query(sql, params);

    return { data: rows, pagination: { page: +page, limit: +limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findByIdWithRelations(id) {
    const [rows] = await this.db.query(
      `SELECT a.*, c.class_name, c.branch_id, b.name as branch_name, b.code as branch_code,
              s.session_number, DATE_FORMAT(s.session_date, '%Y-%m-%d') as session_date,
              u.full_name as created_by_name, f.file_url, f.original_name as file_name
       FROM assignments a
       JOIN classes c ON a.class_id = c.id
       JOIN branches b ON c.branch_id = b.id
       LEFT JOIN sessions s ON a.session_id = s.id
       LEFT JOIN users u ON a.created_by = u.id
       LEFT JOIN files f ON a.file_id = f.id
       WHERE a.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  async getSubmissions(assignmentId) {
    const [rows] = await this.db.query(
      `SELECT sub.*, s.full_name as student_name, s.student_code
       FROM assignment_submissions sub
       JOIN students s ON sub.student_id = s.id
       WHERE sub.assignment_id = ?
       ORDER BY sub.submitted_at DESC`,
      [assignmentId]
    );
    return rows;
  }

  async gradeSubmission(submissionId, { grade, feedback, gradedBy }) {
    await this.db.query(
      'UPDATE assignment_submissions SET grade = ?, feedback = ?, graded_at = NOW(), graded_by = ?, status = "graded" WHERE id = ?',
      [grade, feedback, gradedBy, submissionId]
    );
    return { success: true };
  }
}

export default new AssignmentModel();
