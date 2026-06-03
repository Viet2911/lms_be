const errorHandler = (err, req, res, next) => {
  console.error('Error:', err.message || err);

  // PostgreSQL error codes
  if (err.code === '23505') {
    return res.status(400).json({ success: false, message: 'Dữ liệu đã tồn tại (trùng lặp)' });
  }

  if (err.code === '23503') {
    return res.status(400).json({ success: false, message: 'Dữ liệu tham chiếu không tồn tại' });
  }

  if (err.code === '23502') {
    return res.status(400).json({ success: false, message: 'Thiếu dữ liệu bắt buộc' });
  }

  if (err.code === '22P02') {
    return res.status(400).json({ success: false, message: 'Dữ liệu không hợp lệ' });
  }

  // Legacy MySQL codes (keep for safety)
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(400).json({ success: false, message: 'Dữ liệu đã tồn tại' });
  }

  const isProduction = process.env.NODE_ENV === 'production';
  res.status(err.statusCode || 500).json({
    success: false,
    message: isProduction ? 'Lỗi server' : (err.message || 'Lỗi server'),
  });
};

export default errorHandler;
