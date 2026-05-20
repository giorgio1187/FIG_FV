class Ingredient {
  constructor(data = {}) {
    this.id = data.id || null;
    this.name = data.name || '';
    this.stock = parseFloat(data.stock) || 0;
    this.unit = data.unit || 'u.';
    this.low_stock_threshold = parseFloat(data.low_stock_threshold) || 10;
    this.created_at = data.created_at || null;
    this.updated_at = data.updated_at || null;
  }

  get isLowStock() {
    return this.stock < this.low_stock_threshold;
  }

  get stockStatus() {
    return this.isLowStock ? 'Crítico' : 'Óptimo';
  }

  toSafeObject() {
    return {
      id: this.id,
      name: this.name,
      stock: this.stock,
      unit: this.unit,
      low_stock_threshold: this.low_stock_threshold,
      isLowStock: this.isLowStock,
      stockStatus: this.stockStatus
    };
  }

  async findById(db) {
    const result = await db.query(
      'SELECT * FROM ingredients WHERE id = $1',
      [this.id]
    );
    return result.rows[0] ? new Ingredient(result.rows[0]) : null;
  }

  async findAll(db) {
    const result = await db.query(
      'SELECT * FROM ingredients ORDER BY name ASC'
    );
    return result.rows.map(row => new Ingredient(row));
  }

  async findLowStock(db) {
    const result = await db.query(
      `SELECT * FROM ingredients 
       WHERE stock < low_stock_threshold 
       ORDER BY stock ASC`
    );
    return result.rows.map(row => new Ingredient(row));
  }

  async save(db) {
    if (this.id) {
      return this.update(db);
    }
    const result = await db.query(
      `INSERT INTO ingredients (name, stock, unit, low_stock_threshold)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [this.name, this.stock, this.unit, this.low_stock_threshold]
    );
    return new Ingredient(result.rows[0]);
  }

  async update(db) {
    const result = await db.query(
      `UPDATE ingredients SET
        name = $2,
        stock = $3,
        unit = $4,
        low_stock_threshold = $5,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [this.id, this.name, this.stock, this.unit, this.low_stock_threshold]
    );
    return result.rows[0] ? new Ingredient(result.rows[0]) : null;
  }

  async updateStock(db, newStock, client = null) {
    const queryFn = client ? client.query.bind(client) : db.query.bind(db);
    const result = await queryFn(
      `UPDATE ingredients 
       SET stock = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [this.id, newStock]
    );
    return result.rows[0] ? new Ingredient(result.rows[0]) : null;
  }

  async addStock(db, quantity, client = null) {
    return this.updateStock(db, this.stock + quantity, client);
  }

  async removeStock(db, quantity, client = null) {
    const newStock = this.stock - quantity;
    if (newStock < 0) {
      throw new Error(`Stock insuficiente para "${this.name}". Disponible: ${this.stock}, Requerido: ${quantity}`);
    }
    return this.updateStock(db, newStock, client);
  }

  async delete(db) {
    const result = await db.query(
      'DELETE FROM ingredients WHERE id = $1 RETURNING id',
      [this.id]
    );
    return result.rowCount > 0;
  }

  async logMovement(db, action, quantity, stockBefore, stockAfter, orderId = null, userId = null, reason = null, client = null) {
    const queryFn = client ? client.query.bind(client) : db.query.bind(db);
    await queryFn(
      `INSERT INTO inventory_logs (ingredient_id, order_id, user_id, action, quantity, stock_before, stock_after, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [this.id, orderId, userId, action, quantity, stockBefore, stockAfter, reason]
    );
  }

  validate() {
    const errors = [];
    if (!this.name || this.name.trim().length === 0) {
      errors.push('Nombre es requerido');
    }
    if (this.stock === undefined || this.stock < 0) {
      errors.push('Stock debe ser un número no negativo');
    }
    return errors;
  }
}

module.exports = Ingredient;