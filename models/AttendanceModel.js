import BaseModel from './BaseModel.js';

class AttendanceModel extends BaseModel {
  constructor() {
    super('attendance');
  }

  async getStudentsForSession(sessionId) {
    const [sessionInfo] = await this.db.query('SELECT class_id FROM sessions WHERE id = ?', [sessionId]);
    if (sessionInfo.length === 0) throw new Error('Buổi học không tồn tại');
    const classId = sessionInfo[0].class_id;

    const [students] = await this.db.query(
      `SELECT s.id as student_id, s.full_name, s.student_code, 'student' as type,
              a.id as attendance_id, a.status, a.note
       FROM students s
       JOIN class_students cs ON s.id = cs.student_id
       LEFT JOIN attendance a ON a.student_id = s.id AND a.session_id = ?
       WHERE cs.class_id = ? AND cs.status = 'active'
       ORDER BY s.full_name`,
      [sessionId, classId]
    );

    const [trials] = await this.db.query(
      `SELECT ts.id as trial_student_id, ts.full_name, ts.code as student_code, 'trial' as type,
              a.id as attendance_id, a.status, a.note
       FROM trial_students ts
       JOIN trial_class_students tcs ON ts.id = tcs.trial_student_id
       LEFT JOIN attendance a ON a.trial_student_id = ts.id AND a.session_id = ?
       WHERE tcs.class_id = ? AND ts.status = 'active'
       ORDER BY ts.full_name`,
      [sessionId, classId]
    );

    return [...students, ...trials];
  }

  async markAttendance(sessionId, attendances, markedBy) {
    const conn = await this.db.getConnection();
    try {
      await conn.beginTransaction();

      for (const att of attendances) {
        const { studentId, trialStudentId, status, note } = att;

        let existingQuery = 'SELECT id FROM attendance WHERE session_id = ?';
        const existingParams = [sessionId];
        if (studentId) { existingQuery += ' AND student_id = ?'; existingParams.push(studentId); }
        else if (trialStudentId) { existingQuery += ' AND trial_student_id = ?'; existingParams.push(trialStudentId); }

        const [existing] = await conn.query(existingQuery, existingParams);

        if (existing.length > 0) {
          await conn.query('UPDATE attendance SET status = ?, note = ? WHERE id = ?', [status, note || '', existing[0].id]);
        } else {
          await conn.query(
            `INSERT INTO attendance (session_id, student_id, trial_student_id, status, note, marked_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [sessionId, studentId || null, trialStudentId || null, status, note || '', markedBy]
          );
        }

        if (trialStudentId && ['present', 'late'].includes(status)) {
          await conn.query(
            `UPDATE trial_students SET sessions_attended = (
              SELECT COUNT(*) FROM attendance WHERE trial_student_id = ? AND status IN ('present', 'late')
            ) WHERE id = ?`,
            [trialStudentId, trialStudentId]
          );
        }
      }

      await conn.query('UPDATE sessions SET attendance_submitted = 1 WHERE id = ?', [sessionId]);
      await conn.commit();
      return { success: true };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async getClassReport(classId) {
    const [rows] = await this.db.query(
      `SELECT s.id, s.full_name, s.student_code,
              SUM(a.status = 'present') as present_count,
              SUM(a.status = 'late') as late_count,
              SUM(a.status = 'excused') as excused_count,
              SUM(a.status = 'absent') as absent_count
       FROM students s
       JOIN class_students cs ON s.id = cs.student_id
       LEFT JOIN attendance a ON a.student_id = s.id
       LEFT JOIN sessions ss ON a.session_id = ss.id AND ss.class_id = ?
       WHERE cs.class_id = ? AND cs.status = 'active'
       GROUP BY s.id
       ORDER BY s.full_name`,
      [classId, classId]
    );
    return rows;
  }
}

export default new AttendanceModel();
