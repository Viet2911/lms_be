/**
 * Centralized validation middleware dùng express-validator
 * Đồng bộ với frontend validation rules
 */
import { body, validationResult } from 'express-validator';

// Regex đồng bộ với frontend/js/app.js
const VN_PHONE_REGEX = /^0(2[0-9]|3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

// Normalize số điện thoại: +84xxx → 0xxx, bỏ khoảng trắng
const normalizePhone = (v) => {
  if (!v || typeof v !== 'string') return v;
  return v.replace(/\s/g, '').replace(/^\+84/, '0');
};

// Strip HTML tags để phòng XSS
const stripHtml = (v) => {
  if (!v || typeof v !== 'string') return v;
  return v.replace(/<[^>]*>/g, '').trim();
};

/**
 * Middleware xử lý lỗi validation — dùng sau mảng validators
 * Trả về lỗi đầu tiên tìm được
 */
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    return res.status(400).json({ success: false, message: first.msg });
  }
  next();
};

/**
 * Validators theo từng nhóm endpoint
 */
export const validators = {

  // ==================== AUTH ====================
  login: [
    body('username').trim().notEmpty().withMessage('Vui lòng nhập username'),
    body('password').notEmpty().withMessage('Vui lòng nhập mật khẩu'),
  ],

  changePassword: [
    body('currentPassword').notEmpty().withMessage('Vui lòng nhập mật khẩu hiện tại'),
    body('newPassword')
      .notEmpty().withMessage('Vui lòng nhập mật khẩu mới')
      .matches(PASSWORD_REGEX)
      .withMessage('Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường và số'),
  ],

  updateProfile: [
    body('fullName').optional().customSanitizer(stripHtml)
      .isLength({ min: 2, max: 100 }).withMessage('Họ tên phải từ 2-100 ký tự'),
    body('email').optional({ checkFalsy: true })
      .isEmail().withMessage('Email không hợp lệ')
      .normalizeEmail(),
    body('phone').optional({ checkFalsy: true })
      .customSanitizer(normalizePhone)
      .matches(VN_PHONE_REGEX).withMessage('Số điện thoại không hợp lệ'),
  ],

  // ==================== USERS ====================
  createUser: [
    body('username').trim()
      .notEmpty().withMessage('Username là bắt buộc')
      .isLength({ min: 3, max: 50 }).withMessage('Username phải từ 3-50 ký tự')
      .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username chỉ được dùng chữ cái, số và _'),
    body('password')
      .notEmpty().withMessage('Mật khẩu là bắt buộc')
      .matches(PASSWORD_REGEX)
      .withMessage('Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường và số'),
    body('fullName').optional().customSanitizer(stripHtml),
    body('full_name').optional().customSanitizer(stripHtml),
    body('email').optional({ checkFalsy: true })
      .isEmail().withMessage('Email không hợp lệ')
      .normalizeEmail(),
    body('phone').optional({ checkFalsy: true })
      .customSanitizer(normalizePhone)
      .matches(VN_PHONE_REGEX).withMessage('Số điện thoại không hợp lệ'),
  ],

  updateUser: [
    body('fullName').optional().customSanitizer(stripHtml),
    body('full_name').optional().customSanitizer(stripHtml),
    body('email').optional({ checkFalsy: true })
      .isEmail().withMessage('Email không hợp lệ')
      .normalizeEmail(),
    body('phone').optional({ checkFalsy: true })
      .customSanitizer(normalizePhone)
      .matches(VN_PHONE_REGEX).withMessage('Số điện thoại không hợp lệ'),
  ],

  // ==================== STUDENTS ====================
  createStudent: [
    body('fullName').optional().customSanitizer(stripHtml),
    body('full_name').optional().customSanitizer(stripHtml),
    body('parentName').optional().customSanitizer(stripHtml),
    body('parent_name').optional().customSanitizer(stripHtml),
    body('address').optional().customSanitizer(stripHtml),
    body('note').optional().customSanitizer(stripHtml),
    body('parentPhone').optional({ checkFalsy: true })
      .customSanitizer(normalizePhone)
      .matches(VN_PHONE_REGEX).withMessage('Số điện thoại phụ huynh không hợp lệ'),
    body('parent_phone').optional({ checkFalsy: true })
      .customSanitizer(normalizePhone)
      .matches(VN_PHONE_REGEX).withMessage('Số điện thoại phụ huynh không hợp lệ'),
    body('parentEmail').optional({ checkFalsy: true })
      .isEmail().withMessage('Email phụ huynh không hợp lệ')
      .normalizeEmail(),
    body('parent_email').optional({ checkFalsy: true })
      .isEmail().withMessage('Email phụ huynh không hợp lệ')
      .normalizeEmail(),
    body('tuitionFee').optional({ checkFalsy: true })
      .isNumeric().withMessage('Học phí phải là số'),
    body('tuition_fee').optional({ checkFalsy: true })
      .isNumeric().withMessage('Học phí phải là số'),
    body('birthYear').optional({ checkFalsy: true })
      .isInt({ min: 1990, max: new Date().getFullYear() })
      .withMessage('Năm sinh không hợp lệ'),
  ],

  updateStudent: [
    body('fullName').optional().customSanitizer(stripHtml),
    body('full_name').optional().customSanitizer(stripHtml),
    body('parentName').optional().customSanitizer(stripHtml),
    body('parent_name').optional().customSanitizer(stripHtml),
    body('address').optional().customSanitizer(stripHtml),
    body('note').optional().customSanitizer(stripHtml),
    body('parentPhone').optional({ checkFalsy: true })
      .customSanitizer(normalizePhone)
      .matches(VN_PHONE_REGEX).withMessage('Số điện thoại phụ huynh không hợp lệ'),
    body('parent_phone').optional({ checkFalsy: true })
      .customSanitizer(normalizePhone)
      .matches(VN_PHONE_REGEX).withMessage('Số điện thoại phụ huynh không hợp lệ'),
    body('parentEmail').optional({ checkFalsy: true })
      .isEmail().withMessage('Email phụ huynh không hợp lệ')
      .normalizeEmail(),
    body('parent_email').optional({ checkFalsy: true })
      .isEmail().withMessage('Email phụ huynh không hợp lệ')
      .normalizeEmail(),
  ],

  // ==================== LEADS ====================
  createLead: [
    body('customerName').trim().customSanitizer(stripHtml)
      .notEmpty().withMessage('Tên phụ huynh là bắt buộc'),
    body('customerPhone')
      .notEmpty().withMessage('Số điện thoại là bắt buộc')
      .customSanitizer(normalizePhone)
      .matches(VN_PHONE_REGEX).withMessage('Số điện thoại không hợp lệ'),
    body('customerEmail').optional({ checkFalsy: true })
      .isEmail().withMessage('Email không hợp lệ')
      .normalizeEmail(),
    body('studentName').optional().customSanitizer(stripHtml),
    body('note').optional().customSanitizer(stripHtml),
  ],

  updateLead: [
    body('customerName').optional().trim().customSanitizer(stripHtml),
    body('customerPhone').optional({ checkFalsy: true })
      .customSanitizer(normalizePhone)
      .matches(VN_PHONE_REGEX).withMessage('Số điện thoại không hợp lệ'),
    body('customerEmail').optional({ checkFalsy: true })
      .isEmail().withMessage('Email không hợp lệ')
      .normalizeEmail(),
    body('note').optional().customSanitizer(stripHtml),
  ],
};
