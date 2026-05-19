const Order = require('../models/Order');

class OrderController {
  constructor(db, inventoryService) {
    this.db = db;
    this.inventoryService = inventoryService;
  }

  async getAll(filters = {}) {
    try {
      const order = new Order();
      const orders = await order.findAll(this.db, filters);
      return { success: true, data: orders.map(o => o.toSafeObject()) };
    } catch (error) {
      console.error('Get orders error:', error);
      return { success: false, error: 'Error al obtener órdenes' };
    }
  }

  async getById(id) {
    try {
      const order = new Order({ id });
      const found = await order.findById(this.db);
      if (!found) {
        return { success: false, error: 'Orden no encontrada' };
      }
      return { success: true, data: found.toSafeObject() };
    } catch (error) {
      console.error('Get order error:', error);
      return { success: false, error: 'Error al obtener orden' };
    }
  }

  async create(data) {
    try {
      const items = data.items.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        subtotal: item.quantity * item.unit_price,
        notes: item.notes || null
      }));

      const order = new Order({
        table_id: data.table_id,
        session_id: data.session_id,
        user_id: data.user_id,
        items: items,
        notes: data.notes || null
      });

      const errors = order.validate();
      if (errors.length > 0) {
        return { success: false, errors };
      }

      const saved = await order.save(this.db);

      await this.db.query(
        `UPDATE restaurant_tables 
         SET status = 'occupied', updated_at = CURRENT_TIMESTAMP 
         WHERE id = $1`,
        [data.table_id]
      );

      const fullOrder = await order.findById(this.db);
      return { success: true, data: fullOrder.toSafeObject() };
    } catch (error) {
      console.error('Create order error:', error);
      return { success: false, error: 'Error al crear orden' };
    }
  }

  async sendToKitchen(orderId) {
    try {
      const order = new Order({ id: orderId });
      const existing = await order.findById(this.db);
      if (!existing) {
        return { success: false, error: 'Orden no encontrada' };
      }

      if (existing.status !== 'pending') {
        return { success: false, error: 'La orden ya fue enviada a cocina' };
      }

      for (const item of existing.items) {
        const availability = await this.inventoryService.checkProductAvailability(item.product_id);
        if (!availability.available) {
          return {
            success: false,
            error: `Stock insuficiente para ${item.product_name}`,
            missing: availability.missing_ingredients
          };
        }
      }

      const updated = await existing.updateStatus(this.db, 'preparing');
      return { success: true, data: updated.toSafeObject() };
    } catch (error) {
      console.error('Send to kitchen error:', error);
      return { success: false, error: 'Error al enviar a cocina' };
    }
  }

  async markAsReady(orderId) {
    try {
      const order = new Order({ id: orderId });
      const existing = await order.findById(this.db);
      if (!existing) {
        return { success: false, error: 'Orden no encontrada' };
      }

      if (existing.status !== 'preparing') {
        return { success: false, error: 'La orden no está en preparación' };
      }

      const consumptionResult = await this.inventoryService.processConsumption(orderId);

      const updated = await existing.updateStatus(this.db, 'ready');

      return {
        success: true,
        data: updated.toSafeObject(),
        consumption: consumptionResult
      };
    } catch (error) {
      console.error('Mark as ready error:', error);
      return { success: false, error: error.message };
    }
  }

  async deliver(orderId) {
    try {
      const order = new Order({ id: orderId });
      const existing = await order.findById(this.db);
      if (!existing) {
        return { success: false, error: 'Orden no encontrada' };
      }

      if (existing.status !== 'ready') {
        return { success: false, error: 'La orden no está lista para entregar' };
      }

      const updated = await existing.updateStatus(this.db, 'delivered');
      return { success: true, data: updated.toSafeObject() };
    } catch (error) {
      console.error('Deliver order error:', error);
      return { success: false, error: 'Error al marcar como entregado' };
    }
  }

  async processPayment(orderId) {
    try {
      const order = new Order({ id: orderId });
      const existing = await order.findById(this.db);
      if (!existing) {
        return { success: false, error: 'Orden no encontrada' };
      }

      if (existing.status !== 'ready' && existing.status !== 'delivered') {
        return { success: false, error: 'La orden no está lista para pagar' };
      }

      const updated = await existing.updateStatus(this.db, 'paid');

      if (existing.table_id) {
        await this.db.query(
          `UPDATE restaurant_tables 
           SET status = 'available', updated_at = CURRENT_TIMESTAMP 
           WHERE id = $1`,
          [existing.table_id]
        );
      }

      if (existing.session_id) {
        await this.db.query(
          `UPDATE restaurant_tables 
           SET status = 'available', updated_at = CURRENT_TIMESTAMP 
           WHERE id IN (
             SELECT main_table_id FROM table_groups WHERE session_id = $1
           )`,
          [existing.session_id]
        );
      }

      return {
        success: true,
        data: updated.toSafeObject(),
        total: existing.total
      };
    } catch (error) {
      console.error('Process payment error:', error);
      return { success: false, error: 'Error al procesar pago' };
    }
  }

  async cancel(orderId) {
    try {
      const order = new Order({ id: orderId });
      const existing = await order.findById(this.db);
      if (!existing) {
        return { success: false, error: 'Orden no encontrada' };
      }

      if (['paid', 'delivered'].includes(existing.status)) {
        return { success: false, error: 'No se puede cancelar una orden pagada o entregada' };
      }

      if (existing.status === 'preparing' || existing.status === 'ready') {
        return { success: false, error: 'No se puede cancelar una orden en preparación. Use la opción de devolución.' };
      }

      const updated = await existing.updateStatus(this.db, 'cancelled');

      if (existing.table_id) {
        const hasOtherOrders = await this.db.query(
          `SELECT COUNT(*) as count FROM orders 
           WHERE table_id = $1 AND status NOT IN ('paid', 'cancelled') AND id != $2`,
          [existing.table_id, orderId]
        );

        if (parseInt(hasOtherOrders.rows[0].count) === 0) {
          await this.db.query(
            `UPDATE restaurant_tables 
             SET status = 'available', updated_at = CURRENT_TIMESTAMP 
             WHERE id = $1`,
            [existing.table_id]
          );
        }
      }

      return { success: true, data: updated.toSafeObject() };
    } catch (error) {
      console.error('Cancel order error:', error);
      return { success: false, error: 'Error al cancelar orden' };
    }
  }

  async getKDSOrders() {
    try {
      const order = new Order();
      const orders = await order.findKDSOrders(this.db);
      return { success: true, data: orders };
    } catch (error) {
      console.error('Get KDS orders error:', error);
      return { success: false, error: 'Error al obtener pedidos de cocina' };
    }
  }

  async getPendingPayment() {
    try {
      const order = new Order();
      const orders = await order.findPendingPayment(this.db);
      return { success: true, data: orders.map(o => o.toSafeObject()) };
    } catch (error) {
      console.error('Get pending payment error:', error);
      return { success: false, error: 'Error al obtener cuentas pendientes' };
    }
  }

  async getDailyRevenue(date = null) {
    try {
      const order = new Order();
      const revenue = await order.getDailyRevenue(this.db, date);
      return { success: true, data: revenue };
    } catch (error) {
      console.error('Get daily revenue error:', error);
      return { success: false, error: 'Error al obtener ingresos' };
    }
  }
}

module.exports = OrderController;