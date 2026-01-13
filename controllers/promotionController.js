import PromotionModel from '../models/PromotionModel.js';

// ==================== CHƯƠNG TRÌNH KM ====================

// Lấy CTKM đang hoạt động (cho nhân viên)
export const getActivePrograms = async (req, res, next) => {
    try {
        const programs = await PromotionModel.getActivePrograms();
        res.json({ success: true, data: programs });
    } catch (error) { next(error); }
};

// Lấy tất cả CTKM (admin)
export const getAllPrograms = async (req, res, next) => {
    try {
        const programs = await PromotionModel.getAllPrograms();
        res.json({ success: true, data: programs });
    } catch (error) { next(error); }
};

// Tạo CTKM
export const createProgram = async (req, res, next) => {
    try {
        const data = { ...req.body, created_by: req.user.id };
        const result = await PromotionModel.createProgram(data);
        res.json({ success: true, message: 'Tạo chương trình KM thành công', data: { id: result.insertId } });
    } catch (error) { next(error); }
};

// Cập nhật CTKM
export const updateProgram = async (req, res, next) => {
    try {
        const { id } = req.params;
        await PromotionModel.update(id, req.body);
        res.json({ success: true, message: 'Cập nhật thành công' });
    } catch (error) { next(error); }
};

// Xóa CTKM
export const deleteProgram = async (req, res, next) => {
    try {
        const { id } = req.params;
        await PromotionModel.db.query('DELETE FROM promotion_programs WHERE id = ?', [id]);
        res.json({ success: true, message: 'Đã xóa chương trình' });
    } catch (error) { next(error); }
};

// ==================== VẬT PHẨM KM ====================

// Lấy tất cả vật phẩm
export const getAllItems = async (req, res, next) => {
    try {
        const { category } = req.query;
        const items = await PromotionModel.getAllItems(category);
        res.json({ success: true, data: items });
    } catch (error) { next(error); }
};

// Lấy vật phẩm có tồn kho
export const getItemsInStock = async (req, res, next) => {
    try {
        const items = await PromotionModel.getItemsInStock();
        res.json({ success: true, data: items });
    } catch (error) { next(error); }
};

// Tạo vật phẩm
export const createItem = async (req, res, next) => {
    try {
        const result = await PromotionModel.createItem(req.body);
        res.json({ success: true, message: 'Tạo vật phẩm thành công', data: { id: result.insertId } });
    } catch (error) { next(error); }
};

// Cập nhật vật phẩm
export const updateItem = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, code, category, description, stock_quantity, is_active } = req.body;
        await PromotionModel.db.query(`
      UPDATE promotion_items SET name = ?, code = ?, category = ?, description = ?, stock_quantity = ?, is_active = ?
      WHERE id = ?
    `, [name, code, category, description, stock_quantity, is_active, id]);
        res.json({ success: true, message: 'Cập nhật thành công' });
    } catch (error) { next(error); }
};

// Xóa vật phẩm
export const deleteItem = async (req, res, next) => {
    try {
        const { id } = req.params;
        // Check if item has been given
        const [used] = await PromotionModel.db.query('SELECT given_quantity FROM promotion_items WHERE id = ?', [id]);
        if (used[0]?.given_quantity > 0) {
            return res.status(400).json({ success: false, message: 'Không thể xóa vật phẩm đã phát' });
        }
        await PromotionModel.db.query('DELETE FROM promotion_items WHERE id = ?', [id]);
        res.json({ success: true, message: 'Đã xóa vật phẩm' });
    } catch (error) { next(error); }
};

// Thêm tồn kho cho vật phẩm
export const addItemStock = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { quantity, note } = req.body;

        // Update stock
        await PromotionModel.db.query(
            'UPDATE promotion_items SET stock_quantity = stock_quantity + ? WHERE id = ?',
            [quantity, id]
        );

        // Log history
        await PromotionModel.db.query(
            'INSERT INTO promotion_item_stocks (item_id, quantity, type, note, created_by) VALUES (?, ?, ?, ?, ?)',
            [id, quantity, 'import', note || 'Nhập kho', req.user.id]
        );

        res.json({ success: true, message: 'Đã thêm ' + quantity + ' vào kho' });
    } catch (error) { next(error); }
};

// Tặng quà (trừ stock) - cho phép mọi user có quyền
export const giveItem = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { student_id, lead_id, note } = req.body;

        // Kiểm tra còn hàng không
        const [items] = await PromotionModel.db.query('SELECT * FROM promotion_items WHERE id = ?', [id]);
        if (!items.length) {
            return res.status(404).json({ success: false, message: 'Quà tặng không tồn tại' });
        }
        if (items[0].stock_quantity <= 0) {
            return res.status(400).json({ success: false, message: 'Quà tặng đã hết hàng' });
        }

        // Trừ stock
        await PromotionModel.db.query(
            'UPDATE promotion_items SET stock_quantity = stock_quantity - 1 WHERE id = ? AND stock_quantity > 0',
            [id]
        );

        // Log history
        const targetNote = student_id ? `Tặng cho học viên #${student_id}` : lead_id ? `Tặng cho lead #${lead_id}` : note || 'Tặng quà';
        await PromotionModel.db.query(
            'INSERT INTO promotion_item_stocks (item_id, quantity, type, note, created_by) VALUES (?, ?, ?, ?, ?)',
            [id, -1, 'out', targetNote, req.user.id]
        );

        res.json({ success: true, message: 'Tặng quà thành công', data: { remaining: items[0].stock_quantity - 1 } });
    } catch (error) { next(error); }
};

