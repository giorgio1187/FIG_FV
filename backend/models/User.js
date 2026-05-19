class User {
  constructor(data = {}) {
    this.id = data.id || null;
    this.username = data.username || '';
    this.password = data.password || '';
    this.name = data.name || '';
    this.role = data.role || 'waiter';
    this.is_active = data.is_active !== undefined ? data.is_active : true;
    this.station = data.station || '';
    this.created_at = data.created_at || null;
    this.updated_at = data.updated_at || null;
  }

  static get VALID_ROLES() {
    return ['admin', 'waiter', 'chef'];
  }

  toSafeObject() {
    return {
      id: this.id,
      username: this.username,
      name: this.name,
      role: this.role,
      is_active: this.is_active,
      station: this.station
    };
  }

  async findByUsername(db) {
    const result = await db.query(
      'SELECT * FROM users WHERE username = $1',
      [this.username]
    );
    return result.rows[0] ? new User(result.rows[0]) : null;
  }

  async findById(db) {
    const result = await db.query(
      'SELECT * FROM users WHERE id = $1',
      [this.id]
    );
    return result.rows[0] ? new User(result.rows[0]) : null;
  }

  async findAll(db) {
    const result = await db.query(
      'SELECT id, username, name, role, is_active, station, created_at, updated_at FROM users ORDER BY created_at DESC'
    );
    return result.rows.map(row => new User(row));
  }

  async save(db) {
    if (this.id) {
      return this.update(db);
    }
    const result = await db.query(
      `INSERT INTO users (username, password, name, role, is_active, station)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [this.username, this.password, this.name, this.role, this.is_active, this.station]
    );
    return new User(result.rows[0]);
  }

  async update(db) {
    const result = await db.query(
      `UPDATE users SET
        username = COALESCE(NULLIF($2, ''), username),
        password = COALESCE(NULLIF($3, ''), password),
        name = COALESCE(NULLIF($4, ''), name),
        role = COALESCE(NULLIF($5, ''), role),
        is_active = $6,
        station = COALESCE(NULLIF($7, ''), station),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [this.id, this.username, this.password, this.name, this.role, this.is_active, this.station]
    );
    return result.rows[0] ? new User(result.rows[0]) : null;
  }

  async delete(db) {
    const result = await db.query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [this.id]
    );
    return result.rowCount > 0;
  }

  async toggleStatus(db) {
    const result = await db.query(
      `UPDATE users 
       SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [this.id]
    );
    return result.rows[0] ? new User(result.rows[0]) : null;
  }

  validate() {
    const errors = [];
    if (!this.username || this.username.trim().length === 0) {
      errors.push('Username es requerido');
    }
    if (!this.password || this.password.length < 6) {
      errors.push('Password debe tener al menos 6 caracteres');
    }
    if (!this.name || this.name.trim().length === 0) {
      errors.push('Nombre es requerido');
    }
    if (!User.VALID_ROLES.includes(this.role)) {
      errors.push(`Rol inválido. Debe ser: ${User.VALID_ROLES.join(', ')}`);
    }
    return errors;
  }
}

module.exports = User;