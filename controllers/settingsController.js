import db from '../config/database.js';

// Get payment config
export const getPaymentConfig = async (req, res, next) => {
    try {
        const [rows] = await db.query(`
      SELECT setting_key, setting_value 
      FROM system_settings 
      WHERE setting_key LIKE 'payment_%'
    `);

        const config = {};
        rows.forEach(row => {
            const key = row.setting_key.replace('payment_', '');
            config[key] = row.setting_value;
        });

        res.json({ success: true, data: config });
    } catch (error) {
        // Table might not exist yet
        res.json({ success: true, data: {} });
    }
};

// Save payment config
export const savePaymentConfig = async (req, res, next) => {
    try {
        const { bank_code, account_no, account_name, qr_template, desc_prefix } = req.body;

        // Ensure table exists
        await db.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(100) UNIQUE NOT NULL,
        setting_value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

        const settings = [
            ['payment_bank_code', bank_code],
            ['payment_account_no', account_no],
            ['payment_account_name', account_name],
            ['payment_qr_template', qr_template],
            ['payment_desc_prefix', desc_prefix || '']
        ];

        for (const [key, value] of settings) {
            await db.query(`
        INSERT INTO system_settings (setting_key, setting_value) 
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE setting_value = ?
      `, [key, value, value]);
        }

        res.json({ success: true, message: 'Đã lưu cấu hình thanh toán' });
    } catch (error) { next(error); }
};

// Get all settings
export const getAllSettings = async (req, res, next) => {
    try {
        const [rows] = await db.query('SELECT * FROM system_settings ORDER BY setting_key');
        res.json({ success: true, data: rows });
    } catch (error) {
        res.json({ success: true, data: [] });
    }
};

// Save a single setting
export const saveSetting = async (req, res, next) => {
    try {
        const { key, value } = req.body;

        await db.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(100) UNIQUE NOT NULL,
        setting_value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

        await db.query(`
      INSERT INTO system_settings (setting_key, setting_value) 
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE setting_value = ?
    `, [key, value, value]);

        res.json({ success: true, message: 'Đã lưu' });
    } catch (error) { next(error); }
};