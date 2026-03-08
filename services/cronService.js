import cron from 'node-cron';
import db from '../config/database.js';

// Daily warning check at 8 AM
cron.schedule('0 8 * * *', async () => {
  console.log('🔄 Running daily warning check...');
  try {
    // Chèn cảnh báo cho tất cả trial_students đủ điều kiện trong một câu lệnh duy nhất
    await db.query(`
      INSERT INTO warnings (type, severity, title, message, related_type, related_id, assigned_to)
      SELECT 
        'trial' as type,
        'warning' as severity,
        'Học sinh thử sắp hết buổi' as title,
        CONCAT(ts.full_name, ' đã học ', ts.sessions_attended, '/3 buổi') as message,
        'trial_student' as related_type,
        ts.id as related_id,
        ts.sale_id as assigned_to
      FROM trial_students ts
      WHERE ts.status = 'active' 
        AND ts.sessions_attended >= 2
    `);

    console.log('✅ Warning check completed');
  } catch (error) {
    console.error('❌ Warning check error:', error);
  }
});

console.log('⏰ Cron jobs scheduled');
