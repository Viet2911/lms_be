import BaseModel from './BaseModel.js';

class PackageModel extends BaseModel {
  constructor() {
    super('packages');
  }

  // Lấy tất cả packages với giá theo branch
  async findAllWithBranchPrice(branchId = null) {
    let sql = `
      SELECT p.*, 
             COALESCE(bp.price, p.base_price) as price,
             bp.is_active as branch_active,
             COALESCE(p.default_scholarship_months, 0) as default_scholarship_months
      FROM packages p
      LEFT JOIN branch_packages bp ON p.id = bp.package_id AND bp.branch_id = ?
      WHERE p.is_active = 1
      ORDER BY p.months ASC
    `;
    const [rows] = await this.db.query(sql, [branchId || 0]);
    return rows;
  }

  // Lấy giá gói theo branch
  async getPriceForBranch(packageId, branchId) {
    const [rows] = await this.db.query(`
      SELECT COALESCE(bp.price, p.base_price) as price,
             COALESCE(p.default_scholarship_months, 0) as default_scholarship_months
      FROM packages p
      LEFT JOIN branch_packages bp ON p.id = bp.package_id AND bp.branch_id = ?
      WHERE p.id = ?
    `, [branchId, packageId]);
    return rows[0] || { price: 0, default_scholarship_months: 0 };
  }

  // Cập nhật giá theo branch
  async setBranchPrice(packageId, branchId, price) {
    const [existing] = await this.db.query(
      'SELECT id FROM branch_packages WHERE package_id = ? AND branch_id = ?',
      [packageId, branchId]
    );

    if (existing.length > 0) {
      await this.db.query(
        'UPDATE branch_packages SET price = ? WHERE package_id = ? AND branch_id = ?',
        [price, packageId, branchId]
      );
    } else {
      await this.db.query(
        'INSERT INTO branch_packages (package_id, branch_id, price) VALUES (?, ?, ?)',
        [packageId, branchId, price]
      );
    }
    return { success: true };
  }

  // Lấy tất cả giá theo branch
  async getAllBranchPrices() {
    const [rows] = await this.db.query(`
      SELECT p.id, p.name, p.code, p.months, p.sessions_count, p.base_price,
             COALESCE(p.default_scholarship_months, 0) as default_scholarship_months,
             b.id as branch_id, b.name as branch_name, b.code as branch_code,
             COALESCE(bp.price, p.base_price) as price
      FROM packages p
      CROSS JOIN branches b
      LEFT JOIN branch_packages bp ON p.id = bp.package_id AND b.id = bp.branch_id
      WHERE p.is_active = 1 AND b.is_active = 1
      ORDER BY b.id, p.months
    `);
    return rows;
  }

  // Cập nhật học bổng mặc định cho gói
  async updateDefaultScholarship(packageId, months) {
    await this.db.query(
      'UPDATE packages SET default_scholarship_months = ? WHERE id = ?',
      [months, packageId]
    );
    return { success: true };
  }

  // Tính số buổi với học bổng
  calculateTotalSessions(packageId, scholarshipMonths = 0) {
    // 1 tháng = 4 buổi
    return scholarshipMonths * 4;
  }
}

export default new PackageModel();