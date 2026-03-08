import jwt from 'jsonwebtoken';
import UserModel from '../models/UserModel.js';

// In-memory auth cache: userId -> { user, permissions, exp }
const authCache = new Map();
const AUTH_CACHE_TTL = 5 * 60 * 1000; // 5 phút

export function invalidateAuthCache(userId) {
  authCache.delete(String(userId));
}

export const authenticate = async (req, res, next) => {
  try {
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
    const uid = String(decoded.userId);

    // Check cache
    const cached = authCache.get(uid);
    if (cached && Date.now() < cached.exp) {
      req.user = cached.user;
      return next();
    }

    // Cache miss — query DB
    const user = await UserModel.findByIdWithRole(decoded.userId);
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, message: 'User không tồn tại hoặc bị khóa' });
    }

    const permissions = await UserModel.getPermissions(user.role_id);
    const primaryBranch = user.branches?.find(b => b.is_primary) || user.branches?.[0] || null;

    const userObj = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role_id: user.role_id,
      role_name: user.role_name,
      is_system_wide: user.is_system_wide,
      branches: user.branches || [],
      primaryBranch,
      permissions
    };

    authCache.set(uid, { user: userObj, exp: Date.now() + AUTH_CACHE_TTL });
    req.user = userObj;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') return res.status(401).json({ success: false, message: 'Token hết hạn' });
    if (error.name === 'JsonWebTokenError') return res.status(401).json({ success: false, message: 'Token không hợp lệ' });
    return res.status(500).json({ success: false, message: 'Lỗi xác thực' });
  }
};

export const authorize = (...permissions) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
  if (req.user.role_name === 'ADMIN' || req.user.role_name === 'GDV') return next();
  if (permissions.some(p => req.user.permissions.includes(p))) return next();
  return res.status(403).json({ success: false, message: 'Không có quyền' });
};

export const authorizeRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
  if (req.user.role_name === 'ADMIN' || roles.includes(req.user.role_name)) return next();
  return res.status(403).json({ success: false, message: 'Không có quyền' });
};
