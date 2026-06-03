import BaseModel from './BaseModel.js';
import bcrypt from 'bcryptjs';

class UserModel extends BaseModel {
  constructor() {
    super('users');
  }

  async findAllWithRole({ search, roleId, isActive, branchId, page = 1, limit = 20 } = {}) {
    let sql = `
      SELECT u.id, u.username, u.email, u.full_name, u.phone, u.is_active, u.created_at, u.manager_id,
             r.id as role_id, r.name as role_name, r.display_name as role_display, r.is_system_wide,
             m.full_name as manager_name,
             STRING_AGG(b.name, ', ' ORDER BY ub.is_primary DESC, b.name) as branches,
             STRING_AGG(b.id::text, ',' ORDER BY ub.is_primary DESC, b.id::text) as branch_ids
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN users m ON u.manager_id = m.id
      LEFT JOIN user_branches ub ON u.id = ub.user_id
      LEFT JOIN branches b ON ub.branch_id = b.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      sql += ' AND (u.full_name ILIKE ? OR u.username ILIKE ? OR u.email ILIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (roleId) { sql += ' AND u.role_id = ?'; params.push(roleId); }
    if (isActive !== undefined) { sql += ' AND u.is_active = ?'; params.push(isActive == '1' || isActive === true || isActive === 1); }
    if (branchId) {
      sql += ' AND (r.is_system_wide = true OR ub.branch_id = ?)';
      params.push(branchId);
    }

    sql += ' GROUP BY u.id, u.username, u.email, u.full_name, u.phone, u.is_active, u.created_at, u.manager_id, r.id, r.name, r.display_name, r.is_system_wide, m.full_name';

    const countSql = `SELECT COUNT(DISTINCT u.id) as total FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN user_branches ub ON u.id = ub.user_id
      WHERE 1=1` +
      (search ? ' AND (u.full_name ILIKE ? OR u.username ILIKE ? OR u.email ILIKE ?)' : '') +
      (roleId ? ' AND u.role_id = ?' : '') +
      (isActive !== undefined ? ' AND u.is_active = ?' : '') +
      (branchId ? ' AND (r.is_system_wide = true OR ub.branch_id = ?)' : '');

    const [countRows] = await this.db.query(countSql, params.slice(0, params.length));
    const total = parseInt(countRows[0]?.total || 0);

    sql += ' ORDER BY u.created_at DESC LIMIT ? OFFSET ?';
    params.push(+limit, (+page - 1) * +limit);
    const [rows] = await this.db.query(sql, params);

    return { data: rows, pagination: { page: +page, limit: +limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async findByCredentials(username) {
    const [rows] = await this.db.query(
      `SELECT u.*, r.name as role_name, r.is_system_wide FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       WHERE (u.username = ? OR u.email = ?) AND u.is_active = true`,
      [username, username]
    );
    if (rows.length === 0) return null;

    const user = rows[0];

    if (user.is_system_wide) {
      const [allBranches] = await this.db.query(
        `SELECT id, code, name, false as is_primary FROM branches WHERE is_active = true ORDER BY name`
      );
      user.branches = allBranches;
      user.primaryBranch = allBranches[0] || null;
    } else {
      const [branches] = await this.db.query(
        `SELECT b.id, b.code, b.name, ub.is_primary
         FROM branches b
         JOIN user_branches ub ON b.id = ub.branch_id
         WHERE ub.user_id = ? AND b.is_active = true
         ORDER BY ub.is_primary DESC`,
        [user.id]
      );
      user.branches = branches;
      user.primaryBranch = branches.find(b => b.is_primary) || branches[0] || null;
    }

    return user;
  }

  async findByIdWithRole(id) {
    const [rows] = await this.db.query(
      `SELECT u.*, r.name as role_name, r.display_name as role_display, r.is_system_wide,
              m.full_name as manager_name
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN users m ON u.manager_id = m.id
       WHERE u.id = ?`,
      [id]
    );
    if (rows.length === 0) return null;

    const user = rows[0];

    if (user.is_system_wide) {
      const [allBranches] = await this.db.query(
        `SELECT id, code, name, false as is_primary FROM branches WHERE is_active = true ORDER BY name`
      );
      user.branches = allBranches;
      user.branch_ids = allBranches.map(b => b.id);
    } else {
      const [branches] = await this.db.query(
        `SELECT b.id, b.code, b.name, ub.is_primary
         FROM branches b
         JOIN user_branches ub ON b.id = ub.branch_id
         WHERE ub.user_id = ? AND b.is_active = true
         ORDER BY ub.is_primary DESC`,
        [id]
      );
      user.branches = branches;
      user.branch_ids = branches.map(b => b.id);
    }

    return user;
  }

  async findByRole(roleName, branchId = null) {
    let sql = `
      SELECT DISTINCT u.id, u.full_name, u.email FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN user_branches ub ON u.id = ub.user_id
      WHERE r.name = ? AND u.is_active = true
    `;
    const params = [roleName];

    if (branchId) {
      sql += ' AND (r.is_system_wide = true OR ub.branch_id = ?)';
      params.push(branchId);
    }

    sql += ' ORDER BY u.full_name';
    const [rows] = await this.db.query(sql, params);
    return rows;
  }

  async createUser(data) {
    const { branch_ids, ...userData } = data;
    const hash = await bcrypt.hash(userData.password, 10);
    const result = await this.create({ ...userData, password: hash });

    if (branch_ids && branch_ids.length > 0) {
      for (let i = 0; i < branch_ids.length; i++) {
        await this.db.query(
          'INSERT INTO user_branches (user_id, branch_id, is_primary) VALUES (?, ?, ?)',
          [result.id, branch_ids[i], i === 0 ? true : false]
        );
      }
    }

    return result;
  }

  async updateUser(id, data) {
    const { branch_ids, ...userData } = data;

    if (Object.keys(userData).length > 0) {
      await this.update(id, userData);
    }

    if (branch_ids !== undefined) {
      await this.db.query('DELETE FROM user_branches WHERE user_id = ?', [id]);
      for (let i = 0; i < branch_ids.length; i++) {
        await this.db.query(
          'INSERT INTO user_branches (user_id, branch_id, is_primary) VALUES (?, ?, ?)',
          [id, branch_ids[i], i === 0 ? true : false]
        );
      }
    }

    return { success: true };
  }

  async verifyPassword(plain, hashed) {
    return bcrypt.compare(plain, hashed);
  }

  async updatePassword(id, newPassword) {
    const hash = await bcrypt.hash(newPassword, 10);
    return this.update(id, { password: hash });
  }

  async getPermissions(roleId) {
    const [rows] = await this.db.query(
      `SELECT p.name FROM permissions p
       JOIN role_permissions rp ON p.id = rp.permission_id
       WHERE rp.role_id = ?`,
      [roleId]
    );
    return rows.map(r => r.name);
  }

  async getRoles() {
    const [rows] = await this.db.query('SELECT * FROM roles ORDER BY id');
    return rows;
  }

  async getManagers() {
    const [rows] = await this.db.query(`
      SELECT u.id, u.full_name, u.username, r.name as role_name, r.display_name as role_display
      FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.is_active = true
        AND r.name IN ('GDV', 'BM', 'QLCS', 'HOEC', 'OM', 'CM', 'HOCM', 'RIOM', 'ADMIN')
      ORDER BY
        CASE r.name
          WHEN 'ADMIN' THEN 1 WHEN 'GDV' THEN 2 WHEN 'BM' THEN 3
          WHEN 'QLCS' THEN 4 WHEN 'RIOM' THEN 5 WHEN 'HOEC' THEN 6
          WHEN 'HOCM' THEN 7 WHEN 'OM' THEN 8 WHEN 'CM' THEN 9
          ELSE 10
        END, u.full_name
    `);
    return rows;
  }

  async assignBranches(userId, branchIds) {
    await this.db.query('DELETE FROM user_branches WHERE user_id = ?', [userId]);

    if (branchIds && branchIds.length > 0) {
      for (let i = 0; i < branchIds.length; i++) {
        await this.db.query(
          'INSERT INTO user_branches (user_id, branch_id, is_primary) VALUES (?, ?, ?)',
          [userId, branchIds[i], i === 0 ? true : false]
        );
      }
    }
  }

  async canAccessBranch(userId, branchId, isSystemWide = false) {
    if (isSystemWide) return true;

    const [rows] = await this.db.query(
      'SELECT 1 FROM user_branches WHERE user_id = ? AND branch_id = ?',
      [userId, branchId]
    );
    return rows.length > 0;
  }
}

export default new UserModel();
