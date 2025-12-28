import db from '../config/database.js';

class CommonModel {
  constructor() {
    this.db = db;
  }

  async getSubjects() {
    const [rows] = await this.db.query('SELECT * FROM subjects WHERE is_active = 1 ORDER BY name');
    return rows;
  }

  async createSubject(data) {
    const [result] = await this.db.query('INSERT INTO subjects SET ?', [data]);
    return { id: result.insertId, ...data };
  }

  async getLevels(subjectId = null) {
    let sql = 'SELECT * FROM levels WHERE 1=1';
    const params = [];
    if (subjectId) { sql += ' AND subject_id = ?'; params.push(subjectId); }
    sql += ' ORDER BY name';
    const [rows] = await this.db.query(sql, params);
    return rows;
  }

  async createLevel(data) {
    const [result] = await this.db.query('INSERT INTO levels SET ?', [data]);
    return { id: result.insertId, ...data };
  }

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

  async markNotificationRead(id) {
    await this.db.query('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);
  }

  async markAllNotificationsRead(userId) {
    await this.db.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [userId]);
  }
}

export default new CommonModel();
