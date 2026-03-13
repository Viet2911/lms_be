import AttendanceModel from '../models/AttendanceModel.js';
import TelegramService from '../services/telegramService.js';
import db from '../config/database.js';
import { getBranchFilter } from '../utils/branchHelper.js';

export const getStudentsForSession = async (req, res, next) => {
  try {
    const students = await AttendanceModel.getStudentsForSession(req.params.sessionId);
    res.json({ success: true, data: students });
  } catch (error) { next(error); }
};

export const getSessionAttendance = async (req, res, next) => {
  try {
    const attendance = await AttendanceModel.getSessionAttendance(req.params.sessionId);
    res.json({ success: true, data: attendance });
  } catch (error) { next(error); }
};

// Check if user can mark attendance for this session
async function canMarkAttendance(sessionId, user) {
  // CM, OM, HOEC, ADMIN can always mark attendance
  const alwaysAllowedRoles = ['CM', 'OM', 'HOEC', 'ADMIN'];
  if (alwaysAllowedRoles.includes(user.role_name)) {
    return { allowed: true };
  }

  // Teacher can only mark within time window
  if (user.role_name === 'TEACHER') {
    const [sessions] = await db.query(
      `SELECT s.id, s.session_date, s.start_time, s.end_time,
              s.teacher_id, s.substitute_teacher_id, s.attendance_submitted
       FROM sessions s
       WHERE s.id = ?`,
      [sessionId]
    );

    if (!sessions.length) {
      return { allowed: false, reason: 'Buổi học không tồn tại' };
    }

    const session = sessions[0];

    // Check if teacher (or substitute) is assigned to this session
    if (session.teacher_id !== user.id && session.substitute_teacher_id !== user.id) {
      return { allowed: false, reason: 'Bạn không phải giáo viên của buổi học này' };
    }

    const now = new Date();
    const sessionDate = new Date(session.session_date);

    // Parse session time
    const [startHour, startMin] = (session.start_time || '08:00:00').split(':').map(Number);
    const [endHour, endMin] = (session.end_time || '09:30:00').split(':').map(Number);

    // Create session datetime
    const sessionStart = new Date(sessionDate);
    sessionStart.setHours(startHour, startMin, 0, 0);

    const sessionEnd = new Date(sessionDate);
    sessionEnd.setHours(endHour, endMin, 0, 0);

    // Time window: 30 minutes before start to 60 minutes after end
    const windowStart = new Date(sessionStart.getTime() - 30 * 60 * 1000);
    const windowEnd = new Date(sessionEnd.getTime() + 60 * 60 * 1000);

    if (now < windowStart) {
      return {
        allowed: false,
        reason: `Chưa đến thời gian điểm danh. Bạn có thể điểm danh từ ${windowStart.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
      };
    }

    if (now > windowEnd) {
      return {
        allowed: false,
        reason: 'Đã quá thời gian điểm danh (sau 60 phút kết thúc buổi học). Vui lòng liên hệ CM/OM.'
      };
    }

    return { allowed: true };
  }

  return { allowed: false, reason: 'Bạn không có quyền điểm danh' };
}

export const markAttendance = async (req, res, next) => {
  try {
    const { attendances } = req.body;
    if (!attendances || !Array.isArray(attendances)) {
      return res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ' });
    }

    // Check permission
    const permCheck = await canMarkAttendance(req.params.sessionId, req.user);
    if (!permCheck.allowed) {
      return res.status(403).json({ success: false, message: permCheck.reason });
    }

    const result = await AttendanceModel.markAttendance(req.params.sessionId, attendances, req.user.id);

    // Send Telegram warnings for students with late + absent >= 3
    if (result.warnings && result.warnings.length > 0) {
      for (const warning of result.warnings) {
        const message = `⚠️ *CẢNH BÁO ĐIỂM DANH*

📚 Lớp: *${warning.className}*
👤 Học sinh: *${warning.studentName}*
🆔 Mã: \`${warning.studentCode}\`
📱 SĐT PH: ${warning.parentPhone || 'Không có'}

📊 *Thống kê:*
- Đi muộn: ${warning.lateCount} buổi
- Nghỉ không phép: ${warning.absentCount} buổi
- Tổng: ${warning.lateCount + warning.absentCount} buổi

❗️ Học sinh đã vượt quá 3 buổi muộn/nghỉ không phép. Cần liên hệ phụ huynh!`;

        try {
          await TelegramService.sendMessage(message);
        } catch (teleErr) {
        }
      }
    }

    res.json({
      success: true,
      message: 'Lưu điểm danh thành công',
      warnings: result.warnings || []
    });
  } catch (error) { next(error); }
};

export const getClassReport = async (req, res, next) => {
  try {
    const report = await AttendanceModel.getClassReport(req.params.classId);
    res.json({ success: true, data: report });
  } catch (error) { next(error); }
};

export const update = async (req, res, next) => {
  try {
    const { status, note } = req.body;
    await AttendanceModel.update(req.params.id, { status, note });
    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (error) { next(error); }
};

export const getStudentsWithWarnings = async (req, res, next) => {
  try {
    const branchId = getBranchFilter(req);
    const students = await AttendanceModel.getStudentsWithWarnings(branchId);
    res.json({ success: true, data: students });
  } catch (error) { next(error); }
};