// User Checkin Controller - Quản lý checkin nhân sự
import pool from '../config/database.js';

// Get checkins with filters
export const getCheckins = async (req, res, next) => {
    try {
        const { user_id, branch_id, from_date, to_date, period } = req.query;

        let dateFrom, dateTo;
        const today = new Date();

        // Calculate date range based on period
        if (period === 'today') {
            dateFrom = dateTo = today.toISOString().split('T')[0];
        } else if (period === 'week') {
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - today.getDay() + 1); // Monday
            dateFrom = startOfWeek.toISOString().split('T')[0];
            dateTo = today.toISOString().split('T')[0];
        } else if (period === 'month') {
            dateFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
            dateTo = today.toISOString().split('T')[0];
        } else {
            dateFrom = from_date;
            dateTo = to_date;
        }

        let sql = `
      SELECT uc.*, u.full_name, u.role, u.employee_code, b.name as branch_name
      FROM user_checkins uc
      JOIN users u ON uc.user_id = u.id
      LEFT JOIN branches b ON uc.branch_id = b.id
      WHERE 1=1
    `;
        const params = [];

        // Filter by manager's subordinates
        if (!['GDV', 'ADMIN'].includes(req.user.role)) {
            sql += ` AND (uc.user_id = ? OR uc.user_id IN (
        SELECT id FROM users WHERE manager_id = ?
      ))`;
            params.push(req.user.id, req.user.id);
        }

        if (user_id) {
            sql += ' AND uc.user_id = ?';
            params.push(user_id);
        }
        if (branch_id) {
            sql += ' AND uc.branch_id = ?';
            params.push(branch_id);
        }
        if (dateFrom) {
            sql += ' AND uc.checkin_date >= ?';
            params.push(dateFrom);
        }
        if (dateTo) {
            sql += ' AND uc.checkin_date <= ?';
            params.push(dateTo);
        }

        sql += ' ORDER BY uc.checkin_date DESC, uc.checkin_time DESC';

        const [rows] = await pool.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        next(error);
    }
};

// Checkin
export const checkin = async (req, res, next) => {
    try {
        const { branch_id, note } = req.body;
        const today = new Date().toISOString().split('T')[0];
        const now = new Date().toTimeString().split(' ')[0];

        // Check if already checked in today
        const [existing] = await pool.query(
            'SELECT id, checkin_time FROM user_checkins WHERE user_id = ? AND checkin_date = ?',
            [req.user.id, today]
        );

        if (existing[0]) {
            return res.status(400).json({
                success: false,
                message: 'Bạn đã checkin hôm nay lúc ' + existing[0].checkin_time
            });
        }

        const [result] = await pool.query(`
      INSERT INTO user_checkins (user_id, branch_id, checkin_date, checkin_time, note)
      VALUES (?, ?, ?, ?, ?)
    `, [req.user.id, branch_id, today, now, note]);

        res.json({
            success: true,
            message: 'Checkin thành công lúc ' + now,
            data: { id: result.insertId, checkin_time: now }
        });
    } catch (error) {
        next(error);
    }
};

// Checkout
export const checkout = async (req, res, next) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const now = new Date().toTimeString().split(' ')[0];

        const [existing] = await pool.query(
            'SELECT id, checkin_time, checkout_time FROM user_checkins WHERE user_id = ? AND checkin_date = ?',
            [req.user.id, today]
        );

        if (!existing[0]) {
            return res.status(400).json({ success: false, message: 'Bạn chưa checkin hôm nay' });
        }

        if (existing[0].checkout_time) {
            return res.status(400).json({
                success: false,
                message: 'Bạn đã checkout lúc ' + existing[0].checkout_time
            });
        }

        await pool.query(
            'UPDATE user_checkins SET checkout_time = ? WHERE id = ?',
            [now, existing[0].id]
        );

        res.json({ success: true, message: 'Checkout thành công lúc ' + now });
    } catch (error) {
        next(error);
    }
};

// Get my checkin status today
export const getMyStatus = async (req, res, next) => {
    try {
        const today = new Date().toISOString().split('T')[0];

        const [rows] = await pool.query(
            'SELECT * FROM user_checkins WHERE user_id = ? AND checkin_date = ?',
            [req.user.id, today]
        );

        res.json({
            success: true,
            data: rows[0] || null,
            today
        });
    } catch (error) {
        next(error);
    }
};

