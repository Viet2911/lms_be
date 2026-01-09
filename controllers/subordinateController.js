// Subordinate Controller - Quản lý nhân sự phụ thuộc
import pool from '../config/database.js';

// Get my subordinates
export const getSubordinates = async (req, res, next) => {
    try {
        const { include_indirect } = req.query;

        let sql;
        const params = [req.user.id];

        if (include_indirect === '1') {
            // Get all subordinates recursively (MySQL 8+)
            sql = `
        WITH RECURSIVE sub AS (
          SELECT id, full_name, email, role, employee_code, is_active, manager_id, 1 as level
          FROM users WHERE manager_id = ?
          UNION ALL
          SELECT u.id, u.full_name, u.email, u.role, u.employee_code, u.is_active, u.manager_id, s.level + 1
          FROM users u
          JOIN sub s ON u.manager_id = s.id
          WHERE s.level < 5
        )
        SELECT * FROM sub ORDER BY level, full_name
      `;
        } else {
            // Get direct subordinates only
            sql = `
        SELECT id, full_name, email, role, employee_code, is_active, manager_id,
               (SELECT COUNT(*) FROM users WHERE manager_id = u.id) as subordinate_count
        FROM users u
        WHERE manager_id = ?
        ORDER BY full_name
      `;
        }

        const [rows] = await pool.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        next(error);
    }
};

// Get subordinate IDs (for filtering in other queries)
export const getSubordinateIds = async (userId, includeIndirect = false) => {
    if (includeIndirect) {
        const [rows] = await pool.query(`
      WITH RECURSIVE sub AS (
        SELECT id FROM users WHERE manager_id = ?
        UNION ALL
        SELECT u.id FROM users u JOIN sub s ON u.manager_id = s.id
      )
      SELECT id FROM sub
    `, [userId]);
        return rows.map(r => r.id);
    } else {
        const [rows] = await pool.query('SELECT id FROM users WHERE manager_id = ?', [userId]);
        return rows.map(r => r.id);
    }
};

// Get revenue summary for subordinates
export const getSubordinateRevenue = async (req, res, next) => {
    try {
        const { from_date, to_date, period } = req.query;

        let dateFrom, dateTo;
        const today = new Date();

        if (period === 'month') {
            dateFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
            dateTo = today.toISOString().split('T')[0];
        } else if (period === 'week') {
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - today.getDay() + 1);
            dateFrom = startOfWeek.toISOString().split('T')[0];
            dateTo = today.toISOString().split('T')[0];
        } else {
            dateFrom = from_date || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
            dateTo = to_date || today.toISOString().split('T')[0];
        }

        let userFilter = '';
        const params = [dateFrom, dateTo];

        // Only show subordinates' data unless admin
        if (!['GDV', 'ADMIN'].includes(req.user.role)) {
            userFilter = 'AND r.created_by IN (SELECT id FROM users WHERE manager_id = ?)';
            params.push(req.user.id);
        }

        const [rows] = await pool.query(`
      SELECT 
        u.id as user_id,
        u.full_name,
        u.role,
        COUNT(r.id) as total_transactions,
        SUM(r.amount) as total_revenue,
        SUM(CASE WHEN r.type = 'tuition' THEN r.amount ELSE 0 END) as tuition_revenue,
        SUM(CASE WHEN r.type = 'other' THEN r.amount ELSE 0 END) as other_revenue
      FROM users u
      LEFT JOIN revenues r ON u.id = r.created_by 
        AND r.created_at >= ? AND r.created_at <= DATE_ADD(?, INTERVAL 1 DAY)
      WHERE u.is_active = 1 ${userFilter}
      GROUP BY u.id
      HAVING total_transactions > 0 OR u.manager_id = ?
      ORDER BY total_revenue DESC
    `, [...params, req.user.id]);

        // Get totals
        const totals = {
            total_transactions: rows.reduce((sum, r) => sum + (r.total_transactions || 0), 0),
            total_revenue: rows.reduce((sum, r) => sum + (r.total_revenue || 0), 0),
            tuition_revenue: rows.reduce((sum, r) => sum + (r.tuition_revenue || 0), 0),
            other_revenue: rows.reduce((sum, r) => sum + (r.other_revenue || 0), 0)
        };

        res.json({
            success: true,
            data: rows,
            totals,
            period: { from: dateFrom, to: dateTo }
        });
    } catch (error) {
        next(error);
    }
};

