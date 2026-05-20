const bcrypt = require('bcryptjs');
const User = require('../models/User');

class AdminController {
  constructor(db) {
    this.db = db;
  }

  async getAllUsers() {
    try {
      const user = new User();
      const users = await user.findAll(this.db);
      return { success: true, data: users.map(u => u.toSafeObject()) };
    } catch (error) {
      console.error('Get users error:', error);
      return { success: false, error: 'Error al obtener usuarios' };
    }
  }

  async getUserById(id) {
    try {
      const user = new User({ id });
      const found = await user.findById(this.db);
      if (!found) {
        return { success: false, error: 'Usuario no encontrado' };
      }
      return { success: true, data: found.toSafeObject() };
    } catch (error) {
      console.error('Get user error:', error);
      return { success: false, error: 'Error al obtener usuario' };
    }
  }

  async addUser(data) {
    try {
      const hashedPassword = await bcrypt.hash(data.password, 10);

      const user = new User({
        username: data.username,
        password: hashedPassword,
        name: data.name,
        role: data.role,
        station: data.station || '',
        is_active: true
      });

      const errors = user.validate();
      if (errors.length > 0) {
        return { success: false, errors };
      }

      const existing = await user.findByUsername(this.db);
      if (existing) {
        return { success: false, error: 'El nombre de usuario ya existe' };
      }

      const saved = await user.save(this.db);
      return { success: true, data: saved.toSafeObject() };
    } catch (error) {
      console.error('Add user error:', error);
      return { success: false, error: 'Error al agregar usuario' };
    }
  }

  async editUser(id, data) {
    try {
      const user = new User({ id });
      const existing = await user.findById(this.db);
      if (!existing) {
        return { success: false, error: 'Usuario no encontrado' };
      }

      if (data.username && data.username !== existing.username) {
        const usernameCheck = new User({ username: data.username });
        const duplicate = await usernameCheck.findByUsername(this.db);
        if (duplicate) {
          return { success: false, error: 'El nombre de usuario ya existe' };
        }
      }

      const updateData = { ...existing };
      if (data.username) updateData.username = data.username;
      if (data.name) updateData.name = data.name;
      if (data.role) updateData.role = data.role;
      if (data.station !== undefined) updateData.station = data.station;
      if (data.is_active !== undefined) updateData.is_active = data.is_active;

      if (data.password && data.password.trim() !== '') {
        updateData.password = await bcrypt.hash(data.password, 10);
      }

      const updated = await updateData.update(this.db);
      return { success: true, data: updated.toSafeObject() };
    } catch (error) {
      console.error('Edit user error:', error);
      return { success: false, error: 'Error al editar usuario' };
    }
  }

  async deleteUser(id) {
    try {
      const user = new User({ id });
      const existing = await user.findById(this.db);
      if (!existing) {
        return { success: false, error: 'Usuario no encontrado' };
      }

      if (existing.username === 'admin') {
        return { success: false, error: 'No se puede eliminar la cuenta de administrador principal' };
      }

      await existing.delete(this.db);
      return { success: true, message: 'Usuario eliminado' };
    } catch (error) {
      console.error('Delete user error:', error);
      return { success: false, error: 'Error al eliminar usuario' };
    }
  }

  async toggleUserStatus(id) {
    try {
      const user = new User({ id });
      const existing = await user.findById(this.db);
      if (!existing) {
        return { success: false, error: 'Usuario no encontrado' };
      }

      if (existing.username === 'admin') {
        return { success: false, error: 'No se puede desactivar la cuenta de administrador principal' };
      }

      const updated = await existing.toggleStatus(this.db);
      return { success: true, data: updated.toSafeObject() };
    } catch (error) {
      console.error('Toggle user status error:', error);
      return { success: false, error: 'Error al cambiar estado' };
    }
  }

  async getStats() {
    try {
      const usersResult = await this.db.query(
        'SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM users'
      );

      const ingredientsResult = await this.db.query(
        'SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE stock < low_stock_threshold) as low_stock FROM ingredients'
      );

      const today = new Date().toISOString().split('T')[0];
      const ordersResult = await this.db.query(
        `SELECT 
           COUNT(*) as total_orders,
           COUNT(*) FILTER (WHERE status = 'paid') as completed_orders,
           COALESCE(SUM(total) FILTER (WHERE DATE(paid_at) = $1 AND status = 'paid'), 0) as daily_revenue
         FROM orders`,
        [today]
      );

      return {
        success: true,
        data: {
          users: {
            total: parseInt(usersResult.rows[0].total),
            active: parseInt(usersResult.rows[0].active)
          },
          ingredients: {
            total: parseInt(ingredientsResult.rows[0].total),
            low_stock: parseInt(ingredientsResult.rows[0].low_stock)
          },
          orders: {
            today_total: parseInt(ordersResult.rows[0].total_orders),
            completed: parseInt(ordersResult.rows[0].completed_orders),
            daily_revenue: parseFloat(ordersResult.rows[0].daily_revenue),
            formatted_revenue: new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(ordersResult.rows[0].daily_revenue)
          }
        }
      };
    } catch (error) {
      console.error('Get stats error:', error);
      return { success: false, error: 'Error al obtener estadísticas' };
    }
  }
}

module.exports = AdminController;