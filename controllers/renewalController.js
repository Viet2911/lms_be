import RenewalModel from '../models/RenewalModel.js';
import { getBranchFilter } from '../utils/branchHelper.js';

// Lấy danh sách học sinh cần tái phí
export const getStudentsForRenewal = async (req, res, next) => {
    try {
        const { month, branch_id, class_id } = req.query;
        const currentMonth = month || new Date().toISOString().slice(0, 7);
        const branchId = branch_id || getBranchFilter(req);

        const result = await RenewalModel.getStudentsForRenewal(currentMonth, branchId, class_id);

        res.json({ success: true, data: result });
    } catch (error) { next(error); }
};

// Tạo renewal mới
export const createRenewal = async (req, res, next) => {
    try {
        const { student_id, package_id, renewal_type, new_class_id, promotion_id, deposit_amount, note } = req.body;

        if (!student_id || !package_id) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });
        }

        const result = await RenewalModel.createRenewal({
            student_id,
            package_id,
            renewal_type,
            new_class_id,
            promotion_id,
            deposit_amount: deposit_amount || 0,
            note,
            created_by: req.user.id
        });

        res.json({ success: true, data: result, message: 'Tái phí thành công' });
    } catch (error) { next(error); }
};

// Lấy lịch sử tái phí của học sinh
export const getRenewalHistory = async (req, res, next) => {
    try {
        const { studentId } = req.params;
        const history = await RenewalModel.getRenewalHistory(studentId);
        res.json({ success: true, data: history });
    } catch (error) { next(error); }
};

// Báo cáo tái phí theo tháng
export const getRenewalReport = async (req, res, next) => {
    try {
        const { month, branch_id } = req.query;
        const currentMonth = month || new Date().toISOString().slice(0, 7);
        const branchId = branch_id || getBranchFilter(req);

        const report = await RenewalModel.getRenewalReport(currentMonth, branchId);
        res.json({ success: true, data: report });
    } catch (error) { next(error); }
};