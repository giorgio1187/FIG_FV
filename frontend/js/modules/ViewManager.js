class ViewManager {
  constructor() {
    this.loginView = document.getElementById('login-view');
    this.mainSidebar = document.getElementById('main-sidebar');
    this.mainContent = document.getElementById('main-content');
    this.navItems = {
      waiter: document.getElementById('nav-waiter'),
      kitchen: document.getElementById('nav-kitchen'),
      admin: document.getElementById('nav-admin')
    };
    this.views = {
      waiter: document.getElementById('view-waiter'),
      kitchen: document.getElementById('view-kitchen'),
      admin: document.getElementById('view-admin')
    };
    this.viewTitles = {
      waiter: 'Estación Garzón',
      kitchen: 'Monitor de Cocina',
      admin: 'Administración Central'
    };
  }

  showApp() {
    this.loginView.classList.add('hidden');
    this.mainSidebar.classList.remove('hidden');
    this.mainSidebar.classList.add('flex');
    this.mainContent.classList.remove('hidden');
    this.mainContent.classList.add('flex');
  }

  hideApp() {
    this.loginView.classList.remove('hidden');
    this.mainSidebar.classList.add('hidden');
    this.mainSidebar.classList.remove('flex');
    this.mainContent.classList.add('hidden');
    this.mainContent.classList.remove('flex');
  }

  applyRolePermissions(role) {
    Object.values(this.navItems).forEach(btn => {
      btn.classList.add('hidden');
      btn.classList.remove('flex');
    });

    const roleMap = {
      waiter: ['waiter'],
      chef: ['kitchen'],
      admin: ['waiter', 'kitchen', 'admin']
    };

    const allowedViews = roleMap[role] || [];
    allowedViews.forEach(view => {
      if (this.navItems[view]) {
        this.navItems[view].classList.remove('hidden');
        this.navItems[view].classList.add('flex');
      }
    });
  }

  switchView(viewName) {
    Object.values(this.views).forEach(view => view.classList.add('hidden'));

    if (this.views[viewName]) {
      this.views[viewName].classList.remove('hidden');
    }

    const titleEl = document.getElementById('current-view-title');
    if (titleEl && this.viewTitles[viewName]) {
      titleEl.innerText = this.viewTitles[viewName];
    }

    Object.entries(this.navItems).forEach(([key, item]) => {
      const isMatch = key === viewName;
      if (isMatch) {
        item.classList.add('bg-orange-50', 'text-primary', 'font-bold');
        item.classList.remove('text-on-surface-variant', 'hover:bg-surface-container-low');
      } else {
        item.classList.remove('bg-orange-50', 'text-primary', 'font-bold');
        item.classList.add('text-on-surface-variant', 'hover:bg-surface-container-low');
      }
    });
  }

  updateHeader(userName, userRole) {
    const nameEl = document.getElementById('header-user-name');
    const roleEl = document.getElementById('header-user-role');
    if (nameEl) nameEl.innerText = userName;
    if (roleEl) {
      const roleLabels = { waiter: 'Garzón', chef: 'Cocina', admin: 'Administrador' };
      roleEl.innerText = roleLabels[userRole] || userRole;
    }
  }

  updateStation(station) {
    const label = document.getElementById('user-station-label');
    if (label) label.innerText = station;
  }

  showModal(content) {
    const container = document.getElementById('modal-container');
    const contentEl = document.getElementById('modal-content');
    contentEl.innerHTML = content;
    container.classList.remove('hidden');
    lucide.createIcons();
  }

  hideModal() {
    const container = document.getElementById('modal-container');
    container.classList.add('hidden');
  }
}

window.ViewManager = ViewManager;