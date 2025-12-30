// Enrollment Form Service - Fill Word Template
// Sử dụng pizzip + docxtemplater để điền template
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EnrollmentFormService {

    formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN').format(amount || 0);
    }

    numberToVietnamese(num) {
        if (!num || num === 0) return 'Không đồng';

        const ones = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
        const tens = ['', 'mười', 'hai mươi', 'ba mươi', 'bốn mươi', 'năm mươi', 'sáu mươi', 'bảy mươi', 'tám mươi', 'chín mươi'];

        const readThreeDigits = (n) => {
            let result = '';
            const hundred = Math.floor(n / 100);
            const ten = Math.floor((n % 100) / 10);
            const one = n % 10;

            if (hundred > 0) result += ones[hundred] + ' trăm ';
            if (ten > 0) result += tens[ten] + ' ';
            else if (hundred > 0 && one > 0) result += 'lẻ ';
            if (one > 0) {
                if (ten > 1 && one === 1) result += 'mốt';
                else if (ten > 0 && one === 5) result += 'lăm';
                else result += ones[one];
            }
            return result.trim();
        };

        if (num >= 1000000000) {
            const billion = Math.floor(num / 1000000000);
            const remainder = num % 1000000000;
            return readThreeDigits(billion) + ' tỷ ' + (remainder > 0 ? this.numberToVietnamese(remainder) : 'đồng');
        }
        if (num >= 1000000) {
            const million = Math.floor(num / 1000000);
            const remainder = num % 1000000;
            return readThreeDigits(million) + ' triệu ' + (remainder > 0 ? this.numberToVietnamese(remainder) : 'đồng');
        }
        if (num >= 1000) {
            const thousand = Math.floor(num / 1000);
            const remainder = num % 1000;
            return readThreeDigits(thousand) + ' nghìn ' + (remainder > 0 ? readThreeDigits(remainder) + ' đồng' : 'đồng');
        }
        return readThreeDigits(num) + ' đồng';
    }

    async fillTemplate(data) {
        // Dynamic imports
        const PizZip = (await import('pizzip')).default;
        const Docxtemplater = (await import('docxtemplater')).default;

        const templatePath = path.join(__dirname, '../templates/enrollment_template.docx');

        if (!fs.existsSync(templatePath)) {
            throw new Error('Template file not found: ' + templatePath);
        }

        const tempDir = path.join(__dirname, '../temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const outputPath = path.join(tempDir, `enrollment_${data.student.id}_${Date.now()}.docx`);

        // Read template
        const content = fs.readFileSync(templatePath, 'binary');
        const zip = new PizZip(content);

        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            delimiters: { start: '{{', end: '}}' }
        });

        const paidAmount = data.payment.actual_revenue || 0;
        const remaining = data.payment.remaining || 0;
        const scholarshipMonths = data.course.scholarship_months || 0;
        const packageMonths = data.course.package_months || 0;
        const totalMonths = parseInt(packageMonths) + parseInt(scholarshipMonths);
        const discountPercent = data.payment.fee_original > 0
            ? Math.round((data.payment.fee_discount || 0) / data.payment.fee_original * 100)
            : 0;

        const today = new Date();

        // Set data
        doc.render({
            student_name: data.student.full_name || '',
            birth_year: data.student.birth_year || '',
            address: data.student.address || '',
            school: data.student.school || '',
            parent_name: data.parent.name || '',
            parent_phone: data.parent.phone || '',
            parent_email: data.parent.email || '',
            parent_job: data.parent.job || '',
            ec_name: data.ec_name || '',
            branch_name: data.branch_name || 'Army Technology',
            level_name: data.course.level_name || '',
            package_months: packageMonths + ' tháng',
            scholarship_months: scholarshipMonths > 0 ? scholarshipMonths + ' tháng' : '',
            total_months: totalMonths + ' tháng',
            fee_original: this.formatCurrency(data.payment.fee_original),
            discount_percent: discountPercent > 0 ? discountPercent + '%' : '',
            fee_total: this.formatCurrency(data.payment.fee_total),
            paid_amount: this.formatCurrency(paidAmount),
            paid_words: this.numberToVietnamese(paidAmount),
            remaining_amount: this.formatCurrency(remaining),
            remaining_words: this.numberToVietnamese(remaining),
            gifts: data.course.gifts || '',
            date_day: today.getDate(),
            date_month: today.getMonth() + 1,
            date_year: today.getFullYear()
        });

        // Generate output
        const buf = doc.getZip().generate({ type: 'nodebuffer' });
        fs.writeFileSync(outputPath, buf);

        return outputPath;
    }
}

export default new EnrollmentFormService();