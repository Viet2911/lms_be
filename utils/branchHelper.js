/**
 * Lấy branch filter cho user
 * @param {Object} req - Express request
 * @returns {number|null} - Branch ID hoặc null nếu xem tất cả
 */
export const getBranchFilter = (req) => {
  // Admin (is_system_wide) có thể xem tất cả, hoặc lọc theo branchId từ query
  if (req.user.is_system_wide) {
    return req.query.branchId ? parseInt(req.query.branchId) : null;
  }
  
  // User thường: chỉ xem branch của mình
  const userBranchIds = req.user.branches?.map(b => b.id) || [];
  const queryBranchId = parseInt(req.query.branchId);
  
  // Nếu có query param và user có quyền branch đó
  if (queryBranchId && userBranchIds.includes(queryBranchId)) {
    return queryBranchId;
  }
  
  // Mặc định: branch chính của user
  return req.user.primaryBranch?.id || userBranchIds[0] || null;
};

/**
 * Kiểm tra user có quyền truy cập branch không
 * @param {Object} user - User object từ req.user
 * @param {number} branchId - Branch ID cần kiểm tra
 * @returns {boolean}
 */
export const canAccessBranch = (user, branchId) => {
  if (user.is_system_wide) return true;
  const userBranchIds = user.branches?.map(b => b.id) || [];
  return userBranchIds.includes(parseInt(branchId));
};

/**
 * Lấy branch ID để tạo mới (ưu tiên từ body, fallback về primary branch)
 * @param {Object} req - Express request
 * @returns {number|null}
 */
export const getCreateBranchId = (req) => {
  console.log('=== getCreateBranchId DEBUG ===');
  console.log('req.body.branchId:', req.body.branchId);
  console.log('req.user.branches:', req.user.branches);
  console.log('req.user.primaryBranch:', req.user.primaryBranch);
  console.log('req.user.is_system_wide:', req.user.is_system_wide);
  
  if (req.body.branchId) {
    const branchId = parseInt(req.body.branchId);
    const hasAccess = canAccessBranch(req.user, branchId);
    console.log('Parsed branchId:', branchId);
    console.log('canAccessBranch result:', hasAccess);
    
    if (hasAccess) {
      console.log('Returning branchId from body:', branchId);
      return branchId;
    }
  }
  
  const fallbackId = req.user.primaryBranch?.id || req.user.branches?.[0]?.id || null;
  console.log('Returning fallback branchId:', fallbackId);
  console.log('===============================');
  return fallbackId;
};

/**
 * Lấy branch code từ user branches
 * @param {Object} user - User object
 * @param {number} branchId - Branch ID
 * @returns {string}
 */
export const getBranchCode = (user, branchId) => {
  const branch = user.branches?.find(b => b.id === parseInt(branchId));
  return branch?.code || 'HS';
};
