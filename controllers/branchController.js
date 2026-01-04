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
    const { code, name, address, phone, email, manager_name, bank_code, bank_account, bank_name } = req.body;

    if (!code || !name) {
      return res.status(400).json({ success: false, message: 'Mã và tên cơ sở là bắt buộc' });
    }

    // Build data object với only có các field có giá trị
    const data = { code, name };
    if (address) data.address = address;
    if (phone) data.phone = phone;
    if (email) data.email = email;
    if (manager_name) data.manager_name = manager_name;
    if (bank_code) data.bank_code = bank_code;
    if (bank_account) data.bank_account = bank_account;
    if (bank_name) data.bank_name = bank_name;

    const result = await BranchModel.create(data);
    res.status(201).json({ success: true, data: { id: result.id }, message: 'Tạo cơ sở thành công' });
  } catch (error) {
    console.error('Branch create error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/branches/:id (Admin only)
export const update = async (req, res) => {
  try {
    const { code, name, address, phone, email, manager_name, is_active, bank_code, bank_account, bank_name } = req.body;

    // Build data object với only các field được gửi lên
    const data = {};
    if (code !== undefined) data.code = code;
    if (name !== undefined) data.name = name;
    if (address !== undefined) data.address = address;
    if (phone !== undefined) data.phone = phone;
    if (email !== undefined) data.email = email;
    if (manager_name !== undefined) data.manager_name = manager_name;
    if (is_active !== undefined) data.is_active = is_active;
    if (bank_code !== undefined) data.bank_code = bank_code;
    if (bank_account !== undefined) data.bank_account = bank_account;
    if (bank_name !== undefined) data.bank_name = bank_name;

    await BranchModel.update(req.params.id, data);
    res.json({ success: true, message: 'Cập nhật cơ sở thành công' });
  } catch (error) {
    console.error('Branch update error:', error);
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