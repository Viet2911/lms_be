import EnrollmentFormService from '../services/enrollmentFormService.js';
import StudentModel from '../models/StudentModel.js';
import db from '../config/database.js';

// Generate and download enrollment form
export const generateEnrollmentForm = async (req, res, next) => {
    try {
        const { studentId } = req.params;

        // Get student with all related info
        const student = await StudentModel.findByIdWithRelations(studentId);
        if (!student) {
            return res.status(404).json({ success: false, message: 'Học sinh không tồn tại' });
        }

        // Get payment info
        const [payments] = await db.query(
            `SELECT SUM(amount) as total_paid FROM payments WHERE student_id = ? AND status = 'completed'`,
            [studentId]
        );
        const paidAmount = payments[0]?.total_paid || 0;

        // Get tuition package info if available
        let packageInfo = null;
        if (student.tuition_package_id) {
            const [packages] = await db.query(
                `SELECT tp.*, s.name as subject_name, l.name as level_name
         FROM tuition_packages tp
         LEFT JOIN subjects s ON tp.subject_id = s.id
         LEFT JOIN levels l ON tp.level_id = l.id
         WHERE tp.id = ?`,
                [student.tuition_package_id]
            );
            packageInfo = packages[0];
        }

        // Get branch info
        const [branches] = await db.query(
            `SELECT name FROM branches WHERE id = ?`,
            [student.branch_id]
        );
        const branchName = branches[0]?.name || 'Army Technology';

        // Get EC info
        let ecName = '';
        if (student.assigned_ec) {
            const [ecs] = await db.query(`SELECT full_name FROM users WHERE id = ?`, [student.assigned_ec]);
            ecName = ecs[0]?.full_name || '';
        }

        // Calculate fees
        const originalFee = packageInfo?.price || student.tuition_fee || 0;
        const discount = student.discount_amount || 0;
        const scholarship = student.scholarship_amount || 0;
        const actualFee = originalFee - discount - scholarship;
        const remainingAmount = Math.max(0, actualFee - paidAmount);

        // Prepare data for form
        const formData = {
            studentName: student.full_name,
            studentCode: student.student_code,
            birthYear: student.birth_year,
            address: student.address,
            school: student.school,
            parentName: student.parent_name,
            parentPhone: student.parent_phone,
            parentEmail: student.parent_email,
            parentJob: student.parent_job,
            parentFacebook: student.parent_facebook,
            notes: student.notes,
            ecName: ecName,
            branchName: branchName,

            levelName: student.level_name || packageInfo?.level_name || '',
            courseName: packageInfo?.name || student.subject_name || '',
            originalFee: originalFee,
            discount: discount,
            scholarship: scholarship,
            giftName: student.gift_name || '',
            totalSessions: packageInfo?.total_sessions || student.total_sessions || 0,
            actualFee: actualFee,
            paidAmount: paidAmount,
            remainingAmount: remainingAmount
        };

        // Generate document
        const buffer = await EnrollmentFormService.createEnrollmentForm(formData);

        // Set headers for download
        const filename = `Don_nhap_hoc_${student.student_code}_${Date.now()}.docx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        res.setHeader('Content-Length', buffer.length);

        res.send(buffer);
    } catch (error) {
        console.error('Generate enrollment form error:', error);
        next(error);
    }
};

// Generate QR code only (for display in frontend)
export const generatePaymentQR = async (req, res, next) => {
    try {
        const { studentId } = req.params;
        const { amount } = req.query;

        const student = await StudentModel.findByIdWithRelations(studentId);
        if (!student) {
            return res.status(404).json({ success: false, message: 'Học sinh không tồn tại' });
        }

        // Calculate remaining if amount not provided
        let payAmount = amount ? parseInt(amount) : 0;

        if (!payAmount) {
            const [payments] = await db.query(
                `SELECT SUM(amount) as total_paid FROM payments WHERE student_id = ? AND status = 'completed'`,
                [studentId]
            );
            const paidAmount = payments[0]?.total_paid || 0;
            const totalFee = student.tuition_fee || 0;
            payAmount = Math.max(0, totalFee - paidAmount);
        }

        const description = `${student.student_code} ${student.full_name}`.substring(0, 25);
        const qrUrl = EnrollmentFormService.generateVietQRUrl(payAmount, description);

        res.json({
            success: true,
            data: {
                qrUrl,
                amount: payAmount,
                studentCode: student.student_code,
                studentName: student.full_name,
                description
            }
        });
    } catch (error) {
        next(error);
    }
};

// Preview enrollment form data (without generating document)
export const previewEnrollmentForm = async (req, res, next) => {
    try {
        const { studentId } = req.params;

        const student = await StudentModel.findByIdWithRelations(studentId);
        if (!student) {
            return res.status(404).json({ success: false, message: 'Học sinh không tồn tại' });
        }

        // Get payment info
        const [payments] = await db.query(
            `SELECT SUM(amount) as total_paid FROM payments WHERE student_id = ? AND status = 'completed'`,
            [studentId]
        );
        const paidAmount = payments[0]?.total_paid || 0;

        // Calculate fees
        const originalFee = student.tuition_fee || 0;
        const discount = student.discount_amount || 0;
        const scholarship = student.scholarship_amount || 0;
        const actualFee = originalFee - discount - scholarship;
        const remainingAmount = Math.max(0, actualFee - paidAmount);

        res.json({
            success: true,
            data: {
                student,
                paidAmount,
                actualFee,
                remainingAmount,
                qrUrl: remainingAmount > 0
                    ? EnrollmentFormService.generateVietQRUrl(remainingAmount, `${student.student_code} ${student.full_name}`.substring(0, 25))
                    : null
            }
        });
    } catch (error) {
        next(error);
    }
};