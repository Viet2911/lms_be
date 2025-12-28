import CommonModel from '../models/CommonModel.js';

export const getSubjects = async (req, res, next) => {
  try {
    const subjects = await CommonModel.getSubjects();
    res.json({ success: true, data: subjects });
  } catch (error) { next(error); }
};

export const createSubject = async (req, res, next) => {
  try {
    const { name, code, description } = req.body;
    if (!name || !code) return res.status(400).json({ success: false, message: 'Thiếu thông tin' });
    const subject = await CommonModel.createSubject({ name, code, description, is_active: 1 });
    res.status(201).json({ success: true, data: subject });
  } catch (error) { next(error); }
};

export const getLevels = async (req, res, next) => {
  try {
    const levels = await CommonModel.getLevels(req.query.subjectId);
    res.json({ success: true, data: levels });
  } catch (error) { next(error); }
};

export const createLevel = async (req, res, next) => {
  try {
    const { name, code, subjectId, order } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Thiếu thông tin' });
    const level = await CommonModel.createLevel({ name, code, subject_id: subjectId, order });
    res.status(201).json({ success: true, data: level });
  } catch (error) { next(error); }
};

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