// Get checkin summary for subordinates
export const getSubordinateSummary = async (req, res, next) => {
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
            dateFrom = from_date || today.toISOString().split('T')[0];
            dateTo = to_date || today.toISOString().split('T')[0];
        }

        let userFilter = '';
        const params = [dateFrom, dateTo];

        if (!['GDV', 'ADMIN'].includes(req.user.role)) {
            userFilter = 'AND u.manager_id = ?';
            params.push(req.user.id);
        }

        const [rows] = await pool.query(`
      SELECT 
        u.id, u.full_name, u.role, u.employee_code,
        COUNT(uc.id) as total_days,
        SUM(CASE WHEN uc.checkout_time IS NOT NULL THEN uc.work_hours ELSE 0 END) as total_hours,
        AVG(CASE WHEN uc.checkout_time IS NOT NULL THEN uc.work_hours ELSE NULL END) as avg_hours
      FROM users u
      LEFT JOIN user_checkins uc ON u.id = uc.user_id 
        AND uc.checkin_date >= ? AND uc.checkin_date <= ?
      WHERE u.is_active = 1 ${userFilter}
      GROUP BY u.id
      ORDER BY u.full_name
    `, params);

        res.json({
            success: true,
            data: rows,
            period: { from: dateFrom, to: dateTo }
        });
    } catch (error) {
        next(error);
    }
};

// Export checkins to Excel
export const exportCheckins = async (req, res, next) => {
    try {
        const { from_date, to_date, period, user_id, branch_id } = req.query;

        let dateFrom, dateTo;
        const today = new Date();

        if (period === 'today') {
            dateFrom = dateTo = today.toISOString().split('T')[0];
        } else if (period === 'week') {
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - today.getDay() + 1);
            dateFrom = startOfWeek.toISOString().split('T')[0];
            dateTo = today.toISOString().split('T')[0];
        } else if (period === 'month') {
            dateFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
            dateTo = today.toISOString().split('T')[0];
        } else {
            dateFrom = from_date;
            dateTo = to_date;
        }

        let sql = `
      SELECT uc.*, u.full_name, u.role, u.employee_code, b.name as branch_name
      FROM user_checkins uc
      JOIN users u ON uc.user_id = u.id
      LEFT JOIN branches b ON uc.branch_id = b.id
      WHERE 1=1
    `;
        const params = [];

        // Filter by manager's subordinates
        if (!['GDV', 'ADMIN'].includes(req.user.role)) {
            sql += ` AND (uc.user_id = ? OR uc.user_id IN (SELECT id FROM users WHERE manager_id = ?))`;
            params.push(req.user.id, req.user.id);
        }

        if (user_id) {
            sql += ' AND uc.user_id = ?';
            params.push(user_id);
        }
        if (branch_id) {
            sql += ' AND uc.branch_id = ?';
            params.push(branch_id);
        }
        if (dateFrom) {
            sql += ' AND uc.checkin_date >= ?';
            params.push(dateFrom);
        }
        if (dateTo) {
            sql += ' AND uc.checkin_date <= ?';
            params.push(dateTo);
        }

        sql += ' ORDER BY uc.checkin_date DESC, u.full_name';

        const [rows] = await pool.query(sql, params);

        // Create CSV content
        const headers = ['Ngày', 'Mã NV', 'Họ tên', 'Vai trò', 'Cơ sở', 'Giờ vào', 'Giờ ra', 'Số giờ', 'Ghi chú'];
        const csvRows = [headers.join(',')];

        rows.forEach(row => {
            const values = [
                row.checkin_date || '',
                row.employee_code || '',
                `"${(row.full_name || '').replace(/"/g, '""')}"`,
                row.role || '',
                `"${(row.branch_name || '').replace(/"/g, '""')}"`,
                row.checkin_time?.substring(0, 5) || '',
                row.checkout_time?.substring(0, 5) || '',
                row.work_hours ? row.work_hours.toFixed(1) : '',
                `"${(row.note || '').replace(/"/g, '""')}"`
            ];
            csvRows.push(values.join(','));
        });

        const csvContent = '\uFEFF' + csvRows.join('\n'); // BOM for Excel UTF-8

        // Set response headers
        const filename = `Checkin_${dateFrom}_${dateTo}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        res.send(csvContent);
    } catch (error) {
        next(error);
    }
};

// Admin: Add/Edit checkin for user
export const adminCheckin = async (req, res, next) => {
    try {
        const { user_id, checkin_date, checkin_time, checkout_time, branch_id, note } = req.body;

        // Check permission
        if (!['GDV', 'ADMIN', 'QLCS', 'CHU'].includes(req.user.role)) {
            // Check if target user is subordinate
            const [user] = await pool.query('SELECT manager_id FROM users WHERE id = ?', [user_id]);
            if (!user[0] || user[0].manager_id !== req.user.id) {
                return res.status(403).json({ success: false, message: 'Không có quyền chỉnh sửa checkin của nhân viên này' });
            }
        }

        const [existing] = await pool.query(
            'SELECT id FROM user_checkins WHERE user_id = ? AND checkin_date = ?',
            [user_id, checkin_date]
        );

        if (existing[0]) {
            await pool.query(`
        UPDATE user_checkins 
        SET checkin_time = ?, checkout_time = ?, branch_id = ?, note = ?
        WHERE id = ?
      `, [checkin_time, checkout_time, branch_id, note, existing[0].id]);
        } else {
            await pool.query(`
        INSERT INTO user_checkins (user_id, checkin_date, checkin_time, checkout_time, branch_id, note)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [user_id, checkin_date, checkin_time, checkout_time, branch_id, note]);
        }

        res.json({ success: true, message: 'Cập nhật checkin thành công' });
    } catch (error) {
        next(error);
    }
};

