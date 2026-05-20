class RestaurantTable {
  constructor(data = {}) {
    this.id = data.id || null;
    this.table_number = data.table_number || null;
    this.capacity = data.capacity || 4;
    this.status = data.status || 'available';
    this.position_x = data.position_x || null;
    this.position_y = data.position_y || null;
    this.created_at = data.created_at || null;
    this.updated_at = data.updated_at || null;
  }

  static get VALID_STATUSES() {
    return ['available', 'occupied', 'reserved', 'maintenance'];
  }

  toSafeObject() {
    return {
      id: this.id,
      table_number: this.table_number,
      capacity: this.capacity,
      status: this.status,
      position_x: this.position_x,
      position_y: this.position_y
    };
  }

  async findById(db) {
    const result = await db.query(
      'SELECT * FROM restaurant_tables WHERE id = $1',
      [this.id]
    );
    return result.rows[0] ? new RestaurantTable(result.rows[0]) : null;
  }

  async findByTableNumber(db, tableNumber) {
    const result = await db.query(
      'SELECT * FROM restaurant_tables WHERE table_number = $1',
      [tableNumber]
    );
    return result.rows[0] ? new RestaurantTable(result.rows[0]) : null;
  }

  async findAll(db) {
    const result = await db.query(
      'SELECT * FROM restaurant_tables ORDER BY table_number ASC'
    );
    return result.rows.map(row => new RestaurantTable(row));
  }

  async findAvailable(db) {
    const result = await db.query(
      `SELECT * FROM restaurant_tables 
       WHERE status = 'available' 
       ORDER BY table_number ASC`
    );
    return result.rows.map(row => new RestaurantTable(row));
  }

  async save(db) {
    if (this.id) {
      return this.update(db);
    }
    const result = await db.query(
      `INSERT INTO restaurant_tables (table_number, capacity, status, position_x, position_y)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [this.table_number, this.capacity, this.status, this.position_x, this.position_y]
    );
    return new RestaurantTable(result.rows[0]);
  }

  async update(db) {
    const result = await db.query(
      `UPDATE restaurant_tables SET
        table_number = $2,
        capacity = $3,
        status = $4,
        position_x = $5,
        position_y = $6,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [this.id, this.table_number, this.capacity, this.status, this.position_x, this.position_y]
    );
    return result.rows[0] ? new RestaurantTable(result.rows[0]) : null;
  }

  async updateStatus(db, newStatus, client = null) {
    const queryFn = client ? client.query.bind(client) : db.query.bind(db);
    const result = await queryFn(
      `UPDATE restaurant_tables 
       SET status = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [this.id, newStatus]
    );
    return result.rows[0] ? new RestaurantTable(result.rows[0]) : null;
  }

  async delete(db) {
    const result = await db.query(
      'DELETE FROM restaurant_tables WHERE id = $1 RETURNING id',
      [this.id]
    );
    return result.rowCount > 0;
  }

  /**
   * MERGE TABLES - Agrupar múltiples mesas bajo una sesión temporal
   * 
   * Esta función permite unir varias mesas físicas bajo un mismo session_id
   * para que los pedidos de todas las mesas se agrupen en una sola cuenta.
   * 
   * Ejemplo de uso:
   * - Mesa 1 y Mesa 2 se unen para una fiesta grande
   * - Todas las órdenes de ambas mesas se agruparán con el mismo session_id
   * - Al pagar, se cierra la cuenta de todas las mesas juntas
   * 
   * La consulta SQL:
   * 1. Crea un nuevo session_id para el grupo
   * 2. Inserta registros en table_groups vinculando todas las mesas
   * 3. Actualiza el estado de las mesas a 'occupied'
   * 4. Actualiza cualquier orden existente de las mesas al nuevo session_id
   */
  async mergeTables(db, tableIds, sessionId = null) {
    const newSessionId = sessionId || `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return await db.transaction(async (client) => {
      const addedTables = [];

      for (const tableId of tableIds) {
        if (tableId === this.id) continue;

        const tableResult = await client.query(
          `INSERT INTO table_groups (session_id, main_table_id)
           VALUES ($1, $2)
           ON CONFLICT (session_id, main_table_id) DO NOTHING
           RETURNING *`,
          [newSessionId, tableId]
        );

        if (tableResult.rows.length > 0) {
          addedTables.push(tableId);

          await client.query(
            `UPDATE restaurant_tables 
             SET status = 'occupied', updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND status = 'available'`,
            [tableId]
          );
        }
      }

      await client.query(
        `UPDATE restaurant_tables 
         SET status = 'occupied', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [this.id]
      );
      addedTables.push(this.id);

      await client.query(
        `UPDATE orders 
         SET session_id = $1
         WHERE table_id = ANY($2) AND status NOT IN ('paid', 'cancelled')`,
        [newSessionId, addedTables]
      );

      return {
        session_id: newSessionId,
        merged_tables: addedTables,
        main_table: this.toSafeObject()
      };
    });
  }

  /**
   * Obtener todas las mesas de un grupo
   */
  async getTableGroup(db, sessionId) {
    const result = await db.query(
      `SELECT rt.* FROM restaurant_tables rt
       JOIN table_groups tg ON rt.id = tg.main_table_id
       WHERE tg.session_id = $1
       UNION
       SELECT rt.* FROM restaurant_tables rt
       WHERE rt.id IN (
         SELECT main_table_id FROM table_groups WHERE session_id = $1
       )
       ORDER BY table_number`,
      [sessionId]
    );
    return result.rows.map(row => new RestaurantTable(row));
  }

  /**
   * Separar mesa de un grupo (devolver a disponible)
   */
  async unmergeTable(db, tableId, sessionId) {
    return await db.transaction(async (client) => {
      await client.query(
        `DELETE FROM table_groups 
         WHERE session_id = $1 AND main_table_id = $2`,
        [sessionId, tableId]
      );

      const remainingTables = await client.query(
        `SELECT COUNT(*) as count FROM table_groups WHERE session_id = $1`,
        [sessionId]
      );

      if (parseInt(remainingTables.rows[0].count) === 0) {
        const orderCheck = await client.query(
          `SELECT COUNT(*) as count FROM orders 
           WHERE session_id = $1 AND status NOT IN ('paid', 'cancelled')`,
          [sessionId]
        );
        
        if (parseInt(orderCheck.rows[0].count) === 0) {
          await client.query(
            `UPDATE restaurant_tables 
             SET status = 'available', updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [tableId]
          );
        }
      }

      return { success: true, table_id: tableId };
    });
  }

  validate() {
    const errors = [];
    if (!this.table_number) {
      errors.push('Número de mesa es requerido');
    }
    if (this.capacity < 1) {
      errors.push('Capacidad debe ser al menos 1');
    }
    if (!RestaurantTable.VALID_STATUSES.includes(this.status)) {
      errors.push(`Estado inválido. Debe ser: ${RestaurantTable.VALID_STATUSES.join(', ')}`);
    }
    return errors;
  }
}

module.exports = RestaurantTable;