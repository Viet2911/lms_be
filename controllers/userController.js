import UserModel from '../models/UserModel.js';

export const getAll = async (req, res, next) => {
  try {
    const { search, role_id, is_active, page = 1, limit = 20 } = req.query;
    const result = await UserModel.findAllWithRole({ search, roleId: role_id, isActive: is_active, page, limit });
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
};

export const getById = async (req, res, next) => {
  try {
    const user = await UserModel.findByIdWithRole(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User không tồn tại' });
    delete user.password;
    res.json({ success: true, data: user });
  } catch (error) { next(error); }
};

export const getByRole = async (req, res, next) => {
  try {
    const users = await UserModel.findByRole(req.params.role);
    res.json({ success: true, data: users });
  } catch (error) { next(error); }
};

export const getRoles = async (req, res, next) => {
  try {
    const roles = await UserModel.getRoles();
    res.json({ success: true, data: roles });
  } catch (error) { next(error); }
};

export const create = async (req, res, next) => {
  try {
    const { username, email, password, fullName, phone, roleId, branch_ids } = req.body;
    if (!username || !password || !fullName || !roleId) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });
    }

    const user = await UserModel.createUser({
      username, email, password, full_name: fullName, phone, role_id: roleId
    });
    
    // Gán branches cho user
    if (branch_ids && branch_ids.length > 0) {
      await UserModel.assignBranches(user.id, branch_ids);
    }
    
    delete user.password;
    res.status(201).json({ success: true, message: 'Tạo user thành công', data: user });
  } catch (error) { next(error); }
};

export const update = async (req, res, next) => {
  try {
    const { fullName, email, phone, roleId, isActive, branch_ids } = req.body;
    const data = {};
    if (fullName) data.full_name = fullName;
    if (email) data.email = email;
    if (phone !== undefined) data.phone = phone;
    if (roleId) data.role_id = roleId;
    if (isActive !== undefined) data.is_active = isActive;

    await UserModel.update(req.params.id, data);
    
    // Cập nhật branches nếu có
    if (branch_ids !== undefined) {
      await UserModel.assignBranches(req.params.id, branch_ids || []);
    }
    
    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (error) { next(error); }
};

export const resetPassword = async (req, res, next) => {
  try {
    const newPassword = req.body.password || 'Abc@123456';
    await UserModel.updatePassword(req.params.id, newPassword);
    res.json({ success: true, message: 'Reset mật khẩu thành công' });
  } catch (error) { next(error); }
};

export const remove = async (req, res, next) => {
  try {
    await UserModel.update(req.params.id, { is_active: 0 });
    res.json({ success: true, message: 'Xóa user thành công' });
  } catch (error) { next(error); }
};