// Get lead/student stats for subordinates
export const getSubordinateStats = async (req, res, next) => {
    try {
        const { period } = req.query;

        let dateFrom;
        const today = new Date();

        if (period === 'month') {
            dateFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
        } else if (period === 'week') {
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - today.getDay() + 1);
            dateFrom = startOfWeek.toISOString().split('T')[0];
        } else {
            dateFrom = `${today.getFullYear()}-01-01`;
        }

        let userFilter = 'WHERE u.is_active = 1';
        const params = [dateFrom, dateFrom, dateFrom];

        if (!['GDV', 'ADMIN'].includes(req.user.role)) {
            userFilter += ' AND u.manager_id = ?';
            params.push(req.user.id);
        }

        const [rows] = await pool.query(`
      SELECT 
        u.id, u.full_name, u.role,
        (SELECT COUNT(*) FROM leads WHERE created_by = u.id AND created_at >= ?) as leads_created,
        (SELECT COUNT(*) FROM leads WHERE created_by = u.id AND status = 'converted' AND updated_at >= ?) as leads_converted,
        (SELECT COUNT(*) FROM trial_registrations WHERE created_by = u.id AND created_at >= ?) as trials_created
      FROM users u
      ${userFilter}
      ORDER BY leads_converted DESC, leads_created DESC
    `, params);

        res.json({ success: true, data: rows });
    } catch (error) {
        next(error);
    }
};

// Set manager for user (admin only)
export const setManager = async (req, res, next) => {
    try {
        const { user_id, manager_id } = req.body;

        // Validate
        if (user_id === manager_id) {
            return res.status(400).json({ success: false, message: 'Không thể tự quản lý chính mình' });
        }

        // Check for circular reference
        if (manager_id) {
            const [manager] = await pool.query('SELECT manager_id FROM users WHERE id = ?', [manager_id]);
            if (manager[0]?.manager_id === user_id) {
                return res.status(400).json({ success: false, message: 'Không thể tạo vòng lặp quản lý' });
            }
        }

        await pool.query('UPDATE users SET manager_id = ? WHERE id = ?', [manager_id || null, user_id]);

        res.json({ success: true, message: 'Cập nhật người quản lý thành công' });
    } catch (error) {
        next(error);
    }
};

// Get available managers (for dropdown)
export const getAvailableManagers = async (req, res, next) => {
    try {
        const { exclude_user_id } = req.query;

        let sql = `
      SELECT id, full_name, role, employee_code
      FROM users 
      WHERE is_active = 1 AND role IN ('GDV', 'ADMIN', 'CHU', 'QLCS', 'OM', 'CM', 'HOEC')
    `;
        const params = [];

        if (exclude_user_id) {
            sql += ' AND id != ?';
            params.push(exclude_user_id);
        }

        sql += ' ORDER BY role, full_name';

        const [rows] = await pool.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        next(error);
    }
};

// Get my team tree
export const getTeamTree = async (req, res, next) => {
    try {
        const userId = req.params.userId || req.user.id;

        // Check permission
        if (userId != req.user.id && !['GDV', 'ADMIN'].includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Không có quyền xem' });
        }

        const [rows] = await pool.query(`
      WITH RECURSIVE team AS (
        SELECT id, full_name, role, manager_id, 0 as level
        FROM users WHERE id = ?
        UNION ALL
        SELECT u.id, u.full_name, u.role, u.manager_id, t.level + 1
        FROM users u
        JOIN team t ON u.manager_id = t.id
        WHERE t.level < 5
      )
      SELECT * FROM team ORDER BY level, full_name
    `, [userId]);

        res.json({ success: true, data: rows });
    } catch (error) {
        next(error);
    }
};