import BranchModel from '../models/BranchModel.js';

// GET /api/branches
export const getAll = async (req, res) => {
  try {
    console.log('GET /branches called');
    const branches = await BranchModel.findAllActive();
    console.log('Branches found:', branches);
    res.json({ success: true, data: branches });
  } catch (error) {
    console.error('Branch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/branches/stats
export const getStats = async (req, res) => {
  try {
    const stats = await BranchModel.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/branches/:id
export const getById = async (req, res) => {
  try {
    const branch = await BranchModel.findById(req.params.id);
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy cơ sở' });
    }
    res.json({ success: true, data: branch });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/branches (Admin only)
export const create = async (req, res) => {
  try {
    const { code, name, address, phone, email, manager_name } = req.body;
    
    if (!code || !name) {
      return res.status(400).json({ success: false, message: 'Mã và tên cơ sở là bắt buộc' });
    }

    const result = await BranchModel.create({ code, name, address, phone, email, manager_name });
    res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Tạo cơ sở thành công' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/branches/:id (Admin only)
export const update = async (req, res) => {
  try {
    const { code, name, address, phone, email, manager_name, is_active } = req.body;
    await BranchModel.update(req.params.id, { code, name, address, phone, email, manager_name, is_active });
    res.json({ success: true, message: 'Cập nhật cơ sở thành công' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/branches/:id (Admin only)
export const remove = async (req, res) => {
  try {
    // Soft delete - set is_active = 0
    await BranchModel.update(req.params.id, { is_active: 0 });
    res.json({ success: true, message: 'Đã vô hiệu hóa cơ sở' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/branches/user/:userId
export const getUserBranches = async (req, res) => {
  try {
    const branches = await BranchModel.getUserBranches(req.params.userId);
    res.json({ success: true, data: branches });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/branches/user/:userId
export const setUserBranches = async (req, res) => {
  try {
    const { branch_ids, primary_branch_id } = req.body;
    
    if (!branch_ids || branch_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Cần chọn ít nhất 1 cơ sở' });
    }

    await BranchModel.setUserBranches(req.params.userId, branch_ids, primary_branch_id || branch_ids[0]);
    res.json({ success: true, message: 'Cập nhật cơ sở cho user thành công' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
