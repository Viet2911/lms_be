const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(400).json({ success: false, message: 'Dữ liệu đã tồn tại' });
  }

  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({ success: false, message: 'Dữ liệu tham chiếu không tồn tại' });
  }

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Lỗi server'
  });
};

export default errorHandler;
