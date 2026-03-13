import db from '../config/database.js';
import { getBranchFilter } from '../utils/branchHelper.js';

const getDateRangeForPeriod = (period) => {
    const now = new Date();
    let start;
    let end;

    switch (period) {
        case 'today': {
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            end = new Date(start);
            end.setDate(start.getDate() + 1);
            break;
        }
        case 'week': {
            start = new Date(now);
            start.setHours(0, 0, 0, 0);
            const day = start.getDay() || 7; // Chủ nhật = 0 -> 7
            start.setDate(start.getDate() - (day - 1)); // về thứ 2
            end = new Date(start);
            end.setDate(start.getDate() + 7);
            break;
        }
        case 'quarter': {
            const quarter = Math.floor(now.getMonth() / 3); // 0-3
            start = new Date(now.getFullYear(), quarter * 3, 1);
            end = new Date(now.getFullYear(), (quarter + 1) * 3, 1);
            break;
        }
        case 'year': {
            start = new Date(now.getFullYear(), 0, 1);
            end = new Date(now.getFullYear() + 1, 0, 1);
            break;
        }
        default: {
            // month
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            break;
        }
    }

    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);
    return { startDate, endDate };
};

export const getSaleReport = async (req, res) => {
    try {
        const { period = 'month', branchId } = req.query;

        const { startDate, endDate } = getDateRangeForPeriod(period);
        const dateFilter = 'l.created_at >= ? AND l.created_at < ?';

        const bf = getBranchFilter(req, branchId, 'l');

        const [stats] = await db.query(
            `SELECT 
        COUNT(*) as leads,
        SUM(CASE WHEN status IN ('scheduled', 'attended', 'waiting', 'trial', 'converted') THEN 1 ELSE 0 END) as scheduled,
        SUM(CASE WHEN status IN ('attended', 'waiting', 'trial', 'converted') THEN 1 ELSE 0 END) as attended,
        SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) as converted
       FROM leads l WHERE ${dateFilter} ${bf.sql}`,
            [startDate, endDate, ...bf.params]
        );

        const data = stats[0] || { leads: 0, scheduled: 0, attended: 0, converted: 0 };
        data.rate = data.attended > 0 ? (data.converted / data.attended * 100) : 0;

        const [byEc] = await db.query(
            `SELECT 
        u.id, u.full_name as ec_name,
        COUNT(*) as leads,
        SUM(CASE WHEN l.status IN ('scheduled', 'attended', 'waiting', 'trial', 'converted') THEN 1 ELSE 0 END) as scheduled,
        SUM(CASE WHEN l.status IN ('attended', 'waiting', 'trial', 'converted') THEN 1 ELSE 0 END) as attended,
        SUM(CASE WHEN l.status = 'converted' THEN 1 ELSE 0 END) as converted
       FROM leads l
       JOIN users u ON l.sale_id = u.id
       WHERE ${dateFilter} ${bf.sql}
       GROUP BY u.id, u.full_name
       ORDER BY converted DESC`,
            [startDate, endDate, ...bf.params]
        );

        byEc.forEach(ec => {
            ec.rate = ec.attended > 0 ? (ec.converted / ec.attended * 100) : 0;
        });

        res.json({ success: true, data: { ...data, byEc } });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


// GET /api/reports/trial
export const getTrialReport = async (req, res) => {
    try {
        const { period = 'month', branchId } = req.query;

        // Giữ semantics cũ: chỉ hỗ trợ week/quarter/month, các giá trị khác coi như month
        const effectivePeriod = ['week', 'quarter'].includes(period) ? period : 'month';
        const { startDate, endDate } = getDateRangeForPeriod(effectivePeriod);
        const dateFilter = 'scheduled_date >= ? AND scheduled_date < ?';

        const bf = getBranchFilter(req, branchId);

        const [stats] = await db.query(
            `SELECT 
        SUM(CASE WHEN status IN ('scheduled', 'attended', 'waiting', 'trial', 'converted') THEN 1 ELSE 0 END) as scheduled,
        SUM(CASE WHEN status IN ('attended', 'waiting', 'trial', 'converted') THEN 1 ELSE 0 END) as attended,
        SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) as no_show
       FROM leads WHERE scheduled_date IS NOT NULL AND ${dateFilter} ${bf.sql}`,
            [startDate, endDate, ...bf.params]
        );

        const data = stats[0] || { scheduled: 0, attended: 0, no_show: 0 };
        const total = (parseInt(data.attended) || 0) + (parseInt(data.no_show) || 0);
        data.rate = total > 0 ? ((data.attended || 0) / total * 100) : 0;

        const [details] = await db.query(
            `SELECT 
        scheduled_date as date,
        SUM(CASE WHEN status IN ('scheduled', 'attended', 'waiting', 'trial', 'converted') THEN 1 ELSE 0 END) as scheduled,
        SUM(CASE WHEN status IN ('attended', 'waiting', 'trial', 'converted') THEN 1 ELSE 0 END) as attended,
        SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) as no_show
       FROM leads WHERE scheduled_date IS NOT NULL AND ${dateFilter} ${bf.sql}
       GROUP BY scheduled_date ORDER BY scheduled_date`,
            [startDate, endDate, ...bf.params]
        );

        details.forEach(d => {
            const t = (parseInt(d.attended) || 0) + (parseInt(d.no_show) || 0);
            d.rate = t > 0 ? ((d.attended || 0) / t * 100) : 0;
        });

        res.json({ success: true, data: { ...data, details } });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


// GET /api/reports/kpi
export const getKPIReport = async (req, res) => {
    try {
        const { month, year, branchId } = req.query;
        const m = parseInt(month) || new Date().getMonth() + 1;
        const y = parseInt(year) || new Date().getFullYear();

        const bf = getBranchFilter(req, branchId, 'l');

        const monthStart = new Date(y, m - 1, 1);
        const monthEnd = new Date(y, m, 1);
        const startDate = monthStart.toISOString().slice(0, 10);
        const endDate = monthEnd.toISOString().slice(0, 10);

        const [rows] = await db.query(
            `SELECT 
        u.id, u.full_name as user_name, r.name as role_name,
        10 as target,
        COUNT(CASE WHEN l.status = 'converted' THEN 1 END) as actual
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       LEFT JOIN leads l ON l.sale_id = u.id 
         AND l.converted_at >= ? 
         AND l.converted_at < ?
         ${bf.sql}
       WHERE r.name IN ('EC', 'SALE', 'HOEC')
       GROUP BY u.id, u.full_name, r.name
       ORDER BY actual DESC`,
            [startDate, endDate, ...bf.params]
        );

        res.json({ success: true, data: rows });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


// GET /api/reports/my-kpi
export const getMyKPI = async (req, res) => {
    try {
        const userId = req.user.id;
        const { month, year } = req.query;
        const m = parseInt(month) || new Date().getMonth() + 1;
        const y = parseInt(year) || new Date().getFullYear();

        const monthStart = new Date(y, m - 1, 1);
        const monthEnd = new Date(y, m, 1);
        const startDate = monthStart.toISOString().slice(0, 10);
        const endDate = monthEnd.toISOString().slice(0, 10);

        const [actualRow] = await db.query(`
      SELECT COUNT(*) as actual FROM leads
      WHERE sale_id = ? AND status = 'converted'
        AND converted_at >= ? AND converted_at < ?
    `, [userId, startDate, endDate]);

        const [details] = await db.query(`
      SELECT l.id, l.student_name, l.converted_at, s.id as student_id, p.name as package_name
      FROM leads l
      LEFT JOIN students s ON l.converted_student_id = s.id
      LEFT JOIN packages p ON s.package_id = p.id
      WHERE l.sale_id = ? AND l.status = 'converted'
        AND l.converted_at >= ? AND l.converted_at < ?
      ORDER BY l.converted_at DESC
    `, [userId, startDate, endDate]);

        res.json({
            success: true,
            data: {
                target: 10,
                actual: actualRow[0] ? actualRow[0].actual : 0,
                details
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
