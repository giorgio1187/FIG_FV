class Order {
  constructor(data = {}) {
    this.id = data.id || null;
    this.table_id = data.table_id || null;
    this.session_id = data.session_id || null;
    this.user_id = data.user_id || null;
    this.status = data.status || 'pending';
    this.subtotal = parseFloat(data.subtotal) || 0;
    this.total = parseFloat(data.total) || 0;
    this.notes = data.notes || null;
    this.items = data.items || [];
    this.created_at = data.created_at || null;
    this.updated_at = data.updated_at || null;
    this.paid_at = data.paid_at || null;
  }

  static get VALID_STATUSES() {
    return ['pending', 'preparing', 'ready', 'delivered', 'paid', 'cancelled'];
  }

  get totalFormatted() {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(this.total);
  }

  get statusLabel() {
    const labels = {
      pending: 'Pendiente',
      preparing: 'Preparando',
      ready: 'Listo',
      delivered: 'Entregado',
      paid: 'Pagado',
      cancelled: 'Cancelado'
    };
    return labels[this.status] || this.status;
  }

  get elapsedMinutes() {
    if (!this.created_at) return 0;
    return Math.floor((Date.now() - new Date(this.created_at).getTime()) / 60000);
  }

  get timerClass() {
    const mins = this.elapsedMinutes;
    if (mins > 20) return 'red';
    if (mins >= 11) return 'yellow';
    return 'green';
  }

  calculateTotals() {
    this.subtotal = this.items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
    this.total = this.subtotal;
    return this.total;
  }

  toSafeObject() {
    return {
      id: this.id,
      table_id: this.table_id,
      user_id: this.user_id,
      status: this.status,
      statusLabel: this.statusLabel,
      subtotal: this.subtotal,
      total: this.total,
      totalFormatted: this.totalFormatted,
      notes: this.notes,
      items: this.items,
      created_at: this.created_at,
      elapsedMinutes: this.elapsedMinutes,
      timerClass: this.timerClass
    };
  }

  async findById(db) {
    const result = await db.query(
      `SELECT o.*, 
              json_agg(json_build_object(
                'id', oi.id,
                'product_id', oi.product_id,
                'product_name', p.name,
                'quantity', oi.quantity,
                'unit_price', oi.unit_price,
                'subtotal', oi.subtotal,
                'notes', oi.notes
              )) FILTER (WHERE oi.id IS NOT NULL) as items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE o.id = $1
       GROUP BY o.id`,
      [this.id]
    );
    return result.rows[0] ? new Order(result.rows[0]) : null;
  }

  async findAll(db, filters = {}) {
    let query = `SELECT o.*, 
                        json_agg(json_build_object(
                          'id', oi.id,
                          'product_id', oi.product_id,
                          'product_name', p.name,
                          'quantity', oi.quantity,
                          'unit_price', oi.unit_price,
                          'subtotal', oi.subtotal
                        )) FILTER (WHERE oi.id IS NOT NULL) as items
                 FROM orders o
                 LEFT JOIN order_items oi ON o.id = oi.order_id
                 LEFT JOIN products p ON oi.product_id = p.id`;
    const params = [];
    const conditions = [];

    if (filters.status) {
      params.push(filters.status);
      conditions.push(`o.status = $${params.length}`);
    }
    if (filters.table_id) {
      params.push(filters.table_id);
      conditions.push(`o.table_id = $${params.length}`);
    }
    if (filters.session_id) {
      params.push(filters.session_id);
      conditions.push(`o.session_id = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' GROUP BY o.id ORDER BY o.created_at DESC';

    const result = await db.query(query, params);
    return result.rows.map(row => new Order(row));
  }

  async findByStatus(db, status) {
    return this.findAll(db, { status });
  }

  async findKDSOrders(db) {
    const result = await db.query(
      `SELECT o.id, o.table_id, o.status, o.created_at,
              rt.table_number,
              EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - o.created_at))/60 as minutes_pending,
              json_agg(json_build_object(
                'product_id', oi.product_id,
                'product_name', p.name,
                'quantity', oi.quantity,
                'notes', oi.notes
              )) as items
       FROM orders o
       LEFT JOIN restaurant_tables rt ON o.table_id = rt.id
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE o.status IN ('pending', 'preparing')
       GROUP BY o.id, rt.table_number
       ORDER BY o.created_at ASC`
    );
    return result.rows.map(row => ({
      ...row,
      minutes_pending: parseFloat(row.minutes_pending),
      items: row.items.filter(i => i.product_id !== null)
    }));
  }

  async findPendingPayment(db) {
    return this.findAll(db, { status: 'ready' });
  }

  async findBySession(db, sessionId) {
    return this.findAll(db, { session_id: sessionId });
  }

  async save(db, client = null) {
    const queryFn = client ? client.query.bind(client) : db.query.bind(db);
    this.calculateTotals();

    if (this.id) {
      return this.update(db, client);
    }

    const result = await queryFn(
      `INSERT INTO orders (table_id, session_id, user_id, status, subtotal, total, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [this.table_id, this.session_id, this.user_id, this.status, this.subtotal, this.total, this.notes]
    );

    this.id = result.rows[0].id;

    if (this.items.length > 0) {
      for (const item of this.items) {
        await queryFn(
          `INSERT INTO order_items (order_id, product_id, quantity, unit_price, subtotal, notes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [this.id, item.product_id, item.quantity, item.unit_price, item.subtotal, item.notes || null]
        );
      }
    }

    return this;
  }

  async update(db, client = null) {
    const queryFn = client ? client.query.bind(client) : db.query.bind(db);
    const result = await queryFn(
      `UPDATE orders SET
        table_id = $2,
        status = $3,
        subtotal = $4,
        total = $5,
        notes = $6,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [this.id, this.table_id, this.status, this.subtotal, this.total, this.notes]
    );
    return result.rows[0] ? new Order(result.rows[0]) : null;
  }

  async updateStatus(db, newStatus, client = null) {
    const queryFn = client ? client.query.bind(client) : db.query.bind(db);
    let query = `UPDATE orders SET status = $2, updated_at = CURRENT_TIMESTAMP`;
    
    if (newStatus === 'paid') {
      query += `, paid_at = CURRENT_TIMESTAMP`;
    }
    
    query += ` WHERE id = $1 RETURNING *`;
    
    const result = await queryFn(query, [this.id, newStatus]);
    return result.rows[0] ? new Order(result.rows[0]) : null;
  }

  async addItem(db, item, client = null) {
    const queryFn = client ? client.query.bind(client) : db.query.bind(db);
    const result = await queryFn(
      `INSERT INTO order_items (order_id, product_id, quantity, unit_price, subtotal, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [this.id, item.product_id, item.quantity, item.unit_price, item.subtotal, item.notes || null]
    );
    return result.rows[0];
  }

  async removeItem(db, itemId, client = null) {
    const queryFn = client ? client.query.bind(client) : db.query.bind(db);
    const result = await queryFn(
      'DELETE FROM order_items WHERE id = $1 AND order_id = $2 RETURNING id',
      [itemId, this.id]
    );
    return result.rowCount > 0;
  }

  async delete(db) {
    const result = await db.query(
      'DELETE FROM orders WHERE id = $1 RETURNING id',
      [this.id]
    );
    return result.rowCount > 0;
  }

  async getDailyRevenue(db, date = null) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const result = await db.query(
      `SELECT 
         COALESCE(SUM(total), 0) as total_revenue,
         COUNT(*) as order_count
       FROM orders 
       WHERE DATE(paid_at) = $1 AND status = 'paid'`,
      [targetDate]
    );
    return {
      revenue: parseFloat(result.rows[0].total_revenue),
      count: parseInt(result.rows[0].order_count),
      formattedRevenue: new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(result.rows[0].total_revenue)
    };
  }

  validate() {
    const errors = [];
    if (!this.table_id && !this.session_id) {
      errors.push('TableId o SessionId es requerido');
    }
    if (this.items.length === 0) {
      errors.push('Al menos un ítem es requerido');
    }
    return errors;
  }
}

module.exports = Order;