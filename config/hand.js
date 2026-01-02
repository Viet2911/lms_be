import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Kết nối database
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'lms'
};

// Kiểm tra password đã được hash chưa
// Bcrypt hash bắt đầu bằng $2a$, $2b$ hoặc $2y$ và dài 60 ký tự
function isHashed(password) {
    if (!password) return false;
    return /^\$2[aby]\$\d{2}\$.{53}$/.test(password);
}

// Hash password
async function hashPassword(plainPassword) {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(plainPassword, salt);
}

// Main function
async function hashAllPasswords() {
    let connection;

    try {
        console.log('🔗 Đang kết nối database...');
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Kết nối thành công!\n');

        // Lấy tất cả users
        const [users] = await connection.query('SELECT id, username, password FROM users');
        console.log(`📋 Tìm thấy ${users.length} users\n`);

        let updated = 0;
        let skipped = 0;

        for (const user of users) {
            if (isHashed(user.password)) {
                console.log(`⏭️  [${user.username}] - Đã được mã hóa, bỏ qua`);
                skipped++;
            } else {
                // Hash password chưa mã hóa
                const hashedPassword = await hashPassword(user.password);

                await connection.query(
                    'UPDATE users SET password = ? WHERE id = ?',
                    [hashedPassword, user.id]
                );

                console.log(`✅ [${user.username}] - Đã mã hóa password`);
                updated++;
            }
        }

        console.log('\n========== KẾT QUẢ ==========');
        console.log(`✅ Đã mã hóa: ${updated} users`);
        console.log(`⏭️  Bỏ qua: ${skipped} users (đã mã hóa)`);
        console.log('==============================\n');

    } catch (error) {
        console.error('❌ Lỗi:', error.message);
    } finally {
        if (connection) {
            await connection.end();
            console.log('🔌 Đã đóng kết nối database');
        }
    }
}

// Chạy
hashAllPasswords();