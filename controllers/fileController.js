import FileModel from '../models/FileModel.js';

export const getAll = async (req, res, next) => {
  try {
    const { search, type, category, page = 1, limit = 50 } = req.query;
    const result = await FileModel.findAllByUser({
      userId: req.user.id, isAdmin: req.user.role_name === 'ADMIN',
      search, type, category, page, limit
    });
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
};

export const getById = async (req, res, next) => {
  try {
    const file = await FileModel.findById(req.params.id);
    if (!file) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
    res.json({ success: true, data: file });
  } catch (error) { next(error); }
};

export const upload = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'Không có file' });
    }

    const { description, category } = req.body;
    const uploadedFiles = [];

    for (const file of req.files) {
      const result = await FileModel.saveFile({
        filename: file.filename, originalname: file.originalname,
        mimetype: file.mimetype, size: file.size, path: file.path,
        description, category
      }, req.user.id);
      uploadedFiles.push(result);
    }

    res.status(201).json({ success: true, message: `Đã tải lên ${uploadedFiles.length} file`, data: uploadedFiles });
  } catch (error) { next(error); }
};

export const remove = async (req, res, next) => {
  try {
    await FileModel.deleteFile(req.params.id, req.user.id, req.user.role_name === 'ADMIN');
    res.json({ success: true, message: 'Xóa file thành công' });
  } catch (error) { next(error); }
};
