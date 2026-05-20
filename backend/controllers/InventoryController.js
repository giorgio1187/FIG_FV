const Ingredient = require('../models/Ingredient');

class InventoryController {
  constructor(db, inventoryService) {
    this.db = db;
    this.inventoryService = inventoryService;
  }

  async getAll() {
    try {
      const ingredient = new Ingredient();
      const ingredients = await ingredient.findAll(this.db);
      return { success: true, data: ingredients.map(i => i.toSafeObject()) };
    } catch (error) {
      console.error('Get inventory error:', error);
      return { success: false, error: 'Error al obtener inventario' };
    }
  }

  async getById(id) {
    try {
      const ingredient = new Ingredient({ id });
      const found = await ingredient.findById(this.db);
      if (!found) {
        return { success: false, error: 'Ingrediente no encontrado' };
      }
      return { success: true, data: found.toSafeObject() };
    } catch (error) {
      console.error('Get ingredient error:', error);
      return { success: false, error: 'Error al obtener ingrediente' };
    }
  }

  async add(data) {
    try {
      const ingredient = new Ingredient(data);
      const errors = ingredient.validate();
      if (errors.length > 0) {
        return { success: false, errors };
      }

      const saved = await ingredient.save(this.db);
      return { success: true, data: saved.toSafeObject() };
    } catch (error) {
      console.error('Add ingredient error:', error);
      return { success: false, error: 'Error al agregar ingrediente' };
    }
  }

  async update(id, data) {
    try {
      const ingredient = new Ingredient({ id });
      const existing = await ingredient.findById(this.db);
      if (!existing) {
        return { success: false, error: 'Ingrediente no encontrado' };
      }

      const merged = new Ingredient({ ...existing, ...data });
      const updated = await merged.update(this.db);
      return { success: true, data: updated.toSafeObject() };
    } catch (error) {
      console.error('Update ingredient error:', error);
      return { success: false, error: 'Error al actualizar ingrediente' };
    }
  }

  async delete(id) {
    try {
      const ingredient = new Ingredient({ id });
      const existing = await ingredient.findById(this.db);
      if (!existing) {
        return { success: false, error: 'Ingrediente no encontrado' };
      }

      await existing.delete(this.db);
      return { success: true, message: 'Ingrediente eliminado' };
    } catch (error) {
      console.error('Delete ingredient error:', error);
      return { success: false, error: 'Error al eliminar ingrediente' };
    }
  }

  async updateStock(id, newStock) {
    try {
      const ingredient = new Ingredient({ id });
      const existing = await ingredient.findById(this.db);
      if (!existing) {
        return { success: false, error: 'Ingrediente no encontrado' };
      }

      if (newStock < 0) {
        return { success: false, error: 'Stock no puede ser negativo' };
      }

      const updated = await existing.updateStock(this.db, newStock);
      return { success: true, data: updated.toSafeObject() };
    } catch (error) {
      console.error('Update stock error:', error);
      return { success: false, error: 'Error al actualizar stock' };
    }
  }

  async restock(id, quantity) {
    try {
      const ingredient = new Ingredient({ id });
      const existing = await ingredient.findById(this.db);
      if (!existing) {
        return { success: false, error: 'Ingrediente no encontrado' };
      }

      const updated = await this.inventoryService.restockIngredient(id, quantity);
      return { success: true, data: updated.toSafeObject() };
    } catch (error) {
      console.error('Restock error:', error);
      return { success: false, error: error.message };
    }
  }

  async getLowStockAlerts() {
    try {
      const alerts = await this.inventoryService.checkLowStockAlerts();
      return { success: true, data: alerts };
    } catch (error) {
      console.error('Low stock alerts error:', error);
      return { success: false, error: 'Error al obtener alertas' };
    }
  }

  async checkProductAvailability(productId) {
    try {
      const availability = await this.inventoryService.checkProductAvailability(productId);
      return { success: true, data: availability };
    } catch (error) {
      console.error('Check availability error:', error);
      return { success: false, error: 'Error al verificar disponibilidad' };
    }
  }
}

module.exports = InventoryController;