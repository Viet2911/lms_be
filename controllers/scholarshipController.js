// Scholarship Approval Controller
import pool from '../config/database.js';

// Get pending approvals
export const getPendingApprovals = async (req, res, next) => {
    try {
        const [rows] = await pool.query(`
      SELECT sa.*,
             p.name as package_name,
             s.full_name as student_name, s.student_code,
             l.student_name as lead_student_name,
             tr.student_name as trial_student_name,
             u.full_name as requested_by_name,
             b.name as branch_name
      FROM scholarship_approvals sa
      JOIN packages p ON sa.package_id = p.id
      LEFT JOIN students s ON sa.student_id = s.id
      LEFT JOIN leads l ON sa.lead_id = l.id
      LEFT JOIN trial_registrations tr ON sa.trial_id = tr.id
      LEFT JOIN users u ON sa.requested_by = u.id
      LEFT JOIN branches b ON s.branch_id = b.id
      WHERE sa.status = 'pending'
      ORDER BY sa.requested_at DESC
    `);

        res.json({ success: true, data: rows });
    } catch (error) {
        next(error);
    }
};

// Get all approvals with filters
export const getApprovals = async (req, res, next) => {
    try {
        const { status, branch_id } = req.query;

        let sql = `
      SELECT sa.*,
             p.name as package_name,
             COALESCE(s.full_name, l.student_name, tr.student_name) as student_name,
             u.full_name as requested_by_name,
             au.full_name as approved_by_name,
             b.name as branch_name
      FROM scholarship_approvals sa
      JOIN packages p ON sa.package_id = p.id
      LEFT JOIN students s ON sa.student_id = s.id
      LEFT JOIN leads l ON sa.lead_id = l.id
      LEFT JOIN trial_registrations tr ON sa.trial_id = tr.id
      LEFT JOIN users u ON sa.requested_by = u.id
      LEFT JOIN users au ON sa.approved_by = au.id
      LEFT JOIN branches b ON s.branch_id = b.id
      WHERE 1=1
    `;
        const params = [];

        if (status) {
            sql += ' AND sa.status = ?';
            params.push(status);
        }
        if (branch_id) {
            sql += ' AND s.branch_id = ?';
            params.push(branch_id);
        }

        sql += ' ORDER BY sa.requested_at DESC LIMIT 100';

        const [rows] = await pool.query(sql, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        next(error);
    }
};

// Request scholarship approval
export const requestApproval = async (req, res, next) => {
    try {
        const {
            student_id, lead_id, trial_id,
            package_id, requested_months, reason
        } = req.body;

        // Get package default scholarship
        const [pkg] = await pool.query(
            'SELECT default_scholarship_months FROM packages WHERE id = ?',
            [package_id]
        );

        if (!pkg[0]) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy gói học phí' });
        }

        const defaultMonths = pkg[0].default_scholarship_months || 0;
        const extraMonths = requested_months - defaultMonths;

        // If within default, auto-approve
        if (extraMonths <= 0) {
            return res.json({
                success: true,
                data: {
                    auto_approved: true,
                    approved_months: requested_months,
                    message: 'Học bổng trong mức mặc định, không cần duyệt'
                }
            });
        }

        // Create approval request
        const [result] = await pool.query(`
      INSERT INTO scholarship_approvals 
      (student_id, lead_id, trial_id, package_id, default_months, requested_months, extra_months, requested_by, request_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [student_id, lead_id, trial_id, package_id, defaultMonths, requested_months, extraMonths, req.user.id, reason]);

        res.json({
            success: true,
            data: {
                id: result.insertId,
                needs_approval: true,
                extra_months: extraMonths,
                message: `Học bổng vượt ${extraMonths} tháng, đã gửi yêu cầu duyệt`
            }
        });
    } catch (error) {
        next(error);
    }
};

// Approve scholarship
export const approveScholarship = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { note } = req.body;

        // Check if user is GDV/ADMIN
        if (!['GDV', 'ADMIN'].includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Chỉ GDV/ADMIN mới có quyền duyệt học bổng' });
        }

        await pool.query(`
      UPDATE scholarship_approvals 
      SET status = 'approved', approved_by = ?, approved_at = NOW(), approval_note = ?
      WHERE id = ? AND status = 'pending'
    `, [req.user.id, note, id]);

        res.json({ success: true, message: 'Đã duyệt học bổng' });
    } catch (error) {
        next(error);
    }
};

// Reject scholarship
export const rejectScholarship = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { note } = req.body;

        if (!['GDV', 'ADMIN'].includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Chỉ GDV/ADMIN mới có quyền từ chối học bổng' });
        }

        await pool.query(`
      UPDATE scholarship_approvals 
      SET status = 'rejected', approved_by = ?, approved_at = NOW(), approval_note = ?
      WHERE id = ? AND status = 'pending'
    `, [req.user.id, note, id]);

        res.json({ success: true, message: 'Đã từ chối yêu cầu học bổng' });
    } catch (error) {
        next(error);
    }
};

// Check if scholarship needs approval
export const checkScholarship = async (req, res, next) => {
    try {
        const { package_id, months } = req.query;

        const [pkg] = await pool.query(
            'SELECT id, name, default_scholarship_months FROM packages WHERE id = ?',
            [package_id]
        );

        if (!pkg[0]) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy gói' });
        }

        const defaultMonths = pkg[0].default_scholarship_months || 0;
        const requestedMonths = parseInt(months) || 0;
        const needsApproval = requestedMonths > defaultMonths;

        res.json({
            success: true,
            data: {
                package_name: pkg[0].name,
                default_months: defaultMonths,
                requested_months: requestedMonths,
                extra_months: Math.max(0, requestedMonths - defaultMonths),
                needs_approval: needsApproval
            }
        });
    } catch (error) {
        next(error);
    }
};