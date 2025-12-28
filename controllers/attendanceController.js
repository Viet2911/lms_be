import AttendanceModel from '../models/AttendanceModel.js';

export const getStudentsForSession = async (req, res, next) => {
  try {
    const students = await AttendanceModel.getStudentsForSession(req.params.sessionId);
    res.json({ success: true, data: students });
  } catch (error) { next(error); }
};

export const markAttendance = async (req, res, next) => {
  try {
    const { attendances } = req.body;
    if (!attendances || !Array.isArray(attendances)) {
      return res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ' });
    }

    await AttendanceModel.markAttendance(req.params.sessionId, attendances, req.user.id);
    res.json({ success: true, message: 'Lưu điểm danh thành công' });
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
