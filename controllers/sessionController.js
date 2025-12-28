import SessionModel from '../models/SessionModel.js';
import { getBranchFilter } from '../utils/branchHelper.js';

export const getAll = async (req, res, next) => {
  try {
    const { classId, fromDate, toDate, status, page = 1, limit = 20 } = req.query;
    const teacherId = req.user.role_name === 'TEACHER' ? req.user.id : null;
    const branchId = getBranchFilter(req);
    const result = await SessionModel.findAllWithRelations({ classId, teacherId, branchId, fromDate, toDate, status, page, limit });
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
};

export const getById = async (req, res, next) => {
  try {
    const session = await SessionModel.findByIdWithRelations(req.params.id);
    if (!session) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
    res.json({ success: true, data: session });
  } catch (error) { next(error); }
};

export const getToday = async (req, res, next) => {
  try {
    const branchId = getBranchFilter(req);
    const sessions = await SessionModel.getToday(req.user.id, req.user.role_name, branchId);
    res.json({ success: true, data: sessions });
  } catch (error) { next(error); }
};

export const create = async (req, res, next) => {
  try {
    const { classId, sessionNumber, sessionDate, startTime, endTime, teacherId, note } = req.body;
    if (!classId || !sessionDate) return res.status(400).json({ success: false, message: 'Thiếu thông tin' });

    const session = await SessionModel.create({
      class_id: classId, session_number: sessionNumber, session_date: sessionDate,
      start_time: startTime, end_time: endTime, teacher_id: teacherId, note
    });

    res.status(201).json({ success: true, message: 'Tạo buổi học thành công', data: session });
  } catch (error) { next(error); }
};

export const generate = async (req, res, next) => {
  try {
    const { classId, count = 15 } = req.body;
    if (!classId) return res.status(400).json({ success: false, message: 'Vui lòng chọn lớp' });

    const sessions = await SessionModel.generateSessions(classId, count);
    res.status(201).json({ success: true, message: `Đã tạo ${sessions.length} buổi học`, data: sessions });
  } catch (error) { next(error); }
};

export const update = async (req, res, next) => {
  try {
    const { sessionDate, startTime, endTime, teacherId, substituteTeacherId, note } = req.body;
    
    const data = {};
    if (sessionDate) data.session_date = sessionDate;
    if (startTime) data.start_time = startTime;
    if (endTime) data.end_time = endTime;
    if (teacherId !== undefined) data.teacher_id = teacherId;
    if (substituteTeacherId !== undefined) data.substitute_teacher_id = substituteTeacherId;
    if (note !== undefined) data.note = note;

    await SessionModel.update(req.params.id, data);
    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (error) { next(error); }
};

export const remove = async (req, res, next) => {
  try {
    await SessionModel.delete(req.params.id);
    res.json({ success: true, message: 'Xóa thành công' });
  } catch (error) { next(error); }
};
