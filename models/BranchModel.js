import BaseModel from './BaseModel.js';

class BranchModel extends BaseModel {
  constructor() {
    super('branches');
  }

  async findAllActive() {
    const [rows] = await this.db.query(
      'SELECT * FROM branches WHERE is_active = 1 ORDER BY id'
    );
    return rows;
  }

  async getUserBranches(userId) {
    const [rows] = await this.db.query(
      `SELECT b.*, ub.is_primary
       FROM branches b
       JOIN user_branches ub ON b.id = ub.branch_id
       WHERE ub.user_id = ? AND b.is_active = 1
       ORDER BY ub.is_primary DESC, b.name`,
      [userId]
    );
    return rows;
  }

  async setUserBranches(userId, branchIds, primaryBranchId) {
    const conn = await this.db.getConnection();
    try {
      await conn.beginTransaction();
      
      // Xóa tất cả branch cũ
      await conn.query('DELETE FROM user_branches WHERE user_id = ?', [userId]);
      
      // Thêm branch mới
      for (const branchId of branchIds) {
        await conn.query(
          'INSERT INTO user_branches (user_id, branch_id, is_primary) VALUES (?, ?, ?)',
          [userId, branchId, branchId === primaryBranchId ? 1 : 0]
        );
      }
      
      await conn.commit();
      return { success: true };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async getStats() {
    const [rows] = await this.db.query('SELECT * FROM v_branch_stats');
    return rows;
  }
}

export default new BranchModel();
