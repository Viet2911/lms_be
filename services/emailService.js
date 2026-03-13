import nodemailer from 'nodemailer';
import db from '../config/database.js';

class EmailService {
  constructor() {
    this.transporter = null;
    this.config = null;
  }

  // Load config từ database
  async loadConfig() {
    try {
      const [rows] = await db.query(`
        SELECT setting_key, setting_value 
        FROM system_settings 
        WHERE setting_key LIKE 'smtp_%'
      `);

      this.config = {};
      rows.forEach(row => {
        const key = row.setting_key.replace('smtp_', '');
        this.config[key] = row.setting_value;
      });

      if (this.config.host && this.config.user && this.config.pass) {
        this.transporter = nodemailer.createTransport({
          host: this.config.host,
          port: parseInt(this.config.port) || 587,
          secure: this.config.secure === 'true' || this.config.port === '465',
          auth: {
            user: this.config.user,
            pass: this.config.pass
          }
        });
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  // Gửi email
  async send(to, subject, html, text = null) {
    if (!this.transporter) {
      const loaded = await this.loadConfig();
      if (!loaded) {
        return { success: false, message: 'Email chưa được cấu hình' };
      }
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"${this.config.from_name || 'ARMY Technology'}" <${this.config.user}>`,
        to,
        subject,
        text: text || subject,
        html
      });

      return { success: true, messageId: info.messageId };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // Template: Thông tin tài khoản mới
  async sendAccountCreated(email, fullName, username, password, loginUrl = '') {
    const subject = '🎉 Tài khoản LMS của bạn đã được tạo - ARMY Technology';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:#f5f5f5;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:40px 30px;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:28px;">🎓 ARMY Technology</h1>
      <p style="color:rgba(255,255,255,0.9);margin:10px 0 0;font-size:16px;">Learning Management System</p>
    </div>
    
    <!-- Content -->
    <div style="padding:40px 30px;">
      <h2 style="color:#333;margin:0 0 20px;font-size:22px;">Xin chào ${fullName}! 👋</h2>
      
      <p style="color:#555;font-size:15px;line-height:1.6;margin:0 0 20px;">
        Tài khoản của bạn trên hệ thống LMS đã được tạo thành công. 
        Dưới đây là thông tin đăng nhập của bạn:
      </p>
      
      <!-- Credentials Box -->
      <div style="background:linear-gradient(135deg,#f8fafc 0%,#e2e8f0 100%);border-radius:12px;padding:25px;margin:25px 0;border-left:4px solid #667eea;">
        <table style="width:100%;border-collapse:collapse;">
        <tr>
            <td style="padding:8px 0;color:#666;font-size:14px;width:120px;">👤 Web: :</td>
            <td style="padding:8px 0;color:#333;font-size:16px;font-weight:600;">https://curious-fenglisu-66f227.netlify.app/</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#666;font-size:14px;width:120px;">👤 Username:</td>
            <td style="padding:8px 0;color:#333;font-size:16px;font-weight:600;">${username}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;color:#666;font-size:14px;">🔐 Mật khẩu:</td>
            <td style="padding:8px 0;font-family:monospace;font-size:16px;color:#667eea;font-weight:600;">${password}</td>
          </tr>
        </table>
      </div>
      
      <!-- Warning -->
      <div style="background:#fef3c7;border-radius:8px;padding:15px;margin:20px 0;">
        <p style="color:#92400e;font-size:13px;margin:0;line-height:1.5;">
          ⚠️ <strong>Lưu ý quan trọng:</strong> Vui lòng đổi mật khẩu ngay sau khi đăng nhập lần đầu để bảo mật tài khoản của bạn.
        </p>
      </div>
      
      <!-- Login Button -->
      ${loginUrl ? `
      <div style="text-align:center;margin:30px 0;">
        <a href="${loginUrl}" style="display:inline-block;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#ffffff;padding:14px 40px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:600;">
          Đăng nhập ngay →
        </a>
      </div>
      ` : ''}
      
      <p style="color:#555;font-size:14px;line-height:1.6;margin:25px 0 0;">
        Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với quản trị viên hệ thống.
      </p>
    </div>
    
    <!-- Footer -->
    <div style="background:#f8fafc;padding:25px 30px;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="color:#94a3b8;font-size:12px;margin:0;">
        © ${new Date().getFullYear()} ARMY Technology. All rights reserved.<br>
        Email này được gửi tự động, vui lòng không trả lời.
      </p>
    </div>
  </div>
</body>
</html>`;

    const text = `
Xin chào ${fullName}!

Tài khoản của bạn trên hệ thống LMS đã được tạo thành công.

Thông tin đăng nhập:
- Username: ${username}
- Mật khẩu: ${password}

⚠️ Lưu ý: Vui lòng đổi mật khẩu ngay sau khi đăng nhập lần đầu.

${loginUrl ? `Đăng nhập tại: ${loginUrl}` : ''}

---
ARMY Technology - Learning Management System
`;

    return await this.send(email, subject, html, text);
  }

  // Template: Reset mật khẩu
  async sendPasswordReset(email, fullName, newPassword) {
    const subject = '🔐 Mật khẩu của bạn đã được đặt lại - ARMY Technology';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:#f5f5f5;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%);padding:40px 30px;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:28px;">🔐 Đặt lại mật khẩu</h1>
    </div>
    
    <div style="padding:40px 30px;">
      <h2 style="color:#333;margin:0 0 20px;">Xin chào ${fullName}!</h2>
      
      <p style="color:#555;font-size:15px;line-height:1.6;">
        Mật khẩu tài khoản của bạn đã được đặt lại bởi quản trị viên.
      </p>
      
      <div style="background:#fef3c7;border-radius:12px;padding:25px;margin:25px 0;text-align:center;">
        <p style="color:#92400e;font-size:14px;margin:0 0 10px;">Mật khẩu mới của bạn:</p>
        <p style="font-family:monospace;font-size:24px;color:#d97706;font-weight:700;margin:0;">${newPassword}</p>
      </div>
      
      <p style="color:#dc2626;font-size:14px;font-weight:600;">
        ⚠️ Vui lòng đổi mật khẩu ngay sau khi đăng nhập!
      </p>
    </div>
    
    <div style="background:#f8fafc;padding:25px 30px;text-align:center;">
      <p style="color:#94a3b8;font-size:12px;margin:0;">
        © ${new Date().getFullYear()} ARMY Technology
      </p>
    </div>
  </div>
</body>
</html>`;

    return await this.send(email, subject, html);
  }

  // Test kết nối SMTP
  async testConnection() {
    if (!this.transporter) {
      const loaded = await this.loadConfig();
      if (!loaded) {
        return { success: false, message: 'Chưa cấu hình SMTP' };
      }
    }

    try {
      await this.transporter.verify();
      return { success: true, message: 'Kết nối SMTP thành công' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}

export default new EmailService();