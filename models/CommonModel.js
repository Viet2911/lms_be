import db from '../config/database.js';

class CommonModel {
  constructor() {
    this.db = db;
  }

  // ==================== SUBJECTS ====================
  async getSubjects(includeInactive = false) {
    let sql = 'SELECT * FROM subjects';
    if (!includeInactive) sql += ' WHERE is_active = 1';
    sql += ' ORDER BY name';
    const [rows] = await this.db.query(sql);
    return rows;
  }

  async getSubjectById(id) {
    const [rows] = await this.db.query('SELECT * FROM subjects WHERE id = ?', [id]);
    return rows[0];
  }

  async getSubjectByCode(code) {
    const [rows] = await this.db.query('SELECT * FROM subjects WHERE code = ?', [code]);
    return rows[0];
  }

  async createSubject(data) {
    const [result] = await this.db.query('INSERT INTO subjects SET ?', [data]);
    return { id: result.insertId, ...data };
  }

  async updateSubject(id, data) {
    const updates = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.code !== undefined) updates.code = data.code;
    if (data.description !== undefined) updates.description = data.description;
    if (data.is_active !== undefined) updates.is_active = data.is_active;

    if (Object.keys(updates).length === 0) return;
    await this.db.query('UPDATE subjects SET ? WHERE id = ?', [updates, id]);
  }

  async deleteSubject(id) {
    await this.db.query('DELETE FROM subjects WHERE id = ?', [id]);
  }

  async subjectHasData(id) {
    const [levels] = await this.db.query('SELECT COUNT(*) as count FROM levels WHERE subject_id = ?', [id]);
    const [students] = await this.db.query('SELECT COUNT(*) as count FROM students WHERE subject_id = ?', [id]);
    const [classes] = await this.db.query('SELECT COUNT(*) as count FROM classes WHERE subject_id = ?', [id]);
    return (levels[0]?.count > 0) || (students[0]?.count > 0) || (classes[0]?.count > 0);
  }

  // ==================== LEVELS ====================
  async getLevels(subjectId = null) {
    let sql = `
      SELECT l.*, s.name as subject_name 
      FROM levels l 
      LEFT JOIN subjects s ON l.subject_id = s.id 
      WHERE 1=1
    `;
    const params = [];
    if (subjectId) {
      sql += ' AND l.subject_id = ?';
      params.push(subjectId);
    }
    sql += ' ORDER BY l.subject_id, l.order_index, l.name';
    const [rows] = await this.db.query(sql, params);
    return rows;
  }

  async getLevelById(id) {
    const [rows] = await this.db.query(`
      SELECT l.*, s.name as subject_name 
      FROM levels l 
      LEFT JOIN subjects s ON l.subject_id = s.id 
      WHERE l.id = ?
    `, [id]);
    return rows[0];
  }

  async createLevel(data) {
    const insertData = {
      name: data.name,
      code: data.code || null,
      subject_id: data.subject_id || null,
      order_index: data.order_index || 0,
      sessions_required: data.sessions_required || 15,
      description: data.description || null
    };
    const [result] = await this.db.query('INSERT INTO levels SET ?', [insertData]);
    return { id: result.insertId, ...insertData };
  }

  async updateLevel(id, data) {
    const updates = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.code !== undefined) updates.code = data.code;
    if (data.subject_id !== undefined) updates.subject_id = data.subject_id;
    if (data.order_index !== undefined) updates.order_index = data.order_index;
    if (data.sessions_required !== undefined) updates.sessions_required = data.sessions_required;
    if (data.description !== undefined) updates.description = data.description;

    if (Object.keys(updates).length === 0) return;
    await this.db.query('UPDATE levels SET ? WHERE id = ?', [updates, id]);
  }

  async deleteLevel(id) {
    await this.db.query('DELETE FROM levels WHERE id = ?', [id]);
  }

  async levelHasData(id) {
    const [students] = await this.db.query('SELECT COUNT(*) as count FROM students WHERE level_id = ? OR current_level_id = ?', [id, id]);
    const [classes] = await this.db.query('SELECT COUNT(*) as count FROM classes WHERE level_id = ?', [id]);
    return (students[0]?.count > 0) || (classes[0]?.count > 0);
  }

  // ==================== NOTIFICATIONS ====================
  async getNotifications(userId) {
    const [rows] = await this.db.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [userId]
    );
    return rows;
  }

  async getUnreadCount(userId) {
    const [rows] = await this.db.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
      [userId]
    );
    return rows[0]?.count || 0;
  }

  async createNotification(userId, title, message, type = 'info', link = null) {
    const [result] = await this.db.query(
      'INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?)',
      [userId, title, message, type, link]
    );
    return { id: result.insertId };
  }

  async markNotificationRead(id) {
    await this.db.query('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);
  }

  async markAllNotificationsRead(userId) {
    await this.db.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [userId]);
  }
}

export default new CommonModel();