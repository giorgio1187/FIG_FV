class Recipe {
  constructor(data = {}) {
    this.id = data.id || null;
    this.product_id = data.product_id || null;
    this.created_at = data.created_at || null;
    this.ingredients = data.ingredients || [];
  }

  toSafeObject() {
    return {
      id: this.id,
      product_id: this.product_id,
      ingredients: this.ingredients
    };
  }

  async findByProductId(db, productId) {
    const result = await db.query(
      `SELECT r.*, 
              COALESCE(json_agg(json_build_object(
                'ingredient_id', ri.ingredient_id,
                'ingredient_name', i.name,
                'quantity_required', ri.quantity_required
              ) ) FILTER (WHERE ri.ingredient_id IS NOT NULL), '[]') as ingredients
       FROM recipes r
       LEFT JOIN recipe_ingredients ri ON r.id = ri.recipe_id
       LEFT JOIN ingredients i ON ri.ingredient_id = i.id
       WHERE r.product_id = $1
       GROUP BY r.id`,
      [productId]
    );
    return result.rows[0] ? new Recipe(result.rows[0]) : null;
  }

  async findById(db) {
    const result = await db.query(
      `SELECT r.*, 
              COALESCE(json_agg(json_build_object(
                'ingredient_id', ri.ingredient_id,
                'ingredient_name', i.name,
                'quantity_required', ri.quantity_required
              ) ) FILTER (WHERE ri.ingredient_id IS NOT NULL), '[]') as ingredients
       FROM recipes r
       LEFT JOIN recipe_ingredients ri ON r.id = ri.recipe_id
       LEFT JOIN ingredients i ON ri.ingredient_id = i.id
       WHERE r.id = $1
       GROUP BY r.id`,
      [this.id]
    );
    return result.rows[0] ? new Recipe(result.rows[0]) : null;
  }

  async findAll(db) {
    const result = await db.query(
      `SELECT r.*, 
              COALESCE(json_agg(json_build_object(
                'ingredient_id', ri.ingredient_id,
                'ingredient_name', i.name,
                'quantity_required', ri.quantity_required
              ) ) FILTER (WHERE ri.ingredient_id IS NOT NULL), '[]') as ingredients
       FROM recipes r
       LEFT JOIN recipe_ingredients ri ON r.id = ri.recipe_id
       LEFT JOIN ingredients i ON ri.ingredient_id = i.id
       GROUP BY r.id`
    );
    return result.rows.map(row => new Recipe(row));
  }

  async save(db) {
    if (this.id) {
      return this.update(db);
    }
    const result = await db.query(
      `INSERT INTO recipes (product_id) VALUES ($1) RETURNING *`,
      [this.product_id]
    );
    return new Recipe(result.rows[0]);
  }

  async addIngredient(db, ingredientId, quantityRequired, client = null) {
    const queryFn = client ? client.query.bind(client) : db.query.bind(db);
    const result = await queryFn(
      `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity_required)
       VALUES ($1, $2, $3)
       ON CONFLICT (recipe_id, ingredient_id) 
       DO UPDATE SET quantity_required = $3
       RETURNING *`,
      [this.id, ingredientId, quantityRequired]
    );
    return result.rows[0];
  }

  async removeIngredient(db, ingredientId, client = null) {
    const queryFn = client ? client.query.bind(client) : db.query.bind(client);
    const result = await queryFn(
      'DELETE FROM recipe_ingredients WHERE recipe_id = $1 AND ingredient_id = $2 RETURNING id',
      [this.id, ingredientId]
    );
    return result.rowCount > 0;
  }

  getTotalIngredients() {
    return this.ingredients.length;
  }

  validate() {
    const errors = [];
    if (!this.product_id) {
      errors.push('ProductId es requerido');
    }
    return errors;
  }
}

module.exports = Recipe;