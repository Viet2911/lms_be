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
      `SELECT s.id as student_id, s.full_name, s.student_code, s.parent_phone, 'student' as type,
              a.id as attendance_id, a.status, a.note
       FROM students s
       JOIN class_students cs ON s.id = cs.student_id
       LEFT JOIN attendance a ON a.student_id = s.id AND a.session_id = ?
       WHERE cs.class_id = ? AND cs.status = 'active'
       ORDER BY s.full_name`,
      [sessionId, classId]
    );

    const [trials] = await this.db.query(
      `SELECT ts.id as trial_student_id, ts.full_name, ts.code as student_code, ts.phone as parent_phone, 'trial' as type,
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

  async getSessionAttendance(sessionId) {
    const [rows] = await this.db.query(
      `SELECT a.*, s.full_name as student_name, s.student_code
       FROM attendance a
       LEFT JOIN students s ON a.student_id = s.id
       WHERE a.session_id = ?`,
      [sessionId]
    );
    return rows;
  }

  async markAttendance(sessionId, attendances, markedBy) {
    const conn = await this.db.getConnection();
    const warnings = []; // Collect students with warnings

    try {
      await conn.beginTransaction();

      // Get session and class info
      const [sessionInfo] = await conn.query(
        `SELECT s.*, c.class_name, c.branch_id 
         FROM sessions s 
         JOIN classes c ON s.class_id = c.id 
         WHERE s.id = ?`,
        [sessionId]
      );
      const session = sessionInfo[0];

      for (const att of attendances) {
        const { studentId, trialStudentId, status, note } = att;

        // Map frontend status to database status
        // on_time -> present, late -> late, excused -> excused, absent -> absent
        const dbStatus = status === 'on_time' ? 'present' : status;

        let existingQuery = 'SELECT id FROM attendance WHERE session_id = ?';
        const existingParams = [sessionId];
        if (studentId) { existingQuery += ' AND student_id = ?'; existingParams.push(studentId); }
        else if (trialStudentId) { existingQuery += ' AND trial_student_id = ?'; existingParams.push(trialStudentId); }

        const [existing] = await conn.query(existingQuery, existingParams);

        if (existing.length > 0) {
          await conn.query('UPDATE attendance SET status = ?, note = ?, check_in_by = ? WHERE id = ?', [dbStatus, note || '', markedBy, existing[0].id]);
        } else {
          await conn.query(
            `INSERT INTO attendance (session_id, student_id, trial_student_id, status, note, check_in_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [sessionId, studentId || null, trialStudentId || null, dbStatus, note || '', markedBy]
          );
        }

        // Check for warnings (late or absent)
        if (studentId && (dbStatus === 'late' || dbStatus === 'absent')) {
          // Count total late + absent for this student in this class
          const [countResult] = await conn.query(
            `SELECT COUNT(*) as total,
                    SUM(a.status = 'late') as late_count,
                    SUM(a.status = 'absent') as absent_count
             FROM attendance a
             JOIN sessions ss ON a.session_id = ss.id
             WHERE a.student_id = ? AND ss.class_id = ?`,
            [studentId, session.class_id]
          );

          const lateAbsentCount = (countResult[0].late_count || 0) + (countResult[0].absent_count || 0);

          if (lateAbsentCount >= 3) {
            // Get student info for warning
            const [studentInfo] = await conn.query(
              `SELECT s.full_name, s.student_code, s.parent_phone 
               FROM students s WHERE s.id = ?`,
              [studentId]
            );

            if (studentInfo[0]) {
              warnings.push({
                studentId,
                studentName: studentInfo[0].full_name,
                studentCode: studentInfo[0].student_code,
                parentPhone: studentInfo[0].parent_phone,
                lateCount: countResult[0].late_count || 0,
                absentCount: countResult[0].absent_count || 0,
                className: session.class_name,
                sessionNumber: session.session_number
              });
            }
          }
        }

        // Update trial student sessions
        if (trialStudentId && ['present', 'late'].includes(dbStatus)) {
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

      return { success: true, warnings };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async getClassReport(classId) {
    const [rows] = await this.db.query(
      `SELECT s.id, s.full_name, s.student_code, s.parent_phone,
              SUM(a.status = 'present') as present_count,
              SUM(a.status = 'present') as ontime_count,
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

  // Get students with warnings (late + absent >= 3)
  async getStudentsWithWarnings(branchId = null) {
    let sql = `
      SELECT s.id, s.full_name, s.student_code, s.parent_phone,
             c.class_name, c.id as class_id,
             SUM(a.status = 'late') as late_count,
             SUM(a.status = 'absent') as absent_count
      FROM students s
      JOIN class_students cs ON s.id = cs.student_id
      JOIN classes c ON cs.class_id = c.id
      LEFT JOIN attendance a ON a.student_id = s.id
      LEFT JOIN sessions ss ON a.session_id = ss.id AND ss.class_id = c.id
      WHERE cs.status = 'active'
    `;
    const params = [];

    if (branchId) {
      sql += ' AND c.branch_id = ?';
      params.push(branchId);
    }

    sql += ` GROUP BY s.id, c.id
             HAVING (late_count + absent_count) >= 3
             ORDER BY (late_count + absent_count) DESC`;

    const [rows] = await this.db.query(sql, params);
    return rows;
  }
}

export default new AttendanceModel();