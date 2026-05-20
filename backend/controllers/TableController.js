const RestaurantTable = require('../models/RestaurantTable');

class TableController {
  constructor(db) {
    this.db = db;
  }

  async getAll() {
    try {
      const table = new RestaurantTable();
      const tables = await table.findAll(this.db);
      return { success: true, data: tables.map(t => t.toSafeObject()) };
    } catch (error) {
      console.error('Get tables error:', error);
      return { success: false, error: 'Error al obtener mesas' };
    }
  }

  async getById(id) {
    try {
      const table = new RestaurantTable({ id });
      const found = await table.findById(this.db);
      if (!found) {
        return { success: false, error: 'Mesa no encontrada' };
      }
      return { success: true, data: found.toSafeObject() };
    } catch (error) {
      console.error('Get table error:', error);
      return { success: false, error: 'Error al obtener mesa' };
    }
  }

  async getAvailable() {
    try {
      const table = new RestaurantTable();
      const tables = await table.findAvailable(this.db);
      return { success: true, data: tables.map(t => t.toSafeObject()) };
    } catch (error) {
      console.error('Get available tables error:', error);
      return { success: false, error: 'Error al obtener mesas disponibles' };
    }
  }

  async create(data) {
    try {
      const table = new RestaurantTable(data);
      const errors = table.validate();
      if (errors.length > 0) {
        return { success: false, errors };
      }

      const existing = await table.findByTableNumber(this.db, data.table_number);
      if (existing) {
        return { success: false, error: 'Ya existe una mesa con ese número' };
      }

      const saved = await table.save(this.db);
      return { success: true, data: saved.toSafeObject() };
    } catch (error) {
      console.error('Create table error:', error);
      return { success: false, error: 'Error al crear mesa' };
    }
  }

  async update(id, data) {
    try {
      const table = new RestaurantTable({ id });
      const existing = await table.findById(this.db);
      if (!existing) {
        return { success: false, error: 'Mesa no encontrada' };
      }

      if (data.table_number && data.table_number !== existing.table_number) {
        const numberCheck = await table.findByTableNumber(this.db, data.table_number);
        if (numberCheck) {
          return { success: false, error: 'Ya existe una mesa con ese número' };
        }
      }

      const updated = await existing.update(this.db);
      return { success: true, data: updated.toSafeObject() };
    } catch (error) {
      console.error('Update table error:', error);
      return { success: false, error: 'Error al actualizar mesa' };
    }
  }

  async editTable(id, data) {
    try {
      const table = new RestaurantTable({ id });
      const existing = await table.findById(this.db);
      if (!existing) {
        return { success: false, error: 'Mesa no encontrada' };
      }

      if (data.capacity !== undefined) {
        if (data.capacity < 1) {
          return { success: false, error: 'La capacidad debe ser al menos 1' };
        }
      }

      if (data.status !== undefined) {
        if (!RestaurantTable.VALID_STATUSES.includes(data.status)) {
          return { success: false, error: `Estado inválido: ${data.status}` };
        }
      }

      const updateData = { ...existing };
      if (data.capacity !== undefined) updateData.capacity = data.capacity;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.position_x !== undefined) updateData.position_x = data.position_x;
      if (data.position_y !== undefined) updateData.position_y = data.position_y;

      const updated = await updateData.update(this.db);
      return { success: true, data: updated.toSafeObject() };
    } catch (error) {
      console.error('Edit table error:', error);
      return { success: false, error: 'Error al editar mesa' };
    }
  }

  async updateStatus(id, status) {
    try {
      const table = new RestaurantTable({ id });
      const existing = await table.findById(this.db);
      if (!existing) {
        return { success: false, error: 'Mesa no encontrada' };
      }

      if (!RestaurantTable.VALID_STATUSES.includes(status)) {
        return { success: false, error: `Estado inválido: ${status}` };
      }

      const updated = await existing.updateStatus(this.db, status);
      return { success: true, data: updated.toSafeObject() };
    } catch (error) {
      console.error('Update table status error:', error);
      return { success: false, error: 'Error al actualizar estado' };
    }
  }

  async mergeTables(tableIds, mainTableId = null) {
    try {
      if (!Array.isArray(tableIds) || tableIds.length < 2) {
        return { success: false, error: 'Se requieren al menos 2 mesas para fusionar' };
      }

      let mainTable;
      if (mainTableId) {
        mainTable = new RestaurantTable({ id: mainTableId });
        mainTable = await mainTable.findById(this.db);
      } else {
        mainTable = new RestaurantTable({ id: tableIds[0] });
        mainTable = await mainTable.findById(this.db);
      }

      if (!mainTable) {
        return { success: false, error: 'Mesa principal no encontrada' };
      }

      const merged = await mainTable.mergeTables(this.db, tableIds);
      return { success: true, data: merged };
    } catch (error) {
      console.error('Merge tables error:', error);
      return { success: false, error: 'Error al fusionar mesas' };
    }
  }

  async unmergeTable(tableId, sessionId) {
    try {
      const table = new RestaurantTable({ id: tableId });
      const existing = await table.findById(this.db);
      if (!existing) {
        return { success: false, error: 'Mesa no encontrada' };
      }

      const result = await table.unmergeTable(this.db, tableId, sessionId);
      return { success: true, data: result };
    } catch (error) {
      console.error('Unmerge table error:', error);
      return { success: false, error: 'Error al separar mesa' };
    }
  }

  async getTableGroup(sessionId) {
    try {
      const table = new RestaurantTable();
      const tables = await table.getTableGroup(this.db, sessionId);
      return { success: true, data: tables.map(t => t.toSafeObject()) };
    } catch (error) {
      console.error('Get table group error:', error);
      return { success: false, error: 'Error al obtener grupo de mesas' };
    }
  }

  async delete(id) {
    try {
      const table = new RestaurantTable({ id });
      const existing = await table.findById(this.db);
      if (!existing) {
        return { success: false, error: 'Mesa no encontrada' };
      }

      if (existing.status === 'occupied') {
        return { success: false, error: 'No se puede eliminar una mesa ocupada' };
      }

      await existing.delete(this.db);
      return { success: true, message: 'Mesa eliminada' };
    } catch (error) {
      console.error('Delete table error:', error);
      return { success: false, error: 'Error al eliminar mesa' };
    }
  }
}

module.exports = TableController;