class ApiClient {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
    this.authToken = null;
  }

  setAuthToken(token) {
    this.authToken = token;
  }

  clearAuthToken() {
    this.authToken = null;
  }

  async _request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });
      const data = await response.json();
      return data;
    } catch (error) {
      return { success: false, error: error.message || 'Network error' };
    }
  }

  async login(username, password) {
    return this._request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  }

  async register(userData) {
    return this._request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  }

  async getSession(userId) {
    return this._request(`/api/auth/session/${userId}`);
  }

  async getUsers() {
    return this._request('/api/admin/users');
  }

  async addUser(userData) {
    return this._request('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  }

  async editUser(userId, userData) {
    return this._request(`/api/admin/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(userData)
    });
  }

  async deleteUser(userId) {
    return this._request(`/api/admin/users/${userId}`, {
      method: 'DELETE'
    });
  }

  async toggleUserStatus(userId) {
    return this._request(`/api/admin/users/${userId}/toggle-status`, {
      method: 'PATCH'
    });
  }

  async getStats() {
    return this._request('/api/admin/stats');
  }

  async getInventory() {
    return this._request('/api/inventory');
  }

  async getIngredient(id) {
    return this._request(`/api/inventory/${id}`);
  }

  async addIngredient(data) {
    return this._request('/api/inventory', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async updateIngredient(id, data) {
    return this._request(`/api/inventory/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async updateStock(id, stock) {
    return this._request(`/api/inventory/${id}/stock`, {
      method: 'PATCH',
      body: JSON.stringify({ stock })
    });
  }

  async restockIngredient(id, quantity) {
    return this._request(`/api/inventory/${id}/restock`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity })
    });
  }

  async deleteIngredient(id) {
    return this._request(`/api/inventory/${id}`, {
      method: 'DELETE'
    });
  }

  async getLowStockAlerts() {
    return this._request('/api/inventory/alerts/low-stock');
  }

  async checkProductAvailability(productId) {
    return this._request(`/api/inventory/check/${productId}`);
  }

  async getProducts(activeOnly = true) {
    return this._request(`/api/products?active=${activeOnly}`);
  }

  async getProductsByCategory(category) {
    return this._request(`/api/products?category=${category}`);
  }

  async getCategories() {
    return this._request('/api/products/categories');
  }

  async createProduct(productData) {
    return this._request('/api/products', {
      method: 'POST',
      body: JSON.stringify(productData)
    });
  }

  async createRecipe(recipeData) {
    return this._request('/api/recipes', {
      method: 'POST',
      body: JSON.stringify(recipeData)
    });
  }

  async getRecipeByProduct(productId) {
    return this._request(`/api/recipes/product/${productId}`);
  }

  async getRecipes() {
    return this._request('/api/recipes');
  }

  async getTables() {
    return this._request('/api/tables');
  }

  async getAvailableTables() {
    return this._request('/api/tables/available');
  }

  async updateTable(id, data) {
    return this._request(`/api/tables/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async editTable(id, data) {
    return this._request(`/api/tables/${id}/edit`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  }

  async updateTableStatus(id, status) {
    return this._request(`/api/tables/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  }

  async mergeTables(tableIds, mainTableId = null) {
    return this._request('/api/tables/merge', {
      method: 'POST',
      body: JSON.stringify({ tableIds, mainTableId })
    });
  }

  async unmergeTable(tableId, sessionId) {
    return this._request('/api/tables/unmerge', {
      method: 'POST',
      body: JSON.stringify({ tableId, sessionId })
    });
  }

  async getKDSOrders() {
    return this._request('/api/orders/kds');
  }

  async getPendingPaymentOrders() {
    return this._request('/api/orders/pending-payment');
  }

  async createOrder(orderData) {
    return this._request('/api/orders', {
      method: 'POST',
      body: JSON.stringify(orderData)
    });
  }

  async sendToKitchen(orderId) {
    return this._request(`/api/orders/${orderId}/send-kitchen`, {
      method: 'PATCH'
    });
  }

  async markAsReady(orderId) {
    return this._request(`/api/orders/${orderId}/mark-ready`, {
      method: 'PATCH'
    });
  }

  async deliverOrder(orderId) {
    return this._request(`/api/orders/${orderId}/deliver`, {
      method: 'PATCH'
    });
  }

  async processPayment(orderId) {
    return this._request(`/api/orders/${orderId}/pay`, {
      method: 'PATCH'
    });
  }

  async cancelOrder(orderId) {
    return this._request(`/api/orders/${orderId}/cancel`, {
      method: 'PATCH'
    });
  }

  async getDailyRevenue(date = null) {
    const url = date ? `/api/orders/revenue/daily?date=${date}` : '/api/orders/revenue/daily';
    return this._request(url);
  }
}

window.ApiClient = ApiClient;