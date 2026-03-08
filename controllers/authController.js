import jwt from 'jsonwebtoken';
import UserModel from '../models/UserModel.js';

export const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập username và password' });
    }

    const user = await UserModel.findByCredentials(username);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Tài khoản không tồn tại hoặc đã bị khóa' });
    }

    const isValid = await UserModel.verifyPassword(password, user.password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Mật khẩu không đúng' });
    }

    const permissions = await UserModel.getPermissions(user.role_id);
    
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ success: false, message: 'Server configuration error' });
    }
    
    const token = jwt.sign(
      { userId: user.id, role: user.role_name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    delete user.password;
    res.json({ success: true, message: 'Đăng nhập thành công', data: { token, user: { ...user, permissions } } });
  } catch (error) { next(error); }
};

export const me = async (req, res, next) => {
  try {
    const user = await UserModel.findByIdWithRole(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User không tồn tại' });

    const permissions = await UserModel.getPermissions(user.role_id);
    delete user.password;
    res.json({ success: true, data: { ...user, permissions } });
  } catch (error) { next(error); }
};

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ thông tin' });
    }

    // Password complexity: ≥8 ký tự, có hoa + thường + số (đồng bộ với validate.js)
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(newPassword)) {
      return res.status(400).json({ success: false, message: 'Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường và số' });
    }

    const user = await UserModel.findById(req.user.id);
    const isValid = await UserModel.verifyPassword(currentPassword, user.password);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không đúng' });
    }

    await UserModel.updatePassword(req.user.id, newPassword);
    res.json({ success: true, message: 'Đổi mật khẩu thành công' });
  } catch (error) { next(error); }
};

export const updateProfile = async (req, res, next) => {
  try {
    // Sau khi qua validate.js middleware, phone/email đã được sanitize
    const { fullName, email, phone } = req.body;
    const data = {};
    if (fullName !== undefined) data.full_name = fullName;
    if (email !== undefined) data.email = email || null;
    if (phone !== undefined) data.phone = phone || null;
    await UserModel.update(req.user.id, data);
    res.json({ success: true, message: 'Cập nhật thành công' });
  } catch (error) { next(error); }
};