// Nhập/xuất kho
export const updateStock = async (req, res, next) => {
    try {
        const { item_id, quantity, type, note } = req.body;
        await PromotionModel.updateItemStock(item_id, quantity, type, note, req.user.id);
        res.json({ success: true, message: type === 'in' ? 'Nhập kho thành công' : 'Xuất kho thành công' });
    } catch (error) { next(error); }
};

// Lấy lịch sử kho
export const getStockHistory = async (req, res, next) => {
    try {
        const { item_id } = req.query;
        const history = await PromotionModel.getStockHistory(item_id);
        res.json({ success: true, data: history });
    } catch (error) { next(error); }
};

// Vật phẩm sắp hết
export const getLowStockItems = async (req, res, next) => {
    try {
        const items = await PromotionModel.getLowStockItems();
        res.json({ success: true, data: items });
    } catch (error) { next(error); }
};

// ==================== HỌC BỔNG KM ====================

// Lấy tất cả học bổng
export const getAllScholarships = async (req, res, next) => {
    try {
        const scholarships = await PromotionModel.getAllScholarships();
        res.json({ success: true, data: scholarships });
    } catch (error) { next(error); }
};

// Tạo học bổng
export const createScholarship = async (req, res, next) => {
    try {
        const result = await PromotionModel.createScholarship(req.body);
        res.json({ success: true, message: 'Tạo học bổng thành công', data: { id: result.insertId } });
    } catch (error) { next(error); }
};

// ==================== LEAD PROMOTIONS ====================

// Lấy KM của lead
export const getLeadPromotions = async (req, res, next) => {
    try {
        const { leadId } = req.params;
        const promotions = await PromotionModel.getLeadPromotions(leadId);
        const gifts = await PromotionModel.getLeadGifts(leadId);
        res.json({ success: true, data: { promotions, gifts } });
    } catch (error) { next(error); }
};

// Áp dụng KM cho lead
export const applyPromotion = async (req, res, next) => {
    try {
        const { leadId } = req.params;
        const result = await PromotionModel.applyPromotion(leadId, req.body, req.user.id);

        // Nếu có giảm giá thêm, thông báo
        let message = 'Áp dụng khuyến mại thành công';
        if (req.body.extra_discount > 0) {
            message += '. Giảm giá thêm đang chờ GDV duyệt.';
        }

        res.json({ success: true, message, data: result });
    } catch (error) { next(error); }
};

// Lấy danh sách chờ duyệt
export const getPendingApprovals = async (req, res, next) => {
    try {
        const { branch_id } = req.query;
        const list = await PromotionModel.getPendingApprovals(branch_id);
        res.json({ success: true, data: list });
    } catch (error) { next(error); }
};

// Duyệt giảm giá thêm
export const approveExtraDiscount = async (req, res, next) => {
    try {
        const { leadId } = req.params;
        const { approved } = req.body;
        await PromotionModel.approveExtraDiscount(leadId, approved, req.user.id);
        res.json({ success: true, message: approved ? 'Đã duyệt giảm giá' : 'Đã từ chối giảm giá' });
    } catch (error) { next(error); }
};

// ==================== LEAD GIFTS ====================

// Thêm quà tặng cho lead
export const addGift = async (req, res, next) => {
    try {
        const { leadId } = req.params;
        const result = await PromotionModel.addGift(leadId, req.body, req.user.id);
        res.json({ success: true, message: 'Thêm quà tặng thành công', data: { id: result.insertId } });
    } catch (error) { next(error); }
};

// Đánh dấu đã giao quà
export const markGiftDelivered = async (req, res, next) => {
    try {
        const { giftId } = req.params;
        await PromotionModel.markGiftDelivered(giftId, req.user.id);
        res.json({ success: true, message: 'Đã giao quà thành công' });
    } catch (error) { next(error); }
};

// Hoàn trả quà
export const returnGift = async (req, res, next) => {
    try {
        const { giftId } = req.params;
        await PromotionModel.returnGift(giftId, req.user.id);
        res.json({ success: true, message: 'Đã hoàn trả quà' });
    } catch (error) { next(error); }
};

// ==================== TỔNG HỢP CHO CONVERT MODAL ====================

// Lấy tất cả data cho modal chuyển đổi
export const getConvertData = async (req, res, next) => {
    try {
        const programs = await PromotionModel.getActivePrograms();
        const items = await PromotionModel.getItemsInStock();
        const scholarships = await PromotionModel.getAllScholarships();

        // Lấy packages từ database - use base_price
        const [packages] = await PromotionModel.db.query(
            `SELECT id, code, name, months, sessions_count as total_sessions, base_price as price, 
              default_scholarship_months, is_active
       FROM packages WHERE is_active = 1 ORDER BY months ASC`
        );

        res.json({
            success: true,
            data: {
                programs,           // Chương trình KM
                promotionPrograms: programs, // Alias cho frontend
                items,              // Vật phẩm (quà tặng)
                giftItems: items,   // Alias cho frontend
                scholarships,       // Học bổng
                packages,           // Gói học phí
                tuitionPackages: packages // Alias cho frontend
            }
        });
    } catch (error) { next(error); }
};