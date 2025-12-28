import BaseModel from './BaseModel.js';
import { deleteFile as deleteCloudinaryFile, getPublicIdFromUrl } from '../config/cloudinary.js';

class FileModel extends BaseModel {
  constructor() {
    super('files');
  }

  async findAllByUser({ userId, isAdmin, search, type, category, page = 1, limit = 50 } = {}) {
    let sql = `
      SELECT f.*, u.full_name as uploader_name
      FROM files f
      LEFT JOIN users u ON f.uploaded_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (!isAdmin && userId) { sql += ' AND f.uploaded_by = ?'; params.push(userId); }
    if (search) {
      sql += ' AND (f.filename LIKE ? OR f.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (type) {
      if (type === 'pdf') sql += ' AND f.mime_type LIKE "%pdf%"';
      else if (type === 'image') sql += ' AND f.mime_type LIKE "%image%"';
      else if (type === 'doc') sql += ' AND (f.mime_type LIKE "%word%" OR f.mime_type LIKE "%document%")';
    }
    if (category) { sql += ' AND f.category = ?'; params.push(category); }

    const countSql = sql.replace(/SELECT .* FROM/, 'SELECT COUNT(*) as total FROM');
    const [countRows] = await this.db.query(countSql, params);
    const total = countRows[0]?.total || 0;

    sql += ' ORDER BY f.created_at DESC LIMIT ? OFFSET ?';
    params.push(+limit, (+page - 1) * +limit);
    const [rows] = await this.db.query(sql, params);

    return { data: rows, pagination: { page: +page, limit: +limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async saveFile(fileInfo, userId) {
    const { filename, originalname, mimetype, size, path: fileUrl } = fileInfo;
    const { description, category } = fileInfo;

    const [result] = await this.db.query(
      `INSERT INTO files (filename, original_name, mime_type, file_size, file_url, description, category, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [filename, originalname, mimetype, size, fileUrl, description || '', category || 'other', userId]
    );

    return { id: result.insertId, filename: originalname, file_url: fileUrl };
  }

  async deleteFile(id, userId, isAdmin) {
    const file = await this.findById(id);
    if (!file) throw new Error('File không tồn tại');
    if (!isAdmin && file.uploaded_by !== userId) throw new Error('Không có quyền xóa file này');

    const publicId = getPublicIdFromUrl(file.file_url);
    if (publicId) {
      try {
        await deleteCloudinaryFile(publicId);
      } catch (err) {
        console.error('Cloudinary delete error:', err);
      }
    }

    await this.delete(id);
    return { success: true };
  }
}

export default new FileModel();
