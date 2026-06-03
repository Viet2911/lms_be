import BaseModel from './BaseModel.js';
import { deleteFile as deleteCloudinaryFile, getPublicIdFromUrl } from '../config/cloudinary.js';

class FileModel extends BaseModel {
  constructor() {
    super('files');
  }

  async findAllByUser({ userId, isAdmin, branchId, search, type, page = 1, limit = 50 } = {}) {
    let sql = `
      SELECT f.*, u.full_name as uploader_name
      FROM files f
      LEFT JOIN users u ON f.uploaded_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (branchId) {
      sql += ` AND f.uploaded_by IN (SELECT user_id FROM user_branches WHERE branch_id = ?)`;
      params.push(branchId);
    } else if (!isAdmin && userId) {
      sql += ` AND f.uploaded_by IN (
        SELECT user_id FROM user_branches WHERE branch_id IN (
          SELECT branch_id FROM user_branches WHERE user_id = ?
        )
      )`;
      params.push(userId);
    }
    if (search) {
      sql += ' AND f.file_name ILIKE ?';
      params.push(`%${search}%`);
    }
    if (type) {
      if (type === 'pdf') sql += ` AND f.file_type LIKE '%pdf%'`;
      else if (type === 'image') sql += ` AND f.file_type LIKE '%image%'`;
      else if (type === 'doc') sql += ` AND (f.file_type LIKE '%word%' OR f.file_type LIKE '%document%')`;
    }

    const countSql = sql.replace('SELECT f.*, u.full_name as uploader_name', 'SELECT COUNT(*) as total');
    const [countRows] = await this.db.query(countSql, params);
    const total = parseInt(countRows[0]?.total || 0);

    sql += ' ORDER BY f.created_at DESC LIMIT ? OFFSET ?';
    params.push(+limit, (+page - 1) * +limit);
    const [rows] = await this.db.query(sql, params);

    return { data: rows, pagination: { page: +page, limit: +limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async saveFile(fileInfo, userId) {
    const { filename, originalname, mimetype, size, path: fileUrl, public_id } = fileInfo;
    // Cloudinary uses `filename` as the public_id
    const publicId = public_id || filename || null;

    const [rows] = await this.db.query(
      `INSERT INTO files (file_name, file_url, file_type, file_size, public_id, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      [originalname, fileUrl, mimetype, size, publicId, userId]
    );

    return { id: rows[0]?.id, file_name: originalname, file_url: fileUrl };
  }

  async deleteFile(id, userId, isAdmin) {
    const file = await this.findById(id);
    if (!file) throw new Error('File không tồn tại');
    if (!isAdmin && file.uploaded_by !== userId) throw new Error('Không có quyền xóa file này');

    const publicId = getPublicIdFromUrl(file.file_url);
    if (publicId) {
      try { await deleteCloudinaryFile(publicId); } catch (err) { /* ignore */ }
    }

    await this.delete(id);
    return { success: true };
  }
}

export default new FileModel();
