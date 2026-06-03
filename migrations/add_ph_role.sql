-- ============================================================
-- Migration: Thêm role Phụ huynh (PH) và bảng parent_students
-- ============================================================

-- 1. Thêm role PH vào bảng roles
INSERT INTO roles (name, display_name, is_system_wide)
VALUES ('PH', 'Phụ huynh', false)
ON CONFLICT (name) DO NOTHING;

-- 2. Tạo bảng liên kết phụ huynh ↔ học sinh
CREATE TABLE IF NOT EXISTS parent_students (
  id              SERIAL PRIMARY KEY,
  parent_id       INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  student_id      INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  relationship    VARCHAR(50) NOT NULL DEFAULT 'parent',   -- 'parent', 'guardian', 'relative'
  is_active       BOOLEAN NOT NULL DEFAULT true,
  note            TEXT,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by      INTEGER REFERENCES users(id),
  UNIQUE(parent_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_ps_parent  ON parent_students(parent_id);
CREATE INDEX IF NOT EXISTS idx_ps_student ON parent_students(student_id);
CREATE INDEX IF NOT EXISTS idx_ps_active  ON parent_students(is_active);

-- 3. Comment bảng
COMMENT ON TABLE  parent_students              IS 'Liên kết tài khoản phụ huynh với học sinh';
COMMENT ON COLUMN parent_students.relationship IS 'Mối quan hệ: parent | guardian | relative';
COMMENT ON COLUMN parent_students.is_active    IS 'Khi false: phụ huynh không còn được xem học sinh này';
