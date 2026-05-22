require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const db = require('./config/db');
const AuthController = require('./controllers/AuthController');
const InventoryController = require('./controllers/InventoryController');
const OrderController = require('./controllers/OrderController');
const AdminController = require('./controllers/AdminController');
const TableController = require('./controllers/TableController');
const Product = require('./models/Product');
const Recipe = require('./models/Recipe');
const InventoryService = require('./services/InventoryService');

class Server {
  constructor(port = process.env.PORT || 3000) {
    this.port = port;
    this.app = express();

    this.inventoryService = new InventoryService(db);
    this.authController = new AuthController(db);
    this.inventoryController = new InventoryController(db, this.inventoryService);
    this.orderController = new OrderController(db, this.inventoryService);
    this.adminController = new AdminController(db);
    this.tableController = new TableController(db);

    this._configureMiddleware();
    this._configureRoutes();
    this._configureStaticFiles();
  }

  _configureMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  _configureStaticFiles() {
    this.app.use(express.static(path.join(__dirname, '../frontend')));
  }

  _configureRoutes() {
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../frontend/index.html'));
    });

    this.app.post('/api/auth/login', (req, res) => this._handle(this.authController.login(req.body.username, req.body.password), res));
    this.app.post('/api/auth/register', (req, res) => this._handle(this.authController.register(req.body), res));
    this.app.get('/api/auth/session/:userId', async (req, res) => this._handle(await this.authController.getSession(req.params.userId), res));

    this.app.get('/api/inventory', async (req, res) => this._handle(await this.inventoryController.getAll(), res));
    this.app.get('/api/inventory/:id', async (req, res) => this._handle(await this.inventoryController.getById(req.params.id), res));
    this.app.post('/api/inventory', async (req, res) => this._handle(await this.inventoryController.add(req.body), res));
    this.app.put('/api/inventory/:id', async (req, res) => this._handle(await this.inventoryController.update(req.params.id, req.body), res));
    this.app.patch('/api/inventory/:id/stock', async (req, res) => this._handle(await this.inventoryController.updateStock(req.params.id, req.body.stock), res));
    this.app.patch('/api/inventory/:id/restock', async (req, res) => this._handle(await this.inventoryController.restock(req.params.id, req.body.quantity), res));
    this.app.delete('/api/inventory/:id', async (req, res) => this._handle(await this.inventoryController.delete(req.params.id), res));
    this.app.get('/api/inventory/alerts/low-stock', async (req, res) => this._handle(await this.inventoryController.getLowStockAlerts(), res));
    this.app.get('/api/inventory/check/:productId', async (req, res) => this._handle(await this.inventoryController.checkProductAvailability(req.params.productId), res));

    this.app.get('/api/products', async (req, res) => {
      try {
        const product = new Product();
        const products = req.query.active === 'true' 
          ? await product.findActive(db) 
          : await product.findAll(db);
        res.json({ success: true, data: products.map(p => p.toSafeObject()) });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
    this.app.get('/api/products/categories', async (req, res) => {
      try {
        const product = new Product();
        const categories = await product.getCategories(db);
        res.json({ success: true, data: categories });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
    this.app.get('/api/products/:id', async (req, res) => {
      try {
        const product = new Product({ id: req.params.id });
        const found = await product.findById(db);
        if (!found) return res.status(404).json({ success: false, error: 'Producto no encontrado' });
        res.json({ success: true, data: found.toSafeObject() });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/recipes', async (req, res) => {
      try {
        const recipe = new Recipe();
        const recipes = await recipe.findAll(db);
        res.json({ success: true, data: recipes.map(r => r.toSafeObject()) });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
    this.app.get('/api/recipes/product/:productId', async (req, res) => {
      try {
        const recipe = new Recipe();
        const found = await recipe.findByProductId(db, req.params.productId);
        if (!found) return res.status(404).json({ success: false, error: 'Receta no encontrada' });
        res.json({ success: true, data: found.toSafeObject() });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
    this.app.post('/api/recipes', async (req, res) => {
      try {
        const { product_id } = req.body;
        const recipe = new Recipe({ product_id });
        const errors = recipe.validate();
        if (errors.length > 0) return res.status(400).json({ success: false, errors });

        const saved = await recipe.save(db);
        res.json({ success: true, data: saved.toSafeObject() });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
    this.app.patch('/api/recipes/:id/ingredients', async (req, res) => {
      try {
        const recipe = new Recipe({ id: req.params.id });
        const found = await recipe.findById(db);
        if (!found) return res.status(404).json({ success: false, error: 'Receta no encontrada' });

        const { ingredientId, quantityRequired } = req.body;
        if (!ingredientId || quantityRequired === undefined) {
          return res.status(400).json({ success: false, error: 'ingredientId y quantityRequired son requeridos' });
        }

        await recipe.addIngredient(db, ingredientId, quantityRequired);
        const updated = await recipe.findById(db);
        res.json({ success: true, data: updated.toSafeObject() });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
    this.app.delete('/api/recipes/:id/ingredients/:ingredientId', async (req, res) => {
      try {
        const recipe = new Recipe({ id: req.params.id });
        const found = await recipe.findById(db);
        if (!found) return res.status(404).json({ success: false, error: 'Receta no encontrada' });

        const removed = await recipe.removeIngredient(db, req.params.ingredientId);
        if (!removed) return res.status(404).json({ success: false, error: 'Ingrediente no encontrado en la receta' });

        const updated = await recipe.findById(db);
        res.json({ success: true, data: updated.toSafeObject() });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.get('/api/tables', (req, res) => this._handle(this.tableController.getAll(), res));
    this.app.get('/api/tables/available', (req, res) => this._handle(this.tableController.getAvailable(), res));
    this.app.get('/api/tables/:id', (req, res) => this._handle(this.tableController.getById(req.params.id), res));
    this.app.post('/api/tables', (req, res) => this._handle(this.tableController.create(req.body), res));
    this.app.put('/api/tables/:id', (req, res) => this._handle(this.tableController.update(req.params.id, req.body), res));
    this.app.patch('/api/tables/:id/edit', (req, res) => this._handle(this.tableController.editTable(req.params.id, req.body), res));
    this.app.patch('/api/tables/:id/status', (req, res) => this._handle(this.tableController.updateStatus(req.params.id, req.body.status), res));
    this.app.post('/api/tables/merge', (req, res) => this._handle(this.tableController.mergeTables(req.body.tableIds, req.body.mainTableId), res));
    this.app.post('/api/tables/unmerge', (req, res) => this._handle(this.tableController.unmergeTable(req.body.tableId, req.body.sessionId), res));
    this.app.get('/api/tables/group/:sessionId', (req, res) => this._handle(this.tableController.getTableGroup(req.params.sessionId), res));
    this.app.delete('/api/tables/:id', (req, res) => this._handle(this.tableController.delete(req.params.id), res));

    this.app.get('/api/orders', (req, res) => this._handle(this.orderController.getAll(req.query), res));
    this.app.get('/api/orders/kds', (req, res) => this._handle(this.orderController.getKDSOrders(), res));
    this.app.get('/api/orders/pending-payment', (req, res) => this._handle(this.orderController.getPendingPayment(), res));
    this.app.get('/api/orders/:id', (req, res) => this._handle(this.orderController.getById(req.params.id), res));
    this.app.post('/api/orders', (req, res) => this._handle(this.orderController.create(req.body), res));
    this.app.patch('/api/orders/:id/send-kitchen', (req, res) => this._handle(this.orderController.sendToKitchen(req.params.id), res));
    this.app.patch('/api/orders/:id/mark-ready', (req, res) => this._handle(this.orderController.markAsReady(req.params.id), res));
    this.app.patch('/api/orders/:id/deliver', (req, res) => this._handle(this.orderController.deliver(req.params.id), res));
    this.app.patch('/api/orders/:id/pay', (req, res) => this._handle(this.orderController.processPayment(req.params.id), res));
    this.app.patch('/api/orders/:id/cancel', (req, res) => this._handle(this.orderController.cancel(req.params.id), res));
    this.app.get('/api/orders/revenue/daily', async (req, res) => {
      const date = req.query.date || null;
      this._handle(await this.orderController.getDailyRevenue(date), res);
    });

    this.app.get('/api/admin/users', (req, res) => this._handle(this.adminController.getAllUsers(), res));
    this.app.get('/api/admin/users/:id', (req, res) => this._handle(this.adminController.getUserById(req.params.id), res));
    this.app.post('/api/admin/users', (req, res) => this._handle(this.adminController.addUser(req.body), res));
    this.app.put('/api/admin/users/:id', (req, res) => this._handle(this.adminController.editUser(req.params.id, req.body), res));
    this.app.delete('/api/admin/users/:id', (req, res) => this._handle(this.adminController.deleteUser(req.params.id), res));
    this.app.patch('/api/admin/users/:id/toggle-status', (req, res) => this._handle(this.adminController.toggleUserStatus(req.params.id), res));
    this.app.get('/api/admin/stats', (req, res) => this._handle(this.adminController.getStats(), res));
  }

  async _handle(promise, res) {
    try {
      const result = await promise;
      if (result.success) {
        res.json(result);
      } else {
        res.status(result.error || result.errors ? 400 : 404).json(result);
      }
    } catch (error) {
      console.error('Handler error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(`
  ╔══════════════════════════════════════════════╗
  ║  F.I.G - PostgreSQL                         ║
  ║  Funcionamiento Íntegro Gastronómico         ║
  ║  Server running on http://localhost:${this.port}      ║
  ╚══════════════════════════════════════════════╝
      `);
    });
  }
}

const server = new Server();
server.start();

module.exports = Server;