-- Recommended indexes for LMS performance
-- Adjust names to avoid conflicts with existing indexes before applying.

-- Students
CREATE INDEX idx_students_branch_status ON students(branch_id, status);
CREATE INDEX idx_students_fee_status ON students(fee_status);
CREATE INDEX idx_students_fee_end_date ON students(fee_end_date);
CREATE INDEX idx_students_remaining_sessions ON students(remaining_sessions);
CREATE INDEX idx_students_payment_status ON students(payment_status);
CREATE INDEX idx_students_sale ON students(sale_id, branch_id);

-- Leads
CREATE INDEX idx_leads_branch_status ON leads(branch_id, status);
CREATE INDEX idx_leads_sale ON leads(sale_id, branch_id);
CREATE INDEX idx_leads_created_at ON leads(created_at);
CREATE INDEX idx_leads_scheduled_date ON leads(scheduled_date);
CREATE INDEX idx_leads_converted_at ON leads(converted_at);
CREATE INDEX idx_leads_customer_phone ON leads(customer_phone);

-- Revenues
CREATE INDEX idx_revenues_created_at ON revenues(created_at);
CREATE INDEX idx_revenues_ec_month ON revenues(ec_id, created_at);
CREATE INDEX idx_revenues_branch_created ON revenues(branch_id, created_at);

-- Sessions & attendance
CREATE INDEX idx_sessions_class_date ON sessions(class_id, session_date);
CREATE INDEX idx_attendance_session_student ON attendance(session_id, student_id, status);

-- Student renewals
CREATE INDEX idx_student_renewals_student_created ON student_renewals(student_id, created_at);

-- Trial students and warnings
CREATE INDEX idx_trial_students_status_sessions ON trial_students(status, sessions_attended);

