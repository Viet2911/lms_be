import rateLimit from 'express-rate-limit';

// Rate limit riêng cho /auth/login — luôn bật, bảo vệ brute-force
export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 20,                   // tối đa 20 lần thất bại/IP
  message: { success: false, message: 'Quá nhiều lần đăng nhập sai. Thử lại sau 15 phút.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // không đếm login thành công
});
