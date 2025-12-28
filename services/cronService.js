import cron from 'node-cron';
import db from '../config/database.js';

// Daily warning check at 8 AM
cron.schedule('0 8 * * *', async () => {
  console.log('🔄 Running daily warning check...');
  try {
    // Check trial students nearing limit
    const [trials] = await db.query(`
      SELECT ts.*, u.full_name as sale_name
      FROM trial_students ts
      JOIN users u ON ts.sale_id = u.id
      WHERE ts.status = 'active' AND ts.sessions_attended >= 2
    `);

    for (const trial of trials) {
      await db.query(`
        INSERT INTO warnings (type, severity, title, message, related_type, related_id, assigned_to)
        VALUES ('trial', 'warning', 'Học sinh thử sắp hết buổi', ?, 'trial_student', ?, ?)
      `, [`${trial.full_name} đã học ${trial.sessions_attended}/3 buổi`, trial.id, trial.sale_id]);
    }
    console.log('✅ Warning check completed');
  } catch (error) {
    console.error('❌ Warning check error:', error);
  }
});

console.log('⏰ Cron jobs scheduled');
