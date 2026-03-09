// ============================================
// server.js - Kodular POS Backend
// ============================================

require('dotenv').config();
const express = require('express');
const mysql   = require('mysql2');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3000;

// ---- Middleware ----
app.use(cors());
app.use(express.json());

// ---- Database Connection Pool ----
const pool = mysql.createPool({
  host:            process.env.DB_HOST,
  user:            process.env.DB_USER,
  password:        process.env.DB_PASSWORD,
  database:        process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0
}).promise();

// Test DB connection on startup
(async () => {
  try {
    await pool.query('SELECT 1');
    console.log('Database connected successfully');
  } catch (err) {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  }
})();

// ============================================
// ROUTE 1: GET /categories
// ============================================
app.get('/categories', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM categories ORDER BY id');
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error fetching categories:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============================================
// ROUTE 2: GET /products/:categoryId
// ============================================
app.get('/products/:categoryId', async (req, res) => {
  try {
    const categoryId = parseInt(req.params.categoryId);
    if (isNaN(categoryId)) {
      return res.status(400).json({ success: false, error: 'Invalid category ID' });
    }

    const [rows] = await pool.query(
      'SELECT * FROM products WHERE category_id = ? AND is_available = 1 ORDER BY id',
      [categoryId]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Error fetching products:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============================================
// ROUTE 3: GET /product/:id
// ============================================
app.get('/product/:id', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
      return res.status(400).json({ success: false, error: 'Invalid product ID' });
    }

    const [rows] = await pool.query(
      'SELECT * FROM products WHERE id = ? AND is_available = 1',
      [productId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Error fetching product:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============================================
// ROUTE 4: POST /order/add
// Adds a product to the current order
// Body: { product_id, quantity, order_id (optional) }
// ============================================
app.post('/order/add', async (req, res) => {
  try {
    const { product_id, quantity = 1, order_id } = req.body;

    if (!product_id) {
      return res.status(400).json({ success: false, error: 'product_id is required' });
    }

    // Fetch product details
    const [products] = await pool.query(
      'SELECT * FROM products WHERE id = ? AND is_available = 1',
      [product_id]
    );

    if (products.length === 0) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const product = products[0];
    const total_amount = product.price * quantity;

    // If order_id provided, add item to existing order
    // Otherwise create a new order first
    let currentOrderId = order_id;

    if (!currentOrderId) {
      const [orderResult] = await pool.query(
        'INSERT INTO orders (status, created_at) VALUES ("pending", NOW())'
      );
      currentOrderId = orderResult.insertId;
    }

    // Check if same product already in order — if so, update quantity
    const [existing] = await pool.query(
      'SELECT * FROM order_items WHERE order_id = ? AND product_id = ?',
      [currentOrderId, product_id]
    );

    if (existing.length > 0) {
      const newQty = existing[0].quantity + quantity;
      const newTotal = product.price * newQty;
      await pool.query(
        'UPDATE order_items SET quantity = ?, total_amount = ? WHERE id = ?',
        [newQty, newTotal, existing[0].id]
      );
    } else {
      await pool.query(
        'INSERT INTO order_items (order_id, product_id, product_name, price, quantity, total_amount) VALUES (?, ?, ?, ?, ?, ?)',
        [currentOrderId, product_id, product.name, product.price, quantity, total_amount]
      );
    }

    // Return all items in this order for the side panel display
    const [orderItems] = await pool.query(
      `SELECT oi.id, oi.product_id, oi.product_name, oi.price, oi.quantity, oi.total_amount,
              p.image_url
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ?
       ORDER BY oi.id`,
      [currentOrderId]
    );

    // Calculate grand total
    const grandTotal = orderItems.reduce((sum, item) => sum + parseFloat(item.total_amount), 0);

    res.json({
      success: true,
      order_id: currentOrderId,
      items: orderItems,           // <-- Kodular uses this to populate the right panel
      grand_total: grandTotal.toFixed(2)
    });

  } catch (err) {
    console.error('Error adding to order:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============================================
// ROUTE 5: GET /order/:orderId/items
// Returns all items in an order (for side panel refresh)
// ============================================
app.get('/order/:orderId/items', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    if (isNaN(orderId)) {
      return res.status(400).json({ success: false, error: 'Invalid order ID' });
    }

    const [orderItems] = await pool.query(
      `SELECT oi.id, oi.product_id, oi.product_name, oi.price, oi.quantity, oi.total_amount,
              p.image_url
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ?
       ORDER BY oi.id`,
      [orderId]
    );

    const grandTotal = orderItems.reduce((sum, item) => sum + parseFloat(item.total_amount), 0);

    res.json({
      success: true,
      order_id: orderId,
      items: orderItems,
      grand_total: grandTotal.toFixed(2)
    });

  } catch (err) {
    console.error('Error fetching order items:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============================================
// ROUTE 6: POST /order/pay
// Finalizes the order with cash tendered
// Body: { order_id, cash_tendered }
// ============================================
app.post('/order/pay', async (req, res) => {
  try {
    const { order_id, cash_tendered } = req.body;

    if (!order_id || cash_tendered === undefined) {
      return res.status(400).json({ success: false, error: 'order_id and cash_tendered are required' });
    }

    // Get grand total
    const [items] = await pool.query(
      'SELECT SUM(total_amount) as grand_total FROM order_items WHERE order_id = ?',
      [order_id]
    );

    const grandTotal = parseFloat(items[0].grand_total || 0);
    const change = parseFloat(cash_tendered) - grandTotal;

    if (change < 0) {
      return res.status(400).json({ success: false, error: 'Insufficient cash tendered' });
    }

    // Mark order as paid
    await pool.query(
      'UPDATE orders SET status = "paid", cash_tendered = ?, change_amount = ?, paid_at = NOW() WHERE id = ?',
      [cash_tendered, change, order_id]
    );

    res.json({
      success: true,
      order_id,
      grand_total: grandTotal.toFixed(2),
      cash_tendered: parseFloat(cash_tendered).toFixed(2),
      change: change.toFixed(2)
    });

  } catch (err) {
    console.error('Error processing payment:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============================================
// ROUTE 7: DELETE /order/:orderId/item/:itemId
// Removes a single item from the order
// ============================================
app.delete('/order/:orderId/item/:itemId', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId);
    const itemId  = parseInt(req.params.itemId);

    await pool.query(
      'DELETE FROM order_items WHERE id = ? AND order_id = ?',
      [itemId, orderId]
    );

    // Return updated item list
    const [orderItems] = await pool.query(
      `SELECT oi.id, oi.product_id, oi.product_name, oi.price, oi.quantity, oi.total_amount,
              p.image_url
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ?
       ORDER BY oi.id`,
      [orderId]
    );

    const grandTotal = orderItems.reduce((sum, item) => sum + parseFloat(item.total_amount), 0);

    res.json({
      success: true,
      order_id: orderId,
      items: orderItems,
      grand_total: grandTotal.toFixed(2)
    });

  } catch (err) {
    console.error('Error removing item:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============================================
// 404 Handler
// ============================================
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`POS Backend running on http://localhost:${PORT}`);
  console.log('Available routes:');
  console.log('  GET    /categories');
  console.log('  GET    /products/:categoryId');
  console.log('  GET    /product/:id');
  console.log('  POST   /order/add');
  console.log('  GET    /order/:orderId/items');
  console.log('  POST   /order/pay');
  console.log('  DELETE /order/:orderId/item/:itemId');
});