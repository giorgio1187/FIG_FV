class App {
  constructor() {
    this.api = new ApiClient();
    this.toast = new ToastManager();
    this.viewManager = new ViewManager();
    this.currentUser = null;

    this.waiterView = null;
    this.kitchenView = null;
    this.adminView = null;

    this._bindLoginEvents();
    this._bindLogoutEvent();
    this._bindNavEvents();
    this._bindModalEvents();
    this._updateTime();

    setInterval(() => this._updateTime(), 1000);
  }

  _bindLoginEvents() {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this._handleLogin();
      });
    }
  }

  _bindLogoutEvent() {
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', () => this._handleLogout());
    }
  }

  _bindNavEvents() {
    const navWaiter = document.getElementById('nav-waiter');
    const navKitchen = document.getElementById('nav-kitchen');
    const navAdmin = document.getElementById('nav-admin');

    if (navWaiter) navWaiter.addEventListener('click', () => this._switchToView('waiter'));
    if (navKitchen) navKitchen.addEventListener('click', () => this._switchToView('kitchen'));
    if (navAdmin) navAdmin.addEventListener('click', () => this._switchToView('admin'));
  }

  _bindModalEvents() {
    const modalContainer = document.getElementById('modal-container');
    if (modalContainer) {
      modalContainer.addEventListener('click', (e) => {
        if (e.target === modalContainer) {
          this.viewManager.hideModal();
        }
      });
    }
  }

  async _handleLogin() {
    const username = document.getElementById('username').value.toLowerCase().trim();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');
    const errorTextEl = document.getElementById('login-error-text');
    const btnLogin = document.getElementById('btn-login');

    btnLogin.disabled = true;
    btnLogin.innerHTML = '<div class="loading-spinner"></div> Iniciando...';

    try {
      const result = await this.api.login(username, password);

      if (result.success) {
        this.currentUser = result.user;
        this.api.setAuthToken(result.user.id);

        if (errorEl) errorEl.classList.add('hidden');

        this.viewManager.showApp();
        this.viewManager.applyRolePermissions(this.currentUser.role);
        this.viewManager.updateHeader(this.currentUser.name, this.currentUser.role);
        this.viewManager.updateStation(this.currentUser.station || '');

        this._initializeViews();

        const defaultView = this._getDefaultViewForRole(this.currentUser.role);
        this.viewManager.switchView(defaultView);

        this.toast.show(`Bienvenido, ${this.currentUser.name}`);
      } else {
        if (errorEl) errorEl.classList.remove('hidden');
        if (errorTextEl) errorTextEl.innerText = result.error || 'Credenciales inválidas';

        const form = document.getElementById('login-form');
        form.classList.add('translate-x-2');
        setTimeout(() => form.classList.remove('translate-x-2'), 100);
      }
    } catch (error) {
      console.error('Login error:', error);
      if (errorEl) errorEl.classList.remove('hidden');
      if (errorTextEl) errorTextEl.innerText = 'Error de conexión';
    } finally {
      btnLogin.disabled = false;
      btnLogin.innerHTML = '<i data-lucide="log-in" class="w-5 h-5"></i> INICIAR SESIÓN';
      lucide.createIcons();
    }
  }

  _getDefaultViewForRole(role) {
    const viewMap = {
      waiter: 'waiter',
      chef: 'kitchen',
      admin: 'waiter'
    };
    return viewMap[role] || 'waiter';
  }

  _handleLogout() {
    this.currentUser = null;
    this.api.clearAuthToken();
    document.getElementById('login-form').reset();
    this.viewManager.hideApp();
    this.toast.show('Sesión cerrada', 'info');
  }

  _initializeViews() {
    this.waiterView = new WaiterView(this.api, this.toast);
    this.kitchenView = new KitchenView(this.api, this.toast);
    this.adminView = new AdminView(this.api, this.toast);
  }

  async _switchToView(viewName) {
    this.viewManager.switchView(viewName);
    await this._refreshCurrentView();
  }

  async _refreshCurrentView() {
    const views = document.querySelectorAll('.view');
    for (const view of views) {
      if (!view.classList.contains('hidden')) {
        const viewId = view.id.replace('view-', '');

        if (viewId === 'waiter' && this.waiterView) {
          await this.waiterView.loadData();
        } else if (viewId === 'kitchen' && this.kitchenView) {
          await this.kitchenView.loadData();
          this.kitchenView.renderKDS();
        } else if (viewId === 'admin' && this.adminView) {
          await this.adminView.loadData();
        }
        break;
      }
    }
  }

  _updateTime() {
    const timeEl = document.getElementById('current-time');
    if (timeEl) {
      const now = new Date();
      timeEl.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  }
}

const app = new App();
window.app = app;