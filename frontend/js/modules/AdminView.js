class AdminView {
  constructor(api, toast) {
    this.api = api;
    this.toast = toast;
    this.inventory = [];
    this.users = [];
    this.pendingPayments = [];
    this.stats = null;

    this.inventoryTableBody = document.getElementById('inventory-table-body');
    this.usersTableBody = document.getElementById('users-table-body');
    this.totalRevenue = document.getElementById('total-revenue');
    this.adminOrdersCount = document.getElementById('admin-orders-count');
    this.adminActiveUsers = document.getElementById('admin-active-users');
    this.adminLowStock = document.getElementById('admin-low-stock');
    this.paymentPendingList = document.getElementById('payment-pending-list');
    this.btnAddUser = document.getElementById('btn-add-user');

    this._bindEvents();
  }

  _bindEvents() {
    if (this.btnAddUser) {
      this.btnAddUser.addEventListener('click', () => this._showAddUserModal());
    }
  }

  async loadData() {
    try {
      const [inventoryRes, usersRes, pendingRes, statsRes] = await Promise.all([
        this.api.getInventory(),
        this.api.getUsers(),
        this.api.getPendingPaymentOrders(),
        this.api.getStats()
      ]);

      if (inventoryRes.success) this.inventory = inventoryRes.data;
      if (usersRes.success) this.users = usersRes.data;
      if (pendingRes.success) this.pendingPayments = pendingRes.data;
      if (statsRes.success) this.stats = statsRes.data;

      this.renderInventory();
      this.renderUsers();
      this.renderDashboard();
      this.renderPendingPayments();
    } catch (error) {
      console.error('Load admin data error:', error);
      this.toast.show('Error al cargar datos', 'error');
    }
  }

  renderInventory() {
    if (!this.inventoryTableBody) return;

    this.inventoryTableBody.innerHTML = this.inventory.map(item => {
      const isLow = item.stock < item.low_stock_threshold;
      return `
        <tr class="hover:bg-surface-container transition-colors">
          <td class="p-4 font-semibold text-on-surface">${item.name}</td>
          <td class="p-4">
            <span class="px-2 py-1 rounded-full text-[10px] font-bold ${isLow ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}">
              ${isLow ? 'Crítico' : 'Óptimo'}
            </span>
          </td>
          <td class="p-4 text-right font-headline font-bold text-on-surface-variant">${item.stock} ${item.unit}</td>
          <td class="p-4 text-right">
            <button onclick="app.adminView.restockIngredient('${item.id}')" class="text-tertiary hover:text-on-surface font-bold text-xs px-3 py-1 bg-surface-container rounded hover:bg-surface-container-highest transition-colors">
              + Añadir 10
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  renderUsers() {
    if (!this.usersTableBody) return;

    const roleLabels = { admin: 'Admin', waiter: 'Garzón', chef: 'Chef' };

    this.usersTableBody.innerHTML = this.users.map(user => `
      <tr class="hover:bg-surface-container transition-colors">
        <td class="p-4">
          <div class="font-semibold text-on-surface">${user.name}</div>
          <div class="text-xs text-on-surface-variant">${user.username}</div>
        </td>
        <td class="p-4">
          <span class="px-2 py-1 rounded-full text-[10px] font-bold bg-surface-container text-on-surface-variant">
            ${roleLabels[user.role] || user.role}
          </span>
        </td>
        <td class="p-4">
          <span class="px-2 py-1 rounded-full text-[10px] font-bold ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}">
            ${user.is_active ? 'Activo' : 'Inactivo'}
          </span>
        </td>
        <td class="p-4 text-right">
          <div class="flex justify-end gap-2">
            <button onclick="app.adminView._showEditUserModal('${user.id}')" class="text-tertiary hover:text-on-surface font-bold text-xs px-3 py-1 bg-surface-container rounded hover:bg-surface-container-highest transition-colors">
              Editar
            </button>
            <button onclick="app.adminView.toggleUserStatus('${user.id}')" class="${user.is_active ? 'text-red-600' : 'text-green-600'} hover:text-on-surface font-bold text-xs px-3 py-1 bg-surface-container rounded hover:bg-surface-container-highest transition-colors">
              ${user.is_active ? 'Desactivar' : 'Activar'}
            </button>
            ${user.username !== 'admin' ? `
              <button onclick="app.adminView.deleteUser('${user.id}')" class="text-red-600 hover:text-red-800 font-bold text-xs px-3 py-1 bg-surface-container rounded hover:bg-red-100 transition-colors">Eliminar</button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  }

  renderDashboard() {
    if (!this.stats) return;

    if (this.totalRevenue) this.totalRevenue.innerText = this.stats.orders?.formatted_revenue || '$0';
    if (this.adminOrdersCount) this.adminOrdersCount.innerText = this.stats.orders?.completed || 0;
    if (this.adminActiveUsers) this.adminActiveUsers.innerText = this.stats.users?.active || 0;
    if (this.adminLowStock) this.adminLowStock.innerText = this.stats.ingredients?.low_stock || 0;
  }

  renderPendingPayments() {
    if (!this.paymentPendingList) return;

    if (this.pendingPayments.length === 0) {
      this.paymentPendingList.innerHTML = `<p class="text-center text-on-surface-variant py-8 text-sm">No hay cuentas pendientes.</p>`;
      return;
    }

    this.paymentPendingList.innerHTML = this.pendingPayments.map(order => {
      const orderTotal = order.total;
      return `
        <div class="p-4 rounded-xl bg-surface-container flex justify-between items-center group border border-surface-container-highest">
          <div>
            <div class="text-[10px] font-bold uppercase text-on-surface-variant">Ticket Mesa ${order.table_id}</div>
            <div class="text-lg font-headline font-bold text-on-surface">${this.formatCurrency(orderTotal)}</div>
          </div>
          <button onclick="app.adminView.processPayment('${order.id}')" class="bg-surface-container-highest group-hover:bg-primary group-hover:text-on-primary px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2">
            <i data-lucide="wallet" class="w-4 h-4"></i> PAGAR
          </button>
        </div>
      `;
    }).join('');

    lucide.createIcons();
  }

  async restockIngredient(id) {
    try {
      const result = await this.api.restockIngredient(id, 10);
      if (result.success) {
        this.toast.show(`Bodega actualizada: ${result.data.name}`);
        await this.loadData();
      } else {
        this.toast.show(result.error || 'Error al reabastecer', 'error');
      }
    } catch (error) {
      this.toast.show('Error al reabastecer', 'error');
    }
  }

  async processPayment(orderId) {
    try {
      const result = await this.api.processPayment(orderId);
      if (result.success) {
        this.toast.show('Pago procesado. Mesa liberada.');
        await this.loadData();
      } else {
        this.toast.show(result.error || 'Error al procesar pago', 'error');
      }
    } catch (error) {
      this.toast.show('Error al procesar pago', 'error');
    }
  }

  async toggleUserStatus(userId) {
    try {
      const result = await this.api.toggleUserStatus(userId);
      if (result.success) {
        const action = result.data.is_active ? 'activado' : 'desactivado';
        this.toast.show(`Usuario ${result.data.name} ${action}`);
        await this.loadData();
      } else {
        this.toast.show(result.error || 'Error al cambiar estado', 'error');
      }
    } catch (error) {
      this.toast.show('Error al cambiar estado', 'error');
    }
  }

  async deleteUser(userId) {
    if (!confirm('¿Eliminar este usuario?')) return;

    try {
      const result = await this.api.deleteUser(userId);
      if (result.success) {
        this.toast.show('Usuario eliminado');
        await this.loadData();
      } else {
        this.toast.show(result.error || 'Error al eliminar usuario', 'error');
      }
    } catch (error) {
      this.toast.show('Error al eliminar usuario', 'error');
    }
  }

  _showAddUserModal() {
    const content = `
      <div class="flex justify-between items-center mb-6">
        <h3 class="font-headline text-xl font-bold">Nuevo Usuario</h3>
        <button onclick="app.viewManager.hideModal()" class="text-on-surface-variant hover:text-on-surface">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>
      <form id="add-user-form" class="space-y-4">
        <div>
          <label class="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1">Nombre</label>
          <input type="text" id="new-user-name" class="w-full px-4 py-3 rounded-xl bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary/50 font-medium" required>
        </div>
        <div>
          <label class="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1">Usuario</label>
          <input type="text" id="new-user-username" class="w-full px-4 py-3 rounded-xl bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary/50 font-medium" required>
        </div>
        <div>
          <label class="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1">Contraseña</label>
          <input type="password" id="new-user-password" class="w-full px-4 py-3 rounded-xl bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary/50 font-medium" required minlength="6">
        </div>
        <div>
          <label class="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1">Rol</label>
          <select id="new-user-role" class="w-full px-4 py-3 rounded-xl bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary/50 font-medium">
            <option value="waiter">Garzón</option>
            <option value="chef">Chef</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1">Estación</label>
          <input type="text" id="new-user-station" class="w-full px-4 py-3 rounded-xl bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary/50 font-medium">
        </div>
        <button type="submit" class="w-full btn-gradient py-4 text-on-primary font-bold rounded-xl shadow-lg active:scale-95 transition-transform flex justify-center items-center gap-2 mt-2">
          <i data-lucide="user-plus" class="w-5 h-5"></i>
          CREAR USUARIO
        </button>
      </form>
    `;

    app.viewManager.showModal(content);

    document.getElementById('add-user-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const userData = {
        name: document.getElementById('new-user-name').value,
        username: document.getElementById('new-user-username').value,
        password: document.getElementById('new-user-password').value,
        role: document.getElementById('new-user-role').value,
        station: document.getElementById('new-user-station').value
      };

      try {
        const result = await this.api.addUser(userData);
        if (result.success) {
          this.toast.show(`Usuario ${result.data.name} creado`);
          app.viewManager.hideModal();
          await this.loadData();
        } else {
          this.toast.show(result.error || result.errors?.join(', ') || 'Error al crear usuario', 'error');
        }
      } catch (error) {
        this.toast.show('Error al crear usuario', 'error');
      }
    });
  }

  _showEditUserModal(userId) {
    const user = this.users.find(u => u.id === userId);
    if (!user) return;

    const content = `
      <div class="flex justify-between items-center mb-6">
        <h3 class="font-headline text-xl font-bold">Editar Usuario</h3>
        <button onclick="app.viewManager.hideModal()" class="text-on-surface-variant hover:text-on-surface">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>
      <form id="edit-user-form" class="space-y-4">
        <div>
          <label class="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1">Nombre</label>
          <input type="text" id="edit-user-name" value="${user.name}" class="w-full px-4 py-3 rounded-xl bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary/50 font-medium" required>
        </div>
        <div>
          <label class="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1">Usuario</label>
          <input type="text" id="edit-user-username" value="${user.username}" class="w-full px-4 py-3 rounded-xl bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary/50 font-medium" required>
        </div>
        <div>
          <label class="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1">Contraseña (dejar vacío para mantener)</label>
          <input type="password" id="edit-user-password" placeholder="••••••••" class="w-full px-4 py-3 rounded-xl bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary/50 font-medium" minlength="6">
        </div>
        <div>
          <label class="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1">Rol</label>
          <select id="edit-user-role" class="w-full px-4 py-3 rounded-xl bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary/50 font-medium">
            <option value="waiter" ${user.role === 'waiter' ? 'selected' : ''}>Garzón</option>
            <option value="chef" ${user.role === 'chef' ? 'selected' : ''}>Chef</option>
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-1">Estación</label>
          <input type="text" id="edit-user-station" value="${user.station || ''}" class="w-full px-4 py-3 rounded-xl bg-surface-container-low border border-surface-container focus:outline-none focus:border-primary/50 font-medium">
        </div>
        <button type="submit" class="w-full btn-gradient py-4 text-on-primary font-bold rounded-xl shadow-lg active:scale-95 transition-transform flex justify-center items-center gap-2 mt-2">
          <i data-lucide="save" class="w-5 h-5"></i>
          GUARDAR CAMBIOS
        </button>
      </form>
    `;

    app.viewManager.showModal(content);

    document.getElementById('edit-user-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const userData = {
        name: document.getElementById('edit-user-name').value,
        username: document.getElementById('edit-user-username').value,
        role: document.getElementById('edit-user-role').value,
        station: document.getElementById('edit-user-station').value
      };

      const password = document.getElementById('edit-user-password').value;
      if (password) userData.password = password;

      try {
        const result = await this.api.editUser(userId, userData);
        if (result.success) {
          this.toast.show(`Usuario ${result.data.name} actualizado`);
          app.viewManager.hideModal();
          await this.loadData();
        } else {
          this.toast.show(result.error || 'Error al editar usuario', 'error');
        }
      } catch (error) {
        this.toast.show('Error al editar usuario', 'error');
      }
    });
  }

  formatCurrency(amount) {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount);
  }
}

window.AdminView = AdminView;