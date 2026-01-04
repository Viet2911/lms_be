import UserModel from '../models/UserModel.js';
import emailService from '../services/emailService.js';

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
    const { username, email, password, fullName, full_name, phone, roleId, role_id, branch_ids, sendEmail } = req.body;
    const finalFullName = fullName || full_name;
    const finalRoleId = roleId || role_id;

    if (!username || !password || !finalFullName || !finalRoleId) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });
    }

    const user = await UserModel.createUser({
      username, email, password, full_name: finalFullName, phone, role_id: finalRoleId
    });

    // Gán branches cho user
    if (branch_ids && branch_ids.length > 0) {
      await UserModel.assignBranches(user.id, branch_ids);
    }

    // Gửi email thông tin tài khoản nếu có email và được yêu cầu
    let emailSent = false;
    if (email && sendEmail !== false) {
      try {
        const result = await emailService.sendAccountCreated(
          email,
          finalFullName,
          username,
          password,
          process.env.APP_URL || ''
        );
        emailSent = result.success;
        if (!emailSent) {
          console.log('Email send failed:', result.message);
        }
      } catch (emailError) {
        console.error('Email error:', emailError.message);
      }
    }

    delete user.password;
    res.status(201).json({
      success: true,
      message: emailSent
        ? 'Tạo user thành công và đã gửi email thông tin tài khoản'
        : 'Tạo user thành công' + (email ? ' (Email chưa được gửi - kiểm tra cấu hình SMTP)' : ''),
      data: user,
      emailSent
    });
  } catch (error) { next(error); }
};

export const update = async (req, res, next) => {
  try {
    const { fullName, full_name, email, phone, roleId, role_id, isActive, is_active, branch_ids } = req.body;
    const data = {};
    if (fullName || full_name) data.full_name = fullName || full_name;
    if (email !== undefined) data.email = email;
    if (phone !== undefined) data.phone = phone;
    if (roleId || role_id) data.role_id = roleId || role_id;
    if (isActive !== undefined || is_active !== undefined) data.is_active = isActive ?? is_active;

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
    const { password, sendEmail } = req.body;
    const newPassword = password || 'Abc@123456';
    await UserModel.updatePassword(req.params.id, newPassword);

    // Gửi email thông báo mật khẩu mới nếu được yêu cầu
    let emailSent = false;
    if (sendEmail) {
      const user = await UserModel.findByIdWithRole(req.params.id);
      if (user?.email) {
        try {
          const result = await emailService.sendPasswordReset(user.email, user.full_name, newPassword);
          emailSent = result.success;
        } catch (e) {
          console.error('Email error:', e.message);
        }
      }
    }

    res.json({
      success: true,
      message: emailSent ? 'Reset mật khẩu và gửi email thành công' : 'Reset mật khẩu thành công',
      emailSent
    });
  } catch (error) { next(error); }
};

export const remove = async (req, res, next) => {
  try {
    await UserModel.update(req.params.id, { is_active: 0 });
    res.json({ success: true, message: 'Xóa user thành công' });
  } catch (error) { next(error); }
};