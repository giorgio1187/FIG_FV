class WaiterView {
  constructor(api, toast) {
    this.api = api;
    this.toast = toast;
    this.tables = [];
    this.products = [];
    this.recipes = [];
    this.inventoryMap = {};
    this.categories = [];
    this.activeTable = null;
    this.activeCategory = 'All';
    this.pendingItems = [];
    this.selectedTablesForMerge = [];

    this.tableGrid = document.getElementById('table-grid');
    this.categoryChips = document.getElementById('category-chips');
    this.menuItems = document.getElementById('menu-items');
    this.orderItemsList = document.getElementById('order-items-list');
    this.orderSubtotal = document.getElementById('order-subtotal');
    this.orderTotal = document.getElementById('order-total');
    this.activeTableBadge = document.getElementById('active-table-badge');
    this.activeOrderTitle = document.getElementById('active-order-title');
    this.btnSendKitchen = document.getElementById('btn-send-kitchen');
    this.btnCancelOrder = document.getElementById('btn-cancel-order');
    this.btnMergeTables = document.getElementById('btn-merge-tables');

    this._bindEvents();
  }

  _bindEvents() {
    this.btnSendKitchen.addEventListener('click', () => this._sendToKitchen());
    this.btnCancelOrder.addEventListener('click', () => this._cancelOrder());
    this.btnMergeTables.addEventListener('click', () => this._showMergeModal());
  }

  async loadData() {
    try {
      const results = await Promise.allSettled([
        this.api.getTables(),
        this.api.getProducts(true),
        this.api.getRecipes(),
        this.api.getInventory(),
        this.api.getCategories()
      ]);

      const [tablesResRaw, productsResRaw, recipesResRaw, inventoryResRaw, categoriesResRaw] = results.map(r => {
        if (r.status === 'fulfilled') return r.value;
        return { success: false, error: (r.reason && r.reason.message) || String(r.reason) };
      });

      console.debug('WaiterView.loadData results', {
        tables: tablesResRaw,
        products: productsResRaw,
        recipes: recipesResRaw,
        inventory: inventoryResRaw,
        categories: categoriesResRaw
      });

      const tablesRes = tablesResRaw;
      const productsRes = productsResRaw;
      const recipesRes = recipesResRaw;
      const inventoryRes = inventoryResRaw;
      const categoriesRes = categoriesResRaw;

      if (tablesRes.success) {
        this.tables = tablesRes.data;
      } else {
        this.tables = [];
        console.error('Tables load error:', tablesRes.error);
        this.toast.show(tablesRes.error || 'Error al cargar mesas', 'error');
      }

      if (productsRes.success) this.products = productsRes.data;
      else console.error('Products load error:', productsRes.error);

      if (recipesRes.success) this.recipes = recipesRes.data;
      else console.error('Recipes load error:', recipesRes.error);

      if (categoriesRes.success) this.categories = ['All', ...categoriesRes.data];
      else console.error('Categories load error:', categoriesRes.error);

      if (inventoryRes.success) {
        inventoryRes.data.forEach(ing => {
          this.inventoryMap[ing.id] = ing;
        });
      } else {
        console.error('Inventory load error:', inventoryRes.error);
      }

      this.renderTables();
      this.renderCategoryChips();
      this.renderMenuItems();
    } catch (error) {
      console.error('Load data unexpected error:', error);
      this.toast.show(error.message || 'Error al cargar datos', 'error');
    }
  }

  renderTables() {
    if (!this.tableGrid) return;

    if (!this.tables || this.tables.length === 0) {
      this.tableGrid.innerHTML = `<div class="col-span-full py-12 text-center text-on-surface-variant font-medium">No hay mesas disponibles para mostrar</div>`;
      return;
    }

    this.tableGrid.innerHTML = this.tables.map(table => {
      const isActive = this.activeTable === table.id;
      const isOccupied = table.status === 'occupied';
      const isSelected = this.selectedTablesForMerge.includes(table.id);

      let btnClass = 'bg-surface-container border border-surface-container-highest text-on-surface hover:bg-surface-container-highest';
      if (isOccupied) btnClass = 'bg-primary text-white shadow-md border-transparent';
      if (isActive) btnClass += ' ring-4 ring-primary/30';
      if (isSelected && !isOccupied) btnClass = 'bg-tertiary text-white ring-4 ring-tertiary/50';

      return `
        <button onclick="app.waiterView.selectTable('${table.id}')" class="h-20 flex flex-col items-center justify-center rounded-xl font-headline transition-all ${btnClass} ${this._isMerging() && !isOccupied ? 'cursor-pointer' : ''}">
          <span class="text-[10px] uppercase font-bold opacity-70">Mesa</span>
          <span class="text-2xl font-black">${table.table_number}</span>
          ${isOccupied ? '<span class="text-[8px] mt-1 opacity-70">Ocupada</span>' : ''}
        </button>
      `;
    }).join('');
  }

  _isMerging() {
    return this.selectedTablesForMerge.length > 0;
  }

  selectTable(id) {
    if (this._isMerging()) {
      this._toggleTableSelection(id);
      return;
    }

    this.activeTable = id;
    const table = this.tables.find(t => t.id === id);

    if (this.activeTableBadge) this.activeTableBadge.innerText = `MESA ${table?.table_number || id}`;
    if (this.activeOrderTitle) {
      this.activeOrderTitle.innerText = table?.status === 'occupied' ? 'Añadir al Pedido' : 'Nueva Comanda';
    }
    if (this.btnSendKitchen) this.btnSendKitchen.disabled = false;
    if (this.btnCancelOrder) this.btnCancelOrder.disabled = false;

    this.renderTables();
    this.renderActiveOrder();
    this.renderMenuItems();
  }

  _toggleTableSelection(tableId) {
    const table = this.tables.find(t => t.id === tableId);
    if (table?.status === 'occupied') return;

    const idx = this.selectedTablesForMerge.indexOf(tableId);
    if (idx === -1) {
      this.selectedTablesForMerge.push(tableId);
    } else {
      this.selectedTablesForMerge.splice(idx, 1);
    }

    this.renderTables();
  }

  _showMergeModal() {
    if (this.selectedTablesForMerge.length < 2) {
      this.toast.show('Seleccione al menos 2 mesas para fusionar', 'warning');
      return;
    }

    const selectedTableNumbers = this.selectedTablesForMerge.map(id => {
      const table = this.tables.find(t => t.id === id);
      return table?.table_number;
    }).join(', ');

    const content = `
      <div class="flex justify-between items-center mb-6">
        <h3 class="font-headline text-xl font-bold">Fusionar Mesas</h3>
        <button onclick="app.viewManager.hideModal()" class="text-on-surface-variant hover:text-on-surface">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>
      <p class="text-on-surface-variant mb-4">¿Fusionar las mesas ${selectedTableNumbers}?</p>
      <p class="text-sm text-on-surface-variant mb-6">Todos los pedidos se agruparán en una sola cuenta.</p>
      <div class="flex gap-3">
        <button onclick="app.waiterView.cancelMerge()" class="flex-1 bg-surface-container text-on-surface py-3 font-bold rounded-xl">Cancelar</button>
        <button onclick="app.waiterView.executeMerge()" class="flex-1 btn-gradient py-3 text-on-primary font-bold rounded-xl">Fusionar</button>
      </div>
    `;

    app.viewManager.showModal(content);
  }

  async executeMerge() {
    try {
      const result = await this.api.mergeTables(this.selectedTablesForMerge);
      if (result.success) {
        this.toast.show('Mesas fusionadas correctamente');
        this.selectedTablesForMerge = [];
        await this.loadData();
        app.viewManager.hideModal();
      } else {
        this.toast.show(result.error || 'Error al fusionar mesas', 'error');
      }
    } catch (error) {
      this.toast.show('Error al fusionar mesas', 'error');
    }
  }

  cancelMerge() {
    this.selectedTablesForMerge = [];
    this.renderTables();
    app.viewManager.hideModal();
  }

  renderCategoryChips() {
    if (!this.categoryChips) return;

    this.categoryChips.innerHTML = this.categories.map(cat => `
      <button onclick="app.waiterView.setActiveCategory('${cat}')" class="px-5 py-2 rounded-lg text-sm font-bold transition-all border ${this.activeCategory === cat ? 'bg-on-surface text-surface-container-lowest border-on-surface' : 'bg-transparent text-on-surface border-surface-container-highest hover:bg-surface-container-high'}">
        ${cat}
      </button>
    `).join('');
  }

  setActiveCategory(cat) {
    this.activeCategory = cat;
    this.renderCategoryChips();
    this.renderMenuItems();
  }

  checkStockAvailability(productId) {
    const recipe = this.recipes.find(r => r.product_id === productId);
    if (!recipe || !recipe.ingredients) return true;

    return recipe.ingredients.every(ri => {
      const ing = this.inventoryMap[ri.ingredient_id];
      return ing && ing.stock >= ri.quantity_required;
    });
  }

  renderMenuItems() {
    if (!this.menuItems) return;

    if (!this.activeTable) {
      this.menuItems.innerHTML = `<div class="col-span-full py-12 text-center text-on-surface-variant font-medium">Selecciona una mesa para ver el menú</div>`;
      if (this.btnSendKitchen) this.btnSendKitchen.disabled = true;
      if (this.btnCancelOrder) this.btnCancelOrder.disabled = true;
      return;
    }

    const filtered = this.activeCategory === 'All' ? this.products : this.products.filter(p => p.category === this.activeCategory);

    this.menuItems.innerHTML = filtered.map(product => {
      const isAvailable = this.checkStockAvailability(product.id);
      return `
        <button ${!isAvailable ? 'disabled' : ''} onclick="app.waiterView.addToOrder('${product.id}')" class="group bg-surface-container-lowest p-5 rounded-xl border border-surface-container-highest hover:border-primary/50 transition-all text-left flex flex-col justify-between h-32 ${!isAvailable ? 'opacity-40 grayscale cursor-not-allowed' : 'active:scale-95 hover:shadow-md'}">
          <div>
            <span class="text-[10px] text-primary font-bold uppercase tracking-widest">${product.category}</span>
            <h4 class="font-headline font-bold text-on-surface leading-tight mt-1">${product.name}</h4>
          </div>
          <div class="flex justify-between items-end w-full">
            <span class="font-body font-bold text-on-surface-variant">${product.formattedPrice}</span>
            ${isAvailable
              ? `<i data-lucide="plus-circle" class="w-5 h-5 text-primary opacity-0 group-hover:opacity-100 transition-opacity"></i>`
              : `<span class="text-[10px] text-red-600 font-bold uppercase">Sin Stock</span>`}
          </div>
        </button>
      `;
    }).join('');
    lucide.createIcons();
  }

  addToOrder(productId) {
    if (!this.activeTable) return;

    const product = this.products.find(p => p.id === productId);
    if (!product) return;

    if (!this.checkStockAvailability(productId)) {
      this.toast.show('Stock insuficiente en bodega', 'error');
      return;
    }

    const existing = this.pendingItems.find(i => i.product_id === productId);
    if (existing) {
      existing.quantity++;
      existing.subtotal = existing.quantity * existing.unit_price;
    } else {
      this.pendingItems.push({
        product_id: product.id,
        name: product.name,
        unit_price: product.price,
        quantity: 1,
        subtotal: product.price
      });
    }

    this.renderActiveOrder();
    this.renderTables();
  }

  removeFromOrder(productId) {
    const itemIndex = this.pendingItems.findIndex(i => i.product_id === productId);
    if (itemIndex === -1) return;

    if (this.pendingItems[itemIndex].quantity > 1) {
      this.pendingItems[itemIndex].quantity--;
      this.pendingItems[itemIndex].subtotal = this.pendingItems[itemIndex].quantity * this.pendingItems[itemIndex].unit_price;
    } else {
      this.pendingItems.splice(itemIndex, 1);
    }

    if (this.pendingItems.length === 0) {
      if (this.activeOrderTitle) this.activeOrderTitle.innerText = 'Nueva Comanda';
    }

    this.renderActiveOrder();
    this.renderTables();
  }

  renderActiveOrder() {
    if (!this.orderItemsList || !this.orderSubtotal || !this.orderTotal) return;

    if (!this.activeTable || this.pendingItems.length === 0) {
      this.orderItemsList.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full text-on-surface-variant opacity-50 space-y-2">
          <i data-lucide="shopping-basket" class="w-8 h-8"></i>
          <p class="text-sm font-medium">Comanda vacía</p>
        </div>`;
      this.orderSubtotal.innerText = '$0';
      this.orderTotal.innerText = '$0';
      lucide.createIcons();
      return;
    }

    let total = 0;

    this.orderItemsList.innerHTML = this.pendingItems.map(item => {
      total += item.subtotal;
      return `
        <div class="flex justify-between items-center p-3 bg-surface-container rounded-lg border border-transparent hover:border-surface-container-highest transition-colors">
          <div class="flex items-center gap-3">
            <span class="bg-surface-container-highest text-on-surface w-6 h-6 flex items-center justify-center rounded text-[10px] font-bold">${item.quantity}x</span>
            <span class="text-sm font-semibold text-on-surface">${item.name}</span>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-sm font-headline font-bold text-on-surface-variant">${this.formatCurrency(item.subtotal)}</span>
            <button onclick="app.waiterView.removeFromOrder('${item.product_id}')" class="text-on-surface-variant hover:text-red-600 bg-surface-container-highest hover:bg-red-100 p-1.5 rounded transition-colors">
              <i data-lucide="minus" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.orderSubtotal.innerText = this.formatCurrency(total);
    this.orderTotal.innerText = this.formatCurrency(total);
    lucide.createIcons();
  }

  async _sendToKitchen() {
    if (!this.activeTable || this.pendingItems.length === 0) return;

    try {
      const orderResult = await this.api.createOrder({
        table_id: this.activeTable,
        items: this.pendingItems,
        user_id: app.currentUser?.id
      });

      if (orderResult.success) {
        const sendResult = await this.api.sendToKitchen(orderResult.data.id);

        if (sendResult.success) {
          const table = this.tables.find(t => t.id === this.activeTable);
          this.toast.show(`Comanda Mesa ${table?.table_number || this.activeTable} enviada a cocina`);

          this.pendingItems = [];
          this.activeTable = null;

          if (this.activeTableBadge) this.activeTableBadge.innerText = '--';
          if (this.activeOrderTitle) this.activeOrderTitle.innerText = 'Selecciona Mesa';

          await this.loadData();
          this.renderActiveOrder();
        } else {
          this.toast.show(sendResult.error || 'Error al enviar a cocina', 'error');
        }
      } else {
        this.toast.show(orderResult.error || 'Error al crear comanda', 'error');
      }
    } catch (error) {
      this.toast.show('Error al enviar a cocina', 'error');
    }
  }

  async _cancelOrder() {
    if (!this.activeTable || this.pendingItems.length === 0) return;

    this.pendingItems = [];
    this.activeTable = null;

    if (this.activeOrderTitle) this.activeOrderTitle.innerText = 'Nueva Comanda';
    if (this.activeTableBadge) this.activeTableBadge.innerText = '--';

    await this.loadData();
    this.renderActiveOrder();
    this.toast.show('Comanda cancelada');
  }

  formatCurrency(amount) {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount);
  }
}

window.WaiterView = WaiterView;