import SaleReportModel from '../models/SaleReportModel.js';
import KpiModel from '../models/KpiModel.js';
import { getBranchFilter } from '../utils/branchHelper.js';

// Lấy báo cáo của EC hiện tại
export const getMyReport = async (req, res, next) => {
  try {
    const { month } = req.query;
    const currentMonth = month || new Date().toISOString().slice(0, 7);
    
    const report = await SaleReportModel.getByEcAndMonth(req.user.id, currentMonth);
    const kpi = await KpiModel.getByEcAndMonth(req.user.id, currentMonth);
    
    res.json({ success: true, data: { report, kpi } });
  } catch (error) { next(error); }
};

// Lấy tất cả báo cáo theo tháng (HOEC/Admin)
export const getAllReports = async (req, res, next) => {
  try {
    const { month, branch_id } = req.query;
    const currentMonth = month || new Date().toISOString().slice(0, 7);
    const branchId = branch_id || getBranchFilter(req);
    
    // Nếu là HOEC, chỉ lấy EC dưới quyền
    const hoecId = req.user.role_name === 'HOEC' ? req.user.id : null;
    
    const reports = await SaleReportModel.getAllByMonth(currentMonth, branchId, hoecId);
    const summary = await SaleReportModel.getSummaryByMonth(currentMonth, branchId);
    
    res.json({ success: true, data: { reports, summary } });
  } catch (error) { next(error); }
};

// Lấy tổng hợp báo cáo
export const getSummary = async (req, res, next) => {
  try {
    const { month, branch_id } = req.query;
    const currentMonth = month || new Date().toISOString().slice(0, 7);
    const branchId = branch_id || getBranchFilter(req);
    
    const summary = await SaleReportModel.getSummaryByMonth(currentMonth, branchId);
    
    res.json({ success: true, data: summary });
  } catch (error) { next(error); }
};

// Bảng xếp hạng theo doanh thu
export const getRankingRevenue = async (req, res, next) => {
  try {
    const { month, branch_id, limit = 10 } = req.query;
    const currentMonth = month || new Date().toISOString().slice(0, 7);
    const branchId = branch_id || null; // null = all branches
    
    const ranking = await SaleReportModel.getRankingByRevenue(currentMonth, branchId, +limit);
    
    res.json({ success: true, data: ranking });
  } catch (error) { next(error); }
};

// Bảng xếp hạng theo KPI %
export const getRankingKpi = async (req, res, next) => {
  try {
    const { month, branch_id, limit = 10 } = req.query;
    const currentMonth = month || new Date().toISOString().slice(0, 7);
    const branchId = branch_id || null;
    
    const ranking = await SaleReportModel.getRankingByKpi(currentMonth, branchId, +limit);
    
    res.json({ success: true, data: ranking });
  } catch (error) { next(error); }
};

// Tính toán và cập nhật báo cáo (Cron job hoặc manual)
export const calculateReport = async (req, res, next) => {
  try {
    const { ec_id, month } = req.body;
    const currentMonth = month || new Date().toISOString().slice(0, 7);
    
    // Lấy branch của EC
    const [ecRows] = await SaleReportModel.db.query(`
      SELECT ub.branch_id FROM user_branches ub WHERE ub.user_id = ? LIMIT 1
    `, [ec_id]);
    
    if (ecRows.length === 0) {
      return res.status(400).json({ success: false, message: 'EC không có branch' });
    }
    
    const result = await SaleReportModel.calculateAndUpdateReport(
      ec_id, ecRows[0].branch_id, currentMonth
    );
    
    res.json({ success: true, message: 'Cập nhật báo cáo thành công', data: result });
  } catch (error) { next(error); }
};

// Cập nhật báo cáo cho tất cả EC (Batch)
export const calculateAllReports = async (req, res, next) => {
  try {
    const { month } = req.body;
    const currentMonth = month || new Date().toISOString().slice(0, 7);
    
    // Lấy tất cả EC active
    const [ecs] = await SaleReportModel.db.query(`
      SELECT u.id, ub.branch_id
      FROM users u
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN user_branches ub ON u.id = ub.user_id
      WHERE r.name = 'EC' AND u.is_active = 1
    `);
    
    const results = [];
    for (const ec of ecs) {
      if (ec.branch_id) {
        const result = await SaleReportModel.calculateAndUpdateReport(
          ec.id, ec.branch_id, currentMonth
        );
        results.push({ ec_id: ec.id, ...result });
      }
    }
    
    res.json({ success: true, message: `Đã cập nhật ${results.length} báo cáo`, data: results });
  } catch (error) { next(error); }
};

// === KPI Management ===

// Lấy KPI targets theo tháng
export const getKpiTargets = async (req, res, next) => {
  try {
    const { month, branch_id } = req.query;
    const currentMonth = month || new Date().toISOString().slice(0, 7);
    const branchId = branch_id || getBranchFilter(req);
    
    const targets = await KpiModel.getAllByMonth(currentMonth, branchId);
    const missingEcs = await KpiModel.getEcsWithoutKpi(currentMonth, branchId);
    
    res.json({ success: true, data: { targets, missingEcs } });
  } catch (error) { next(error); }
};

// Set KPI cho EC
export const setKpiTarget = async (req, res, next) => {
  try {
    const { ec_id, branch_id, month, target_revenue, target_checkin, target_conversion } = req.body;
    
    if (!ec_id || !month || !target_revenue) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });
    }
    
    const result = await KpiModel.upsertKpi(ec_id, branch_id, month, {
      target_revenue,
      target_checkin: target_checkin || 0,
      target_conversion: target_conversion || 0
    }, req.user.id);
    
    res.json({ success: true, message: 'Cập nhật KPI thành công', data: result });
  } catch (error) { next(error); }
};

// Bulk set KPI
export const bulkSetKpi = async (req, res, next) => {
  try {
    const { targets } = req.body;
    
    if (!targets || !Array.isArray(targets)) {
      return res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ' });
    }
    
    const results = await KpiModel.bulkSetKpi(targets, req.user.id);
    
    res.json({ success: true, message: `Đã cập nhật ${results.length} KPI`, data: results });
  } catch (error) { next(error); }
};
