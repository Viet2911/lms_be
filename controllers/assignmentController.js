import AssignmentModel from '../models/AssignmentModel.js';
import { getBranchFilter } from '../utils/branchHelper.js';

export const getAll = async (req, res, next) => {
  try {
    const { classId, sessionId, status, page = 1, limit = 20 } = req.query;
    const branchId = getBranchFilter(req);
    let teacherId, cmId;
    if (req.user.role_name === 'TEACHER') teacherId = req.user.id;
    else if (req.user.role_name === 'CM') cmId = req.user.id;

    const result = await AssignmentModel.findAllWithRelations({ classId, sessionId, status, teacherId, cmId, branchId, page, limit });
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
};

export const getById = async (req, res, next) => {
  try {
    const assignment = await AssignmentModel.findByIdWithRelations(req.params.id);
    if (!assignment) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
    res.json({ success: true, data: assignment });
  } catch (error) { next(error); }
};

export const getSubmissions = async (req, res, next) => {
  try {
    const submissions = await AssignmentModel.getSubmissions(req.params.id);
    res.json({ success: true, data: submissions });
  } catch (error) { next(error); }
};

export const create = async (req, res, next) => {
  try {
    const { classId, sessionId, title, description, fileId, dueDate, dueTime } = req.body;
    if (!classId || !title) return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });

    const assignment = await AssignmentModel.create({
      class_id: classId, 
      session_id: sessionId || null,
      title, 
      description, 
      file_id: fileId || null,
      due_date: dueDate || null, 
      due_time: dueTime || null, 
      status: 'published', 
      created_by: req.user.id
    });

    res.status(201).json({ success: true, message: 'Giao bài tập thành công', data: assignment });
  } catch (error) { next(error); }
};

export const update = async (req, res, next) => {
  try {
    const { title, description, sessionId, fileId, dueDate, dueTime, status } = req.body;
    const data = {};
    if (title) data.title = title;
    if (description !== undefined) data.description = description;
    if (sessionId !== undefined) data.session_id = sessionId || null;
    if (fileId !== undefined) data.file_id = fileId || null;
    if (dueDate !== undefined) data.due_date = dueDate || null;
    if (dueTime !== undefined) data.due_time = dueTime || null;
    if (status) data.status = status;

    await AssignmentModel.update(req.params.id, data);
    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (error) { next(error); }
};

export const grade = async (req, res, next) => {
  try {
    const { grade: gradeValue, feedback } = req.body;
    await AssignmentModel.gradeSubmission(req.params.submissionId, { grade: gradeValue, feedback, gradedBy: req.user.id });
    res.json({ success: true, message: 'Chấm điểm thành công' });
  } catch (error) { next(error); }
};

export const remove = async (req, res, next) => {
  try {
    await AssignmentModel.delete(req.params.id);
    res.json({ success: true, message: 'Xóa thành công' });
  } catch (error) { next(error); }
};
