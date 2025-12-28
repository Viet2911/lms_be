// Telegram Bot Service - Gửi thông báo khi có đăng ký trải nghiệm mới

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

const telegramService = {
  /**
   * Gửi tin nhắn đến Telegram
   * @param {string} message - Nội dung tin nhắn (hỗ trợ HTML)
   */
  async sendMessage(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      console.log('[Telegram] Bot chưa được cấu hình. Bỏ qua gửi thông báo.');
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        })
      });

      const result = await response.json();
      
      if (result.ok) {
        console.log('[Telegram] Gửi thông báo thành công');
        return true;
      } else {
        console.error('[Telegram] Lỗi:', result.description);
        return false;
      }
    } catch (error) {
      console.error('[Telegram] Lỗi kết nối:', error.message);
      return false;
    }
  },

  /**
   * Gửi thông báo đăng ký trải nghiệm mới
   * @param {object} data - Thông tin đăng ký
   */
  async notifyNewExperience(data) {
    const message = `
🎯 <b>ĐĂNG KÝ TRẢI NGHIỆM MỚI</b>

🏢 <b>Cơ sở:</b> ${data.branch_name || 'N/A'}

👤 <b>Học sinh:</b> ${data.student_name || 'N/A'}
📅 <b>Năm sinh:</b> ${data.birth_year || 'N/A'}

👨‍👩‍👧 <b>Phụ huynh:</b> ${data.customer_name || 'N/A'}
📱 <b>SĐT:</b> ${data.customer_phone || 'N/A'}

📚 <b>Môn học:</b> ${data.subject_name || 'Chưa chọn'}
📊 <b>Trình độ:</b> ${data.level_name || 'Chưa chọn'}

🗓 <b>Lịch hẹn:</b> ${formatDate(data.scheduled_date)} lúc ${data.scheduled_time || 'N/A'}

👤 <b>Sale phụ trách:</b> ${data.sale_name || 'N/A'}

💬 <b>Ghi chú:</b> ${data.notes || 'Không có'}

⏰ <i>Thời gian tạo: ${formatDateTime(new Date())}</i>
    `.trim();

    return await this.sendMessage(message);
  },

  /**
   * Gửi thông báo học sinh đăng ký học thử
   * @param {object} data - Thông tin học thử
   */
  async notifyNewTrial(data) {
    const message = `
📝 <b>HỌC SINH ĐĂNG KÝ HỌC THỬ</b>

👤 <b>Học sinh:</b> ${data.full_name || 'N/A'}
📅 <b>Năm sinh:</b> ${data.birth_year || 'N/A'}

👨‍👩‍👧 <b>Phụ huynh:</b> ${data.parent_name || 'N/A'}
📱 <b>SĐT:</b> ${data.parent_phone || 'N/A'}

📚 <b>Môn học:</b> ${data.subject_name || 'Chưa chọn'}
📊 <b>Trình độ:</b> ${data.level_name || 'Chưa chọn'}
🏫 <b>Lớp:</b> ${data.class_name || 'Chưa xếp lớp'}

🔢 <b>Số buổi học thử:</b> ${data.max_sessions || 3} buổi

👤 <b>Sale phụ trách:</b> ${data.sale_name || 'N/A'}

⏰ <i>Thời gian tạo: ${formatDateTime(new Date())}</i>
    `.trim();

    return await this.sendMessage(message);
  },

  /**
   * Gửi thông báo chuyển đổi học sinh chính thức
   * @param {object} data - Thông tin học sinh
   */
  async notifyConversion(data) {
    const message = `
🎉 <b>CHUYỂN ĐỔI THÀNH CÔNG</b>

👤 <b>Học sinh:</b> ${data.full_name || 'N/A'}
🆔 <b>Mã HS:</b> ${data.student_code || 'N/A'}

📚 <b>Môn học:</b> ${data.subject_name || 'N/A'}
🏫 <b>Lớp:</b> ${data.class_name || 'Chưa xếp lớp'}

👤 <b>Sale:</b> ${data.sale_name || 'N/A'}

✅ <i>Học sinh đã chuyển từ học thử sang chính thức!</i>
    `.trim();

    return await this.sendMessage(message);
  },

  /**
   * Gửi thông báo tùy chỉnh
   * @param {string} title - Tiêu đề
   * @param {string} content - Nội dung
   */
  async notifyCustom(title, content) {
    const message = `
📢 <b>${title}</b>

${content}

⏰ <i>${formatDateTime(new Date())}</i>
    `.trim();

    return await this.sendMessage(message);
  }
};

// Helper functions
function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric'
    });
  } catch (e) {
    return dateStr;
  }
}

function formatDateTime(date) {
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default telegramService;
