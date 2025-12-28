import db from '../config/database.js';

class BaseModel {
  constructor(tableName) {
    this.table = tableName;
    this.db = db;
  }

  async findAll({ where = {}, orderBy = 'id DESC', page = 1, limit = 20, select = '*' } = {}) {
    const offset = (page - 1) * limit;
    const { clause, params } = this.buildWhere(where);
    
    const countSql = `SELECT COUNT(*) as total FROM ${this.table} ${clause}`;
    const [countRows] = await this.db.query(countSql, params);
    const total = countRows[0]?.total || 0;

    const sql = `SELECT ${select} FROM ${this.table} ${clause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
    const [rows] = await this.db.query(sql, [...params, +limit, +offset]);

    return {
      data: rows,
      pagination: { page: +page, limit: +limit, total, totalPages: Math.ceil(total / limit) }
    };
  }

  async findById(id) {
    const [rows] = await this.db.query(`SELECT * FROM ${this.table} WHERE id = ?`, [id]);
    return rows[0] || null;
  }

  async findOne(where = {}) {
    const { clause, params } = this.buildWhere(where);
    const [rows] = await this.db.query(`SELECT * FROM ${this.table} ${clause} LIMIT 1`, params);
    return rows[0] || null;
  }

  async create(data) {
    const [result] = await this.db.query(`INSERT INTO ${this.table} SET ?`, [data]);
    return { id: result.insertId, ...data };
  }

  async update(id, data) {
    await this.db.query(`UPDATE ${this.table} SET ? WHERE id = ?`, [data, id]);
    return this.findById(id);
  }

  async delete(id) {
    const [result] = await this.db.query(`DELETE FROM ${this.table} WHERE id = ?`, [id]);
    return result.affectedRows > 0;
  }

  async count(where = {}) {
    const { clause, params } = this.buildWhere(where);
    const [rows] = await this.db.query(`SELECT COUNT(*) as total FROM ${this.table} ${clause}`, params);
    return rows[0]?.total || 0;
  }

  async query(sql, params = []) {
    const [rows] = await this.db.query(sql, params);
    return rows;
  }

  buildWhere(where) {
    const conditions = [];
    const params = [];

    for (const [key, value] of Object.entries(where)) {
      if (value === undefined) continue;
      if (value === null) {
        conditions.push(`${key} IS NULL`);
      } else if (typeof value === 'object') {
        if (value.like) { conditions.push(`${key} LIKE ?`); params.push(`%${value.like}%`); }
        else if (value.in) { conditions.push(`${key} IN (?)`); params.push(value.in); }
        else if (value.gte) { conditions.push(`${key} >= ?`); params.push(value.gte); }
        else if (value.lte) { conditions.push(`${key} <= ?`); params.push(value.lte); }
        else if (value.gt) { conditions.push(`${key} > ?`); params.push(value.gt); }
        else if (value.lt) { conditions.push(`${key} < ?`); params.push(value.lt); }
        else if (value.ne) { conditions.push(`${key} != ?`); params.push(value.ne); }
      } else {
        conditions.push(`${key} = ?`);
        params.push(value);
      }
    }

    const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { clause, params };
  }
}

export default BaseModel;
