const Recipe = require('../models/Recipe');
const Ingredient = require('../models/Ingredient');

class InventoryService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Procesar consumo de ingredientes al marcar una orden como lista
   * USA TRANSACCIONES SQL para garantizar atomicidad
   * 
   * Si falla el descuento de UN ingrediente, TODOS se revierten (ROLLBACK)
   */
  async processConsumption(orderId, client = null) {
    const useTransaction = !client;

    if (useTransaction) {
      return await this.db.transaction(async (txClient) => {
        return await this._processConsumptionInternal(orderId, txClient);
      });
    }

    return await this._processConsumptionInternal(orderId, client);
  }

  async _processConsumptionInternal(orderId, client) {
    const queryFn = client.query.bind(client);

    const orderResult = await queryFn(
      `SELECT oi.product_id, oi.quantity, p.name as product_name
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      throw new Error(`No se encontraron ítems para la orden ${orderId}`);
    }

    const consumedDetails = [];
    const errors = [];

    for (const item of orderResult.rows) {
      const recipeResult = await queryFn(
        `SELECT r.id as recipe_id, ri.ingredient_id, ri.quantity_required, i.name as ingredient_name, i.stock
         FROM recipes r
         JOIN recipe_ingredients ri ON r.id = ri.recipe_id
         JOIN ingredients i ON ri.ingredient_id = i.id
         WHERE r.product_id = $1`,
        [item.product_id]
      );

      if (recipeResult.rows.length === 0) {
        console.log(`No hay receta para el producto: ${item.product_name}`);
        continue;
      }

      for (const recipeIng of recipeResult.rows) {
        const totalRequired = recipeIng.quantity_required * item.quantity;
        const stockBefore = parseFloat(recipeIng.stock);

        if (stockBefore < totalRequired) {
          errors.push(`Stock insuficiente para ${recipeIng.ingredient_name}. Necesario: ${totalRequired}, Disponible: ${stockBefore}`);
          continue;
        }

        const newStock = stockBefore - totalRequired;

        await queryFn(
          `UPDATE ingredients 
           SET stock = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [newStock, recipeIng.ingredient_id]
        );

        await queryFn(
          `INSERT INTO inventory_logs 
           (ingredient_id, order_id, action, quantity, stock_before, stock_after, reason)
           VALUES ($1, $2, 'remove', $3, $4, $5, $6)`,
          [recipeIng.ingredient_id, orderId, totalRequired, stockBefore, newStock, `Pedido #${orderId} - ${item.product_name} x${item.quantity}`]
        );

        consumedDetails.push({
          ingredient_id: recipeIng.ingredient_id,
          ingredient_name: recipeIng.ingredient_name,
          product_name: item.product_name,
          quantity_ordered: item.quantity,
          quantity_consumed: totalRequired,
          stock_before: stockBefore,
          stock_after: newStock,
          is_low_stock: newStock < (recipeIng.quantity_required * 2)
        });
      }
    }

    if (errors.length > 0) {
      throw new Error(`Errores de stock: ${errors.join('; ')}`);
    }

    return {
      order_id: orderId,
      consumed: consumedDetails,
      has_low_stock_alerts: consumedDetails.some(d => d.is_low_stock),
      consumed_count: consumedDetails.length
    };
  }

  /**
   * Verificar alertas de stock bajo
   */
  async checkLowStockAlerts() {
    const result = await this.db.query(
      `SELECT id, name, stock, unit, low_stock_threshold,
              CASE 
                WHEN stock = 0 THEN 'critical'
                WHEN stock < low_stock_threshold * 0.5 THEN 'critical'
                ELSE 'warning'
              END as severity
       FROM ingredients
       WHERE stock < low_stock_threshold
       ORDER BY stock ASC`
    );

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      current_stock: parseFloat(row.stock),
      threshold: parseFloat(row.low_stock_threshold),
      unit: row.unit,
      severity: row.severity
    }));
  }

  /**
   * Verificar disponibilidad de un producto (stock suficiente para sus ingredientes)
   */
  async checkProductAvailability(productId) {
    const result = await this.db.query(
      `SELECT 
         ri.quantity_required,
         i.id as ingredient_id,
         i.name as ingredient_name,
         i.stock as available_stock
       FROM recipe_ingredients ri
       JOIN ingredients i ON ri.ingredient_id = i.id
       JOIN recipes r ON ri.recipe_id = r.id
       WHERE r.product_id = $1`,
      [productId]
    );

    if (result.rows.length === 0) {
      return { available: true, reason: 'Producto sin receta definida' };
    }

    const missingIngredients = [];

    for (const row of result.rows) {
      if (parseFloat(row.available_stock) < row.quantity_required) {
        missingIngredients.push({
          ingredient_id: row.ingredient_id,
          name: row.ingredient_name,
          required: row.quantity_required,
          available: parseFloat(row.available_stock)
        });
      }
    }

    return {
      available: missingIngredients.length === 0,
      missing_ingredients: missingIngredients
    };
  }

  /**
   * Reabastecer ingrediente (con log de auditoría)
   */
  async restockIngredient(ingredientId, quantity, userId = null, orderId = null) {
    const ingredient = new Ingredient({ id: ingredientId });
    const existing = await ingredient.findById(this.db);
    
    if (!existing) {
      throw new Error(`Ingrediente no encontrado: ${ingredientId}`);
    }

    const stockBefore = existing.stock;
    const updated = await existing.addStock(this.db, quantity);

    await existing.logMovement(
      this.db,
      'add',
      quantity,
      stockBefore,
      updated.stock,
      orderId,
      userId,
      'Reabastecimiento manual'
    );

    return updated;
  }

  /**
   * Ajustar stock directamente (con log de auditoría)
   */
  async adjustStock(ingredientId, newStock, userId = null, reason = null) {
    const ingredient = new Ingredient({ id: ingredientId });
    const existing = await ingredient.findById(this.db);
    
    if (!existing) {
      throw new Error(`Ingrediente no encontrado: ${ingredientId}`);
    }

    const stockBefore = existing.stock;

    const updated = await existing.updateStock(this.db, newStock);

    await existing.logMovement(
      this.db,
      'adjust',
      Math.abs(newStock - stockBefore),
      stockBefore,
      newStock,
      null,
      userId,
      reason || 'Ajuste manual de stock'
    );

    return updated;
  }

  /**
   * Obtener historial de movimientos de inventario
   */
  async getInventoryLogs(ingredientId = null, limit = 100) {
    let query = `
      SELECT il.*, i.name as ingredient_name, u.name as user_name
      FROM inventory_logs il
      JOIN ingredients i ON il.ingredient_id = i.id
      LEFT JOIN users u ON il.user_id = u.id
    `;
    const params = [limit];

    if (ingredientId) {
      query += ' WHERE il.ingredient_id = $2';
      params.push(ingredientId);
    }

    query += ' ORDER BY il.created_at DESC LIMIT $1';

    const result = await this.db.query(query, params);
    return result.rows;
  }
}

module.exports = InventoryService;