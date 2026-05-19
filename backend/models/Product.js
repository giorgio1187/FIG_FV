class Product {
  constructor(data = {}) {
    this.id = data.id || null;
    this.name = data.name || '';
    this.price = parseFloat(data.price) || 0;
    this.category = data.category || '';
    this.is_active = data.is_active !== undefined ? data.is_active : true;
    this.created_at = data.created_at || null;
    this.updated_at = data.updated_at || null;
  }

  get formattedPrice() {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(this.price);
  }

  toSafeObject() {
    return {
      id: this.id,
      name: this.name,
      price: this.price,
      formattedPrice: this.formattedPrice,
      category: this.category,
      is_active: this.is_active
    };
  }

  async findById(db) {
    const result = await db.query(
      'SELECT * FROM products WHERE id = $1',
      [this.id]
    );
    return result.rows[0] ? new Product(result.rows[0]) : null;
  }

  async findAll(db) {
    const result = await db.query(
      'SELECT * FROM products ORDER BY category, name ASC'
    );
    return result.rows.map(row => new Product(row));
  }

  async findActive(db) {
    const result = await db.query(
      `SELECT * FROM products WHERE is_active = true ORDER BY category, name ASC`
    );
    return result.rows.map(row => new Product(row));
  }

  async findByCategory(db, category) {
    const result = await db.query(
      `SELECT * FROM products 
       WHERE category = $1 AND is_active = true 
       ORDER BY name ASC`,
      [category]
    );
    return result.rows.map(row => new Product(row));
  }

  async getCategories(db) {
    const result = await db.query(
      'SELECT DISTINCT category FROM products WHERE is_active = true ORDER BY category'
    );
    return result.rows.map(row => row.category);
  }

  async save(db) {
    if (this.id) {
      return this.update(db);
    }
    const result = await db.query(
      `INSERT INTO products (name, price, category, is_active)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [this.name, this.price, this.category, this.is_active]
    );
    return new Product(result.rows[0]);
  }

  async update(db) {
    const result = await db.query(
      `UPDATE products SET
        name = $2,
        price = $3,
        category = $4,
        is_active = $5,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [this.id, this.name, this.price, this.category, this.is_active]
    );
    return result.rows[0] ? new Product(result.rows[0]) : null;
  }

  async delete(db) {
    const result = await db.query(
      'DELETE FROM products WHERE id = $1 RETURNING id',
      [this.id]
    );
    return result.rowCount > 0;
  }

  validate() {
    const errors = [];
    if (!this.name || this.name.trim().length === 0) {
      errors.push('Nombre es requerido');
    }
    if (!this.price || this.price <= 0) {
      errors.push('Precio debe ser mayor a 0');
    }
    if (!this.category || this.category.trim().length === 0) {
      errors.push('Categoría es requerida');
    }
    return errors;
  }
}

module.exports = Product;