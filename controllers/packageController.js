import PackageModel from '../models/PackageModel.js';
import { getBranchFilter } from '../utils/branchHelper.js';

// Lấy tất cả packages
export const getAll = async (req, res, next) => {
  try {
    const branchId = getBranchFilter(req);
    const packages = await PackageModel.findAllWithBranchPrice(branchId);
    res.json({ success: true, data: packages });
  } catch (error) { next(error); }
};

// Lấy package theo ID
export const getById = async (req, res, next) => {
  try {
    const pkg = await PackageModel.findById(req.params.id);
    if (!pkg) {
      return res.status(404).json({ success: false, message: 'Gói học không tồn tại' });
    }
    res.json({ success: true, data: pkg });
  } catch (error) { next(error); }
};

// Tạo package mới
export const create = async (req, res, next) => {
  try {
    const { name, code, months, sessions_count, base_price, description, default_scholarship_months } = req.body;

    if (!name || !code || !months || !sessions_count) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });
    }

    const result = await PackageModel.create({
      name, code, months, sessions_count,
      base_price: base_price || 0,
      description,
      default_scholarship_months: default_scholarship_months || 0
    });

    res.status(201).json({
      success: true,
      message: 'Tạo gói học thành công',
      data: { id: result.insertId }
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: 'Mã gói học đã tồn tại' });
    }
    next(error);
  }
};

// Cập nhật package
export const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, code, months, sessions_count, base_price, description, is_active, default_scholarship_months } = req.body;

    const pkg = await PackageModel.findById(id);
    if (!pkg) {
      return res.status(404).json({ success: false, message: 'Gói học không tồn tại' });
    }

    await PackageModel.update(id, {
      name, code, months, sessions_count, base_price, description, is_active,
      default_scholarship_months: default_scholarship_months || 0
    });

    res.json({ success: true, message: 'Cập nhật gói học thành công' });
  } catch (error) { next(error); }
};

// Xóa package
export const remove = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Kiểm tra có học viên đang dùng không
    const [students] = await PackageModel.db.query(
      'SELECT COUNT(*) as count FROM students WHERE package_id = ?',
      [id]
    );

    if (students[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `Không thể xóa. Có ${students[0].count} học viên đang sử dụng gói này`
      });
    }

    await PackageModel.delete(id);
    res.json({ success: true, message: 'Xóa gói học thành công' });
  } catch (error) { next(error); }
};

// Lấy giá theo branch
export const getBranchPrices = async (req, res, next) => {
  try {
    const prices = await PackageModel.getAllBranchPrices();
    res.json({ success: true, data: prices });
  } catch (error) { next(error); }
};

// Set giá cho branch
export const setBranchPrice = async (req, res, next) => {
  try {
    const { package_id, branch_id, price } = req.body;

    if (!package_id || !branch_id || price === undefined) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin' });
    }

    await PackageModel.setBranchPrice(package_id, branch_id, price);
    res.json({ success: true, message: 'Cập nhật giá thành công' });
  } catch (error) { next(error); }
};

// Bulk set prices cho branch
export const bulkSetBranchPrices = async (req, res, next) => {
  try {
    const { branch_id, prices } = req.body;

    if (!branch_id || !prices || !Array.isArray(prices)) {
      return res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ' });
    }

    for (const item of prices) {
      await PackageModel.setBranchPrice(item.package_id, branch_id, item.price);
    }

    res.json({ success: true, message: `Đã cập nhật ${prices.length} giá` });
  } catch (error) { next(error); }
};

// Tính toán buổi học với học bổng
export const calculateSessions = async (req, res, next) => {
  try {
    const { package_id, branch_id, scholarship_months } = req.query;

    const pkg = await PackageModel.findById(package_id);
    if (!pkg) {
      return res.status(404).json({ success: false, message: 'Gói học không tồn tại' });
    }

    const price = await PackageModel.getPriceForBranch(package_id, branch_id);
    const scholarshipSessions = (scholarship_months || 0) * 4;
    const totalSessions = pkg.sessions_count + scholarshipSessions;

    res.json({
      success: true,
      data: {
        package_sessions: pkg.sessions_count,
        scholarship_months: +scholarship_months || 0,
        scholarship_sessions: scholarshipSessions,
        total_sessions: totalSessions,
        price: price
      }
    });
  } catch (error) { next(error); }
};