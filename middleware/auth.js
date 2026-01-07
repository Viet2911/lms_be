import jwt from 'jsonwebtoken';
import UserModel from '../models/UserModel.js';

export const authenticate = async (req, res, next) => {
  try {
    // Check JWT_SECRET is defined
    if (!process.env.JWT_SECRET) {
      console.error('CRITICAL: JWT_SECRET is not defined!');
      return res.status(500).json({ success: false, message: 'Server configuration error' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Không có token' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await UserModel.findByIdWithRole(decoded.userId);

    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, message: 'User không tồn tại hoặc bị khóa' });
    }

    const permissions = await UserModel.getPermissions(user.role_id);

    // Tìm primary branch
    const primaryBranch = user.branches?.find(b => b.is_primary) || user.branches?.[0] || null;

    req.user = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role_id: user.role_id,
      role_name: user.role_name,
      is_system_wide: user.is_system_wide,
      branches: user.branches || [],
      primaryBranch: primaryBranch,
      permissions
    };
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') return res.status(401).json({ success: false, message: 'Token hết hạn' });
    if (error.name === 'JsonWebTokenError') return res.status(401).json({ success: false, message: 'Token không hợp lệ' });
    return res.status(500).json({ success: false, message: 'Lỗi xác thực' });
  }
};

export const authorize = (...permissions) => (req, res, next) => {
  console.log(req.user);

  if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
  if (req.user.role_name === 'ADMIN' || req.user.role_name === "GDV") return next();
  if (permissions.some(p => req.user.permissions.includes(p))) return next();
  console.log('b');
  return res.status(403).json({ success: false, message: 'Không có 1' });
};

export const authorizeRole = (...roles) => (req, res, next) => {

  if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
  console.log(req.user.role_name);

  console.log(req.user.role_name === "ADMIN" || req.user.role_name === "GDV");
  if (req.user.role_name == "ADMIN" || roles.includes(req.user.role_name)) {
    console.log("a");

    return next();
  }
  return res.status(403).json({ success: false, message: 'Không có quyền2' });
};
