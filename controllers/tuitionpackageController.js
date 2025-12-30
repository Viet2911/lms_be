import TuitionPackageModel from '../models/TuitionpackageModel.js';
// Lấy tất cả gói học phí
export const getAll = async (req, res, next) => {
    try {
        const { subject_id } = req.query;
        const packages = await TuitionPackageModel.getAll(subject_id);
        res.json({ success: true, data: packages });
    } catch (error) { next(error); }
};

// Lấy gói theo ID
export const getById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const pkg = await TuitionPackageModel.getById(id);
        if (!pkg) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy gói học phí' });
        }
        res.json({ success: true, data: pkg });
    } catch (error) { next(error); }
};

// Tạo gói mới
export const create = async (req, res, next) => {
    try {
        const result = await TuitionPackageModel.create(req.body);
        res.json({ success: true, message: 'Tạo gói học phí thành công', data: { id: result.insertId } });
    } catch (error) { next(error); }
};

// Cập nhật gói
export const update = async (req, res, next) => {
    try {
        const { id } = req.params;
        await TuitionPackageModel.updatePackage(id, req.body);
        res.json({ success: true, message: 'Cập nhật thành công' });
    } catch (error) { next(error); }
};

// Xóa gói
export const remove = async (req, res, next) => {
    try {
        const { id } = req.params;
        await TuitionPackageModel.deletePackage(id);
        res.json({ success: true, message: 'Xóa thành công' });
    } catch (error) { next(error); }
};  