import CommonModel from '../models/CommonModel.js';

// ==================== SUBJECTS ====================
export const getSubjects = async (req, res, next) => {
  try {
    const subjects = await CommonModel.getSubjects();
    res.json({ success: true, data: subjects });
  } catch (error) { next(error); }
};

export const getSubjectById = async (req, res, next) => {
  try {
    const subject = await CommonModel.getSubjectById(req.params.id);
    if (!subject) return res.status(404).json({ success: false, message: 'Không tìm thấy môn học' });
    res.json({ success: true, data: subject });
  } catch (error) { next(error); }
};

export const createSubject = async (req, res, next) => {
  try {
    const { name, code, description } = req.body;
    if (!name || !code) return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });

    // Check duplicate code
    const existing = await CommonModel.getSubjectByCode(code);
    if (existing) return res.status(400).json({ success: false, message: 'Mã môn học đã tồn tại' });

    const subject = await CommonModel.createSubject({ name, code, description, is_active: 1 });
    res.status(201).json({ success: true, data: subject, message: 'Thêm môn học thành công' });
  } catch (error) { next(error); }
};

export const updateSubject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, code, description, is_active } = req.body;

    const subject = await CommonModel.getSubjectById(id);
    if (!subject) return res.status(404).json({ success: false, message: 'Không tìm thấy môn học' });

    // Check duplicate code (exclude current)
    if (code && code !== subject.code) {
      const existing = await CommonModel.getSubjectByCode(code);
      if (existing) return res.status(400).json({ success: false, message: 'Mã môn học đã tồn tại' });
    }

    await CommonModel.updateSubject(id, { name, code, description, is_active });
    res.json({ success: true, message: 'Cập nhật môn học thành công' });
  } catch (error) { next(error); }
};

export const deleteSubject = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if subject has levels or students
    const hasData = await CommonModel.subjectHasData(id);
    if (hasData) {
      return res.status(400).json({ success: false, message: 'Không thể xóa môn học đã có dữ liệu. Hãy ẩn thay vì xóa.' });
    }

    await CommonModel.deleteSubject(id);
    res.json({ success: true, message: 'Đã xóa môn học' });
  } catch (error) { next(error); }
};

// ==================== LEVELS ====================
export const getLevels = async (req, res, next) => {
  try {
    const levels = await CommonModel.getLevels(req.query.subjectId);
    res.json({ success: true, data: levels });
  } catch (error) { next(error); }
};

export const getLevelById = async (req, res, next) => {
  try {
    const level = await CommonModel.getLevelById(req.params.id);
    if (!level) return res.status(404).json({ success: false, message: 'Không tìm thấy cấp độ' });
    res.json({ success: true, data: level });
  } catch (error) { next(error); }
};

export const createLevel = async (req, res, next) => {
  try {
    const { name, code, subjectId, orderIndex, sessionsRequired, description } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Thiếu tên cấp độ' });

    const level = await CommonModel.createLevel({
      name,
      code,
      subject_id: subjectId,
      order_index: orderIndex || 0,
      sessions_required: sessionsRequired || 15,
      description
    });
    res.status(201).json({ success: true, data: level, message: 'Thêm cấp độ thành công' });
  } catch (error) { next(error); }
};

export const updateLevel = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, code, subjectId, orderIndex, sessionsRequired, description } = req.body;

    const level = await CommonModel.getLevelById(id);
    if (!level) return res.status(404).json({ success: false, message: 'Không tìm thấy cấp độ' });

    await CommonModel.updateLevel(id, {
      name,
      code,
      subject_id: subjectId,
      order_index: orderIndex,
      sessions_required: sessionsRequired,
      description
    });
    res.json({ success: true, message: 'Cập nhật cấp độ thành công' });
  } catch (error) { next(error); }
};

export const deleteLevel = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check if level has students
    const hasData = await CommonModel.levelHasData(id);
    if (hasData) {
      return res.status(400).json({ success: false, message: 'Không thể xóa cấp độ đã có học sinh' });
    }

    await CommonModel.deleteLevel(id);
    res.json({ success: true, message: 'Đã xóa cấp độ' });
  } catch (error) { next(error); }
};

// ==================== NOTIFICATIONS ====================
export const getNotifications = async (req, res, next) => {
  try {
    const notifications = await CommonModel.getNotifications(req.user.id);
    const unreadCount = await CommonModel.getUnreadCount(req.user.id);
    res.json({ success: true, data: notifications, unreadCount });
  } catch (error) { next(error); }
};

export const markNotificationRead = async (req, res, next) => {
  try {
    await CommonModel.markNotificationRead(req.params.id);
    res.json({ success: true });
  } catch (error) { next(error); }
};

export const markAllNotificationsRead = async (req, res, next) => {
  try {
    await CommonModel.markAllNotificationsRead(req.user.id);
    res.json({ success: true });
  } catch (error) { next(error); }
};