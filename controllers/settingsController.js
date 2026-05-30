import db from '../config/database.js';
import emailService from '../services/emailService.js';

const ensureSettingsTable = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      id SERIAL PRIMARY KEY,
      setting_key VARCHAR(100) UNIQUE NOT NULL,
      setting_value TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

const upsertSetting = async (key, value) => {
  await db.query(`
    INSERT INTO system_settings (setting_key, setting_value)
    VALUES (?, ?)
    ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value
  `, [key, value]);
};

export const getPaymentConfig = async (req, res, next) => {
  try {
    const [rows] = await db.query(`
      SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'payment_%'
    `);
    const config = {};
    rows.forEach(row => { config[row.setting_key.replace('payment_', '')] = row.setting_value; });
    res.json({ success: true, data: config });
  } catch (error) {
    res.json({ success: true, data: {} });
  }
};

export const savePaymentConfig = async (req, res, next) => {
  try {
    const { bank_code, account_no, account_name, qr_template, desc_prefix } = req.body;
    await ensureSettingsTable();

    const settings = [
      ['payment_bank_code', bank_code],
      ['payment_account_no', account_no],
      ['payment_account_name', account_name],
      ['payment_qr_template', qr_template],
      ['payment_desc_prefix', desc_prefix || '']
    ];
    for (const [key, value] of settings) await upsertSetting(key, value);

    res.json({ success: true, message: 'Đã lưu cấu hình thanh toán' });
  } catch (error) { next(error); }
};

export const getAllSettings = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT * FROM system_settings ORDER BY setting_key');
    res.json({ success: true, data: rows });
  } catch (error) {
    res.json({ success: true, data: [] });
  }
};

export const saveSetting = async (req, res, next) => {
  try {
    const { key, value } = req.body;
    await ensureSettingsTable();
    await upsertSetting(key, value);
    res.json({ success: true, message: 'Đã lưu' });
  } catch (error) { next(error); }
};

export const getSmtpConfig = async (req, res, next) => {
  try {
    const [rows] = await db.query(`
      SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'smtp_%'
    `);
    const config = {};
    rows.forEach(row => {
      const key = row.setting_key.replace('smtp_', '');
      config[key] = key === 'pass' ? '********' : row.setting_value;
    });
    res.json({ success: true, data: config });
  } catch (error) {
    res.json({ success: true, data: {} });
  }
};

export const saveSmtpConfig = async (req, res, next) => {
  try {
    const { host, port, secure, user, pass, from_name } = req.body;
    await ensureSettingsTable();

    const settings = [
      ['smtp_host', host],
      ['smtp_port', port],
      ['smtp_secure', secure ? 'true' : 'false'],
      ['smtp_user', user],
      ['smtp_from_name', from_name || 'ARMY Technology']
    ];
    if (pass && pass !== '********') settings.push(['smtp_pass', pass]);

    for (const [key, value] of settings) await upsertSetting(key, value);

    await emailService.loadConfig();
    res.json({ success: true, message: 'Đã lưu cấu hình SMTP' });
  } catch (error) { next(error); }
};

export const testSmtpConnection = async (req, res, next) => {
  try {
    const { testEmail } = req.body;
    await emailService.loadConfig();

    const verifyResult = await emailService.testConnection();
    if (!verifyResult.success) {
      return res.json({ success: false, message: 'Kết nối SMTP thất bại: ' + verifyResult.message });
    }

    if (testEmail) {
      const result = await emailService.send(
        testEmail,
        '✅ Test Email từ LMS - ARMY Technology',
        `<div style="font-family:sans-serif;padding:20px;">
          <h2 style="color:#22c55e;">✅ Kết nối SMTP thành công!</h2>
          <p>Đây là email test từ hệ thống LMS của ARMY Technology.</p>
          <p style="color:#666;font-size:13px;">Thời gian: ${new Date().toLocaleString('vi-VN')}</p>
        </div>`
      );
      if (result.success) {
        return res.json({ success: true, message: 'Kết nối thành công và đã gửi email test đến ' + testEmail });
      } else {
        return res.json({ success: false, message: 'Kết nối OK nhưng gửi email thất bại: ' + result.message });
      }
    }

    res.json({ success: true, message: 'Kết nối SMTP thành công!' });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};
