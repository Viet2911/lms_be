import ClassModel from '../models/ClassModel.js';
import StudentModel from '../models/StudentModel.js';
import { getBranchFilter, getCreateBranchId, getBranchCode } from '../utils/branchHelper.js';

export const getAll = async (req, res, next) => {
  try {
    const { status, subjectId, search, page = 1, limit = 20 } = req.query;
    const branchId = getBranchFilter(req);
    let teacherId, cmId;
    if (req.user.role_name === 'TEACHER') teacherId = req.user.id;
    else if (req.user.role_name === 'CM') cmId = req.user.id;

    const result = await ClassModel.findAllWithRelations({ status, subjectId, teacherId, cmId, branchId, search, page, limit });
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
};

export const getStats = async (req, res, next) => {
  try {
    const branchId = getBranchFilter(req);
    const stats = await ClassModel.getStats(branchId);
    res.json({ success: true, data: stats });
  } catch (error) { next(error); }
};

export const getById = async (req, res, next) => {
  try {
    const cls = await ClassModel.findByIdWithRelations(req.params.id);
    if (!cls) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
    res.json({ success: true, data: cls });
  } catch (error) { next(error); }
};

export const getStudents = async (req, res, next) => {
  try {
    const students = await ClassModel.getStudents(req.params.id);
    res.json({ success: true, data: students });
  } catch (error) { next(error); }
};

export const create = async (req, res, next) => {
  try {
    const { branchId, className, subjectId, levelId, teacherId, cmId, studyDays, startTime, endTime, room, startDate, totalSessions, maxStudents } = req.body;
    if (!className) return res.status(400).json({ success: false, message: 'Vui lòng nhập tên lớp' });

    const finalBranchId = getCreateBranchId(req);
    if (!finalBranchId) {
      return res.status(400).json({ success: false, message: 'Cần chọn cơ sở' });
    }

    const branchCode = getBranchCode(req.user, finalBranchId);

    const cls = await ClassModel.create({
      branch_id: finalBranchId,
      class_code: ClassModel.generateCode(branchCode), class_name: className,
      subject_id: subjectId || null, level_id: levelId || null,
      teacher_id: teacherId || null, cm_id: cmId || null,
      study_days: studyDays, start_time: startTime, end_time: endTime,
      room, start_date: startDate, total_sessions: totalSessions || 15,
      max_students: maxStudents || 15, status: 'active'
    });

    res.status(201).json({ success: true, message: 'Tạo lớp thành công', data: cls });
  } catch (error) { next(error); }
};

export const update = async (req, res, next) => {
  try {
    const { className, subjectId, levelId, teacherId, cmId, studyDays, startTime, endTime, room, startDate, totalSessions, maxStudents, status } = req.body;

    const data = {};
    if (className) data.class_name = className;
    if (subjectId !== undefined) data.subject_id = subjectId || null;
    if (levelId !== undefined) data.level_id = levelId || null;
    if (teacherId !== undefined) data.teacher_id = teacherId || null;
    if (cmId !== undefined) data.cm_id = cmId || null;
    if (studyDays !== undefined) data.study_days = studyDays;
    if (startTime !== undefined) data.start_time = startTime;
    if (endTime !== undefined) data.end_time = endTime;
    if (room !== undefined) data.room = room;
    if (startDate !== undefined) data.start_date = startDate;
    if (totalSessions !== undefined) data.total_sessions = totalSessions;
    if (maxStudents !== undefined) data.max_students = maxStudents;
    if (status) data.status = status;

    await ClassModel.update(req.params.id, data);
    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (error) { next(error); }
};

export const remove = async (req, res, next) => {
  try {
    await ClassModel.update(req.params.id, { status: 'inactive' });
    res.json({ success: true, message: 'Xóa thành công' });
  } catch (error) { next(error); }
};

export const addStudent = async (req, res, next) => {
  try {
    const { studentId } = req.body;

    // Validate student exists
    const student = await StudentModel.findByIdWithRelations(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Học sinh không tồn tại' });
    }

    // Check required fields - chỉ cần thông tin cơ bản
    const missingFields = [];
    if (!student.full_name) missingFields.push('Họ tên');
    if (!student.parent_phone) missingFields.push('SĐT phụ huynh');

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Học sinh thiếu thông tin bắt buộc: ${missingFields.join(', ')}`,
        missingFields,
        studentId
      });
    }

    // Allow pending, waiting, active students to be added to class
    const allowedStatuses = ['active', 'pending', 'waiting'];
    if (!allowedStatuses.includes(student.status)) {
      return res.status(400).json({
        success: false,
        message: `Học sinh đang ở trạng thái "${student.status}". Chỉ học sinh "pending", "waiting" hoặc "active" mới được thêm vào lớp.`
      });
    }

    await ClassModel.addStudent(req.params.id, studentId);
    res.json({ success: true, message: 'Thêm học sinh vào lớp thành công' });
  } catch (error) { next(error); }
};

export const removeStudent = async (req, res, next) => {
  try {
    await ClassModel.removeStudent(req.params.id, req.params.studentId);
    res.json({ success: true, message: 'Xóa học sinh khỏi lớp thành công' });
  } catch (error) { next(error); }
};