// Get checkin report with summary
export const getReport = async (req, res, next) => {
    try {
        const { start_date, end_date, branch_id, role, search, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let sql = `
      SELECT 
        uc.id, uc.checkin_date, uc.checkin_time, uc.checkout_time, uc.note,
        u.id as user_id, u.full_name, u.username as employee_code, 
        r.name as role_name,
        b.name as branch_name,
        TIMESTAMPDIFF(MINUTE, 
          CONCAT(uc.checkin_date, ' ', uc.checkin_time), 
          CONCAT(uc.checkin_date, ' ', IFNULL(uc.checkout_time, uc.checkin_time))
        ) / 60.0 as total_hours,
        CASE 
          WHEN uc.checkin_time IS NULL THEN 'absent'
          WHEN TIME(uc.checkin_time) <= '08:30:00' THEN 'on_time'
          ELSE 'late'
        END as status
      FROM user_checkins uc
      JOIN users u ON uc.user_id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
      LEFT JOIN branches b ON uc.branch_id = b.id
      WHERE 1=1
    `;
        const params = [];

        // Date range filter
        if (start_date) {
            sql += ' AND uc.checkin_date >= ?';
            params.push(start_date);
        }
        if (end_date) {
            sql += ' AND uc.checkin_date <= ?';
            params.push(end_date);
        }
        if (branch_id) {
            sql += ' AND uc.branch_id = ?';
            params.push(branch_id);
        }
        if (role) {
            sql += ' AND r.name = ?';
            params.push(role);
        }
        if (search) {
            sql += ' AND (u.full_name LIKE ? OR u.username LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        // Permission check - only see own data or subordinates
        if (!['GDV', 'ADMIN'].includes(req.user.role)) {
            sql += ` AND (uc.user_id = ? OR uc.user_id IN (SELECT id FROM users WHERE manager_id = ?))`;
            params.push(req.user.id, req.user.id);
        }

        // Count total
        const countSql = sql.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
        const [countResult] = await pool.query(countSql, params);
        const total = countResult[0]?.total || 0;

        // Add pagination
        sql += ' ORDER BY uc.checkin_date DESC, uc.checkin_time DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const [rows] = await pool.query(sql, params);

        // Calculate summary
        let summarySql = `
      SELECT 
        COUNT(DISTINCT uc.user_id) as checked_in,
        SUM(CASE WHEN TIME(uc.checkin_time) <= '08:30:00' THEN 1 ELSE 0 END) as on_time,
        SUM(CASE WHEN TIME(uc.checkin_time) > '08:30:00' THEN 1 ELSE 0 END) as late,
        SUM(TIMESTAMPDIFF(MINUTE, 
          CONCAT(uc.checkin_date, ' ', uc.checkin_time), 
          CONCAT(uc.checkin_date, ' ', IFNULL(uc.checkout_time, uc.checkin_time))
        ) / 60.0) as total_hours
      FROM user_checkins uc
      JOIN users u ON uc.user_id = u.id
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE uc.checkin_date >= ? AND uc.checkin_date <= ?
    `;
        const summaryParams = [start_date || '2000-01-01', end_date || '2099-12-31'];
        if (branch_id) {
            summarySql += ' AND uc.branch_id = ?';
            summaryParams.push(branch_id);
        }
        if (role) {
            summarySql += ' AND r.name = ?';
            summaryParams.push(role);
        }

        const [summaryResult] = await pool.query(summarySql, summaryParams);

        // Get total staff count
        let staffSql = `
      SELECT COUNT(*) as total FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.is_active = 1
    `;
        const staffParams = [];
        if (branch_id) {
            staffSql += ' AND u.id IN (SELECT user_id FROM user_branches WHERE branch_id = ?)';
            staffParams.push(branch_id);
        }
        if (role) {
            staffSql += ' AND r.name = ?';
            staffParams.push(role);
        }
        const [staffResult] = await pool.query(staffSql, staffParams);

        const summary = {
            total_staff: staffResult[0]?.total || 0,
            checked_in: summaryResult[0]?.checked_in || 0,
            on_time: summaryResult[0]?.on_time || 0,
            late: summaryResult[0]?.late || 0,
            absent: Math.max(0, (staffResult[0]?.total || 0) - (summaryResult[0]?.checked_in || 0)),
            total_hours: summaryResult[0]?.total_hours || 0
        };

        res.json({
            success: true,
            data: rows,
            summary,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        next(error);
    }
};