import BaseModel from './BaseModel.js';

class PromotionModel extends BaseModel {
  constructor() {
    super('promotion_programs');
  }

  // ==================== CHƯƠNG TRÌNH KM ====================

  // Lấy tất cả CTKM đang hoạt động
  async getActivePrograms() {
    const [rows] = await this.db.query(`
      SELECT * FROM promotion_programs 
      WHERE is_active = 1 
        AND (start_date IS NULL OR start_date <= CURDATE())
        AND (end_date IS NULL OR end_date >= CURDATE())
      ORDER BY name
    `);
    return rows;
  }

  // Lấy tất cả CTKM (admin)
  async getAllPrograms() {
    const [rows] = await this.db.query(`
      SELECT p.*, u.full_name as created_by_name
      FROM promotion_programs p
      LEFT JOIN users u ON p.created_by = u.id
      ORDER BY p.is_active DESC, p.created_at DESC
    `);
    return rows;
  }

  // Tạo CTKM
  async createProgram(data) {
    const [result] = await this.db.query(`
      INSERT INTO promotion_programs (code, name, description, discount_type, discount_value, max_discount, start_date, end_date, requires_approval, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [data.code, data.name, data.description, data.discount_type, data.discount_value, data.max_discount, data.start_date, data.end_date, data.requires_approval || false, data.created_by]);
    return result;
  }

  // ==================== VẬT PHẨM KM ====================

  // Lấy tất cả vật phẩm
  async getAllItems(category = null) {
    let sql = `SELECT * FROM promotion_items WHERE is_active = 1`;
    const params = [];

    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }

    sql += ` ORDER BY category, name`;
    const [rows] = await this.db.query(sql, params);
    return rows;
  }

  // Lấy vật phẩm có tồn kho
  async getItemsInStock() {
    const [rows] = await this.db.query(`
      SELECT * FROM promotion_items 
      WHERE is_active = 1 AND stock_quantity > 0
      ORDER BY category, name
    `);
    return rows;
  }

  // Tạo vật phẩm
  async createItem(data) {
    const [result] = await this.db.query(`
      INSERT INTO promotion_items (code, name, category, description, unit, stock_quantity, min_stock, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [data.code, data.name, data.category, data.description, data.unit, data.stock_quantity || 0, data.min_stock || 5, data.image_url]);
    return result;
  }

  // Cập nhật tồn kho
  async updateItemStock(itemId, quantity, type, note, userId) {
    // Log stock change
    await this.db.query(`
      INSERT INTO promotion_item_stocks (item_id, quantity, type, note, created_by)
      VALUES (?, ?, ?, ?, ?)
    `, [itemId, quantity, type, note, userId]);

    // Update stock
    const operator = type === 'in' ? '+' : '-';
    await this.db.query(`
      UPDATE promotion_items SET stock_quantity = stock_quantity ${operator} ? WHERE id = ?
    `, [quantity, itemId]);

    return true;
  }

  // Lấy lịch sử nhập/xuất kho
  async getStockHistory(itemId = null) {
    let sql = `
      SELECT s.*, i.name as item_name, i.code as item_code, u.full_name as created_by_name
      FROM promotion_item_stocks s
      JOIN promotion_items i ON s.item_id = i.id
      LEFT JOIN users u ON s.created_by = u.id
    `;
    const params = [];

    if (itemId) {
      sql += ` WHERE s.item_id = ?`;
      params.push(itemId);
    }

    sql += ` ORDER BY s.created_at DESC LIMIT 100`;
    const [rows] = await this.db.query(sql, params);
    return rows;
  }

  // ==================== HỌC BỔNG KM ====================

  // Lấy tất cả học bổng
  async getAllScholarships() {
    const [rows] = await this.db.query(`
      SELECT s.*, sub.name as subject_name
      FROM promotion_scholarships s
      LEFT JOIN subjects sub ON s.subject_id = sub.id
      WHERE s.is_active = 1
      ORDER BY s.name
    `);
    return rows;
  }

  // Tạo học bổng
  async createScholarship(data) {
    const [result] = await this.db.query(`
      INSERT INTO promotion_scholarships (code, name, subject_id, months, description)
      VALUES (?, ?, ?, ?, ?)
    `, [data.code, data.name, data.subject_id, data.months, data.description]);
    return result;
  }

  // ==================== LEAD PROMOTIONS ====================

  // Lấy KM của lead
  async getLeadPromotions(leadId) {
    const [rows] = await this.db.query(`
      SELECT lp.*, 
        pp.code as program_code, pp.name as program_name, pp.discount_type, pp.discount_value,
        u1.full_name as created_by_name,
        u2.full_name as approved_by_name
      FROM lead_promotions lp
      LEFT JOIN promotion_programs pp ON lp.program_id = pp.id
      LEFT JOIN users u1 ON lp.created_by = u1.id
      LEFT JOIN users u2 ON lp.approved_by = u2.id
      WHERE lp.lead_id = ?
    `, [leadId]);
    return rows[0] || null;
  }

  // Áp dụng KM cho lead
  async applyPromotion(leadId, data, userId) {
    // Check existing
    const [existing] = await this.db.query(`SELECT id FROM lead_promotions WHERE lead_id = ?`, [leadId]);

    const totalDiscount = (parseFloat(data.program_discount) || 0) + (parseFloat(data.extra_discount) || 0);
    const extraStatus = data.extra_discount > 0 ? 'pending' : null;

    if (existing.length > 0) {
      // Update
      await this.db.query(`
        UPDATE lead_promotions SET
          program_id = ?, program_discount = ?,
          extra_discount = ?, extra_discount_reason = ?, extra_discount_status = ?,
          total_discount = ?, updated_at = NOW()
        WHERE lead_id = ?
      `, [data.program_id, data.program_discount, data.extra_discount, data.extra_discount_reason, extraStatus, totalDiscount, leadId]);
    } else {
      // Insert
      await this.db.query(`
        INSERT INTO lead_promotions (lead_id, program_id, program_discount, extra_discount, extra_discount_reason, extra_discount_status, total_discount, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [leadId, data.program_id, data.program_discount, data.extra_discount, data.extra_discount_reason, extraStatus, totalDiscount, userId]);
    }

    return { totalDiscount };
  }

  // Duyệt giảm giá thêm
  async approveExtraDiscount(leadId, approved, approverId) {
    const status = approved ? 'approved' : 'rejected';

    await this.db.query(`
      UPDATE lead_promotions SET
        extra_discount_status = ?,
        approved_by = ?,
        approved_at = NOW(),
        total_discount = CASE WHEN ? = 'approved' THEN program_discount + extra_discount ELSE program_discount END
      WHERE lead_id = ?
    `, [status, approverId, status, leadId]);

    return true;
  }

  // Lấy danh sách chờ duyệt giảm giá
  async getPendingApprovals(branchId = null) {
    let sql = `
      SELECT lp.*, l.student_name, l.customer_name, l.customer_phone, l.fee_total,
        pp.name as program_name,
        u.full_name as ec_name,
        b.name as branch_name
      FROM lead_promotions lp
      JOIN leads l ON lp.lead_id = l.id
      LEFT JOIN promotion_programs pp ON lp.program_id = pp.id
      LEFT JOIN users u ON l.sale_id = u.id
      LEFT JOIN branches b ON l.branch_id = b.id
      WHERE lp.extra_discount_status = 'pending'
    `;
    const params = [];

    if (branchId) {
      sql += ` AND l.branch_id = ?`;
      params.push(branchId);
    }

    sql += ` ORDER BY lp.created_at DESC`;
    const [rows] = await this.db.query(sql, params);
    return rows;
  }

  // ==================== LEAD GIFTS ====================

  // Lấy quà tặng của lead
  async getLeadGifts(leadId) {
    const [rows] = await this.db.query(`
      SELECT lg.*,
        pi.name as item_name, pi.code as item_code, pi.category as item_category,
        ps.name as scholarship_name, ps.months as scholarship_months,
        u.full_name as delivered_by_name
      FROM lead_promotion_gifts lg
      LEFT JOIN promotion_items pi ON lg.item_id = pi.id
      LEFT JOIN promotion_scholarships ps ON lg.scholarship_id = ps.id
      LEFT JOIN users u ON lg.delivered_by = u.id
      WHERE lg.lead_id = ?
      ORDER BY lg.created_at
    `, [leadId]);
    return rows;
  }

  // Thêm quà tặng cho lead
  async addGift(leadId, data, userId) {
    const [result] = await this.db.query(`
      INSERT INTO lead_promotion_gifts (lead_id, item_id, scholarship_id, quantity, delivery_condition, note)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [leadId, data.item_id || null, data.scholarship_id || null, data.quantity || 1, data.delivery_condition || 'immediate', data.note]);

    // Nếu tặng ngay và là vật phẩm → trừ kho
    if (data.item_id && data.delivery_condition === 'immediate') {
      await this.updateItemStock(data.item_id, data.quantity || 1, 'out', `Tặng cho lead #${leadId}`, userId);
    }

    return result;
  }

  // Đánh dấu đã giao quà
  async markGiftDelivered(giftId, userId) {
    // Get gift info
    const [gifts] = await this.db.query(`SELECT * FROM lead_promotion_gifts WHERE id = ?`, [giftId]);
    if (gifts.length === 0) return false;

    const gift = gifts[0];

    // Update status
    await this.db.query(`
      UPDATE lead_promotion_gifts SET 
        delivery_status = 'delivered',
        delivered_at = NOW(),
        delivered_by = ?
      WHERE id = ?
    `, [userId, giftId]);

    // Nếu là vật phẩm và chưa trừ kho (tặng sau) → trừ kho
    if (gift.item_id && gift.delivery_condition !== 'immediate') {
      await this.updateItemStock(gift.item_id, gift.quantity, 'out', `Giao quà cho lead #${gift.lead_id}`, userId);
    }

    return true;
  }

  // Hoàn trả quà (khi hoàn phí)
  async returnGift(giftId, userId) {
    const [gifts] = await this.db.query(`SELECT * FROM lead_promotion_gifts WHERE id = ?`, [giftId]);
    if (gifts.length === 0) return false;

    const gift = gifts[0];

    await this.db.query(`
      UPDATE lead_promotion_gifts SET delivery_status = 'returned' WHERE id = ?
    `, [giftId]);

    // Nếu là vật phẩm → nhập lại kho
    if (gift.item_id && gift.delivery_status === 'delivered') {
      await this.updateItemStock(gift.item_id, gift.quantity, 'in', `Hoàn trả từ lead #${gift.lead_id}`, userId);
    }

    return true;
  }

  // Thống kê vật phẩm sắp hết
  async getLowStockItems() {
    const [rows] = await this.db.query(`
      SELECT * FROM promotion_items 
      WHERE is_active = 1 AND stock_quantity <= min_stock
      ORDER BY stock_quantity ASC
    `);
    return rows;
  }

  // Giảm tồn kho khi phát quà
  async decreaseItemStock(itemId, quantity = 1, studentId = null, givenBy = null) {
    const conn = await this.db.getConnection();
    try {
      await conn.beginTransaction();

      // Giảm stock_quantity
      await conn.query(`
        UPDATE promotion_items 
        SET stock_quantity = stock_quantity - ?,
            given_quantity = IFNULL(given_quantity, 0) + ?
        WHERE id = ? AND stock_quantity >= ?
      `, [quantity, quantity, itemId, quantity]);

      // Log quà tặng đã phát
      if (studentId) {
        await conn.query(`
          INSERT INTO gift_logs (student_id, item_id, quantity, given_by, created_at)
          VALUES (?, ?, ?, ?, NOW())
        `, [studentId, itemId, quantity, givenBy]);
      }

      await conn.commit();
      return true;
    } catch (err) {
      await conn.rollback();
      console.error('Decrease stock error:', err);
      return false;
    } finally {
      conn.release();
    }
  }
}

export default new PromotionModel();