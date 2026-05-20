class KitchenView {
  constructor(api, toast) {
    this.api = api;
    this.toast = toast;
    this.orders = [];
    this.kdsGrid = document.getElementById('kds-grid');
    this.refreshInterval = null;

    this._startAutoRefresh();
  }

  _startAutoRefresh() {
    this.refreshInterval = setInterval(() => {
      if (!document.getElementById('view-kitchen').classList.contains('hidden')) {
        this.loadData();
        this.renderKDS();
      }
    }, 30000);
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  async loadData() {
    try {
      const result = await this.api.getKDSOrders();
      if (result.success) {
        this.orders = result.data;
      }
    } catch (error) {
      console.error('Load KDS data error:', error);
    }
  }

  renderKDS() {
    if (!this.kdsGrid) return;

    if (this.orders.length === 0) {
      this.kdsGrid.innerHTML = `
        <div class="col-span-full flex flex-col items-center justify-center py-20 opacity-40">
          <i data-lucide="check-circle-2" class="w-16 h-16 mb-4"></i>
          <p class="font-headline text-xl">Sin pedidos pendientes</p>
        </div>`;
      lucide.createIcons();
      return;
    }

    this.kdsGrid.innerHTML = this.orders.map(order => {
      const elapsedMin = Math.floor(order.minutes_pending || 0);
      const timerInfo = this._getTimerInfo(elapsedMin);

      const itemsHtml = (order.items || []).map(item => `
        <div class="flex items-start gap-3 pt-2 first:pt-0">
          <span class="bg-surface-container text-on-surface px-2 py-0.5 rounded text-[11px] font-black mt-0.5">${item.quantity}</span>
          <span class="text-sm font-bold text-on-surface">${item.product_name}</span>
        </div>
      `).join('');

      return `
        <div class="bg-surface-container-lowest rounded-xl ambient-shadow flex flex-col overflow-hidden h-fit border-t-4 ${timerInfo.borderColor}">
          <div class="p-4 bg-surface-container-low flex justify-between items-center">
            <div>
              <span class="text-[10px] font-bold uppercase text-on-surface-variant">Mesa</span>
              <div class="text-2xl font-headline font-black text-on-surface">${order.table_number || order.table_id}</div>
            </div>
            <div class="px-3 py-1 rounded-lg font-bold text-sm flex items-center gap-2 ${timerInfo.timerBg}">
              <i data-lucide="clock" class="w-4 h-4"></i>
              ${elapsedMin} min
            </div>
          </div>
          <div class="p-4 flex-1 space-y-3 divide-y divide-surface-container">
            ${itemsHtml}
          </div>
          <button onclick="app.kitchenView.finishOrder('${order.id}')" class="w-full bg-surface-container hover:bg-on-surface hover:text-surface-container-lowest py-4 font-bold text-xs uppercase tracking-widest transition-colors flex justify-center items-center gap-2">
            <i data-lucide="check" class="w-4 h-4"></i> Marcar Listo
          </button>
        </div>
      `;
    }).join('');

    lucide.createIcons();
  }

  _getTimerInfo(elapsedMin) {
    if (elapsedMin > 20) {
      return { borderColor: 'border-red-500', timerBg: 'bg-red-100 text-red-800' };
    } else if (elapsedMin >= 11) {
      return { borderColor: 'border-yellow-500', timerBg: 'bg-yellow-100 text-yellow-800' };
    }
    return { borderColor: 'border-green-500', timerBg: 'bg-green-100 text-green-800' };
  }

  async finishOrder(orderId) {
    try {
      const result = await this.api.markAsReady(orderId);
      if (result.success) {
        this.toast.show(`Pedido listo para servir`);
        await this.loadData();
        this.renderKDS();
      } else {
        this.toast.show(result.error || 'Error al marcar como listo', 'error');
      }
    } catch (error) {
      this.toast.show('Error al procesar pedido', 'error');
    }
  }
}

window.KitchenView = KitchenView;