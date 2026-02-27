import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("soberano.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    whatsapp TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL,
    photo TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    employee_id INTEGER,
    photo TEXT,
    delivery_date DATETIME,
    return_date DATETIME,
    status TEXT DEFAULT 'PARADO',
    total_value REAL DEFAULT 0,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  );

  CREATE TABLE IF NOT EXISTS case_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER,
    product_id INTEGER,
    quantity INTEGER DEFAULT 1,
    price_at_time REAL,
    FOREIGN KEY (case_id) REFERENCES cases(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS manual_commissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    product_name TEXT NOT NULL,
    price REAL NOT NULL,
    commission_value REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  );

  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER,
    action TEXT,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // API Routes
  
  // Employees
  app.get("/api/employees", (req, res) => {
    const employees = db.prepare(`
      SELECT e.*, 
      COALESCE(SUM(c.total_value), 0) as total_sales
      FROM employees e
      LEFT JOIN cases c ON e.id = c.employee_id
      GROUP BY e.id
    `).all();
    res.json(employees);
  });

  app.post("/api/employees", (req, res) => {
    const { name, whatsapp } = req.body;
    const result = db.prepare("INSERT INTO employees (name, whatsapp) VALUES (?, ?)").run(name, whatsapp);
    res.json({ id: result.lastInsertRowid });
  });

  app.put("/api/employees/:id", (req, res) => {
    const { name, whatsapp } = req.body;
    db.prepare("UPDATE employees SET name = ?, whatsapp = ? WHERE id = ?").run(name, whatsapp, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/employees/:id", (req, res) => {
    // Check if employee has active cases
    const activeCases = db.prepare("SELECT COUNT(*) as count FROM cases WHERE employee_id = ? AND status = 'EM_CAMPO'").get(req.params.id);
    if (activeCases.count > 0) {
      return res.status(400).json({ error: "Vendedora possui maletas em campo." });
    }
    db.prepare("DELETE FROM employees WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Products
  app.get("/api/products", (req, res) => {
    const products = db.prepare("SELECT * FROM products WHERE status = 'active'").all();
    res.json(products);
  });

  app.post("/api/products", (req, res) => {
    const { name, category, price, photo } = req.body;
    const result = db.prepare("INSERT INTO products (name, category, price, photo) VALUES (?, ?, ?, ?)").run(name, category, price, photo);
    res.json({ id: result.lastInsertRowid });
  });

  app.put("/api/products/:id", (req, res) => {
    const { name, category, price, photo } = req.body;
    db.prepare("UPDATE products SET name = ?, category = ?, price = ?, photo = ? WHERE id = ?").run(name, category, price, photo, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/products/:id", (req, res) => {
    db.prepare("UPDATE products SET status = 'removed' WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Cases
  app.get("/api/cases", (req, res) => {
    const cases = db.prepare(`
      SELECT c.*, e.name as employee_name, e.whatsapp as employee_whatsapp
      FROM cases c
      LEFT JOIN employees e ON c.employee_id = e.id
    `).all();
    
    const casesWithItems = cases.map(caseObj => {
      const items = db.prepare(`
        SELECT ci.*, p.name as product_name, p.category as product_category, p.photo as product_photo
        FROM case_items ci
        JOIN products p ON ci.product_id = p.id
        WHERE ci.case_id = ?
      `).all(caseObj.id);
      return { ...caseObj, items };
    });
    
    res.json(casesWithItems);
  });

  app.post("/api/cases", (req, res) => {
    const { name, employee_id, photo, items } = req.body;
    const delivery_date = new Date().toISOString();
    const return_date = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    
    const transaction = db.transaction(() => {
      const result = db.prepare("INSERT INTO cases (name, employee_id, photo, delivery_date, return_date, status) VALUES (?, ?, ?, ?, ?, ?)").run(
        name, employee_id, photo, delivery_date, return_date, employee_id ? 'EM_CAMPO' : 'PARADO'
      );
      const caseId = result.lastInsertRowid;
      
      let totalValue = 0;
      for (const item of items) {
        db.prepare("INSERT INTO case_items (case_id, product_id, quantity, price_at_time) VALUES (?, ?, ?, ?)").run(
          caseId, item.product_id, item.quantity, item.price
        );
        totalValue += item.price * item.quantity;
      }
      
      db.prepare("UPDATE cases SET total_value = ? WHERE id = ?").run(totalValue, caseId);
      db.prepare("INSERT INTO logs (case_id, action, details) VALUES (?, ?, ?)").run(caseId, 'CREATE', `Maleta criada com ${items.length} itens.`);
      
      return caseId;
    });
    
    const id = transaction();
    res.json({ id });
  });

  app.put("/api/cases/:id", (req, res) => {
    const { name, employee_id, status, items } = req.body;
    const caseId = req.params.id;
    
    const transaction = db.transaction(() => {
      db.prepare("UPDATE cases SET name = ?, employee_id = ?, status = ? WHERE id = ?").run(name, employee_id, status, caseId);
      
      if (items) {
        db.prepare("DELETE FROM case_items WHERE case_id = ?").run(caseId);
        let totalValue = 0;
        for (const item of items) {
          db.prepare("INSERT INTO case_items (case_id, product_id, quantity, price_at_time) VALUES (?, ?, ?, ?)").run(
            caseId, item.product_id, item.quantity, item.price
          );
          totalValue += item.price * item.quantity;
        }
        db.prepare("UPDATE cases SET total_value = ? WHERE id = ?").run(totalValue, caseId);
      }
      
      db.prepare("INSERT INTO logs (case_id, action, details) VALUES (?, ?, ?)").run(caseId, 'UPDATE', 'Maleta atualizada.');
    });
    
    transaction();
    res.json({ success: true });
  });

  app.delete("/api/cases/:id", (req, res) => {
    const transaction = db.transaction(() => {
      db.prepare("DELETE FROM case_items WHERE case_id = ?").run(req.params.id);
      db.prepare("DELETE FROM logs WHERE case_id = ?").run(req.params.id);
      db.prepare("DELETE FROM cases WHERE id = ?").run(req.params.id);
    });
    transaction();
    res.json({ success: true });
  });

  app.post("/api/cases/:id/log", (req, res) => {
    const { action, details } = req.body;
    db.prepare("INSERT INTO logs (case_id, action, details) VALUES (?, ?, ?)").run(req.params.id, action, details);
    res.json({ success: true });
  });

  app.get("/api/cases/:id/logs", (req, res) => {
    const logs = db.prepare("SELECT * FROM logs WHERE case_id = ? ORDER BY created_at DESC").all(req.params.id);
    res.json(logs);
  });

  // Dashboard Stats
  app.get("/api/stats", (req, res) => {
    const vgvCases = db.prepare("SELECT SUM(total_value) as total FROM cases WHERE status != 'PARADO'").get();
    const vgvManual = db.prepare("SELECT SUM(price) as total FROM manual_commissions").get();
    const activeCases = db.prepare("SELECT COUNT(*) as count FROM cases WHERE status = 'EM_CAMPO'").get();
    const premiumCases = db.prepare("SELECT COUNT(*) as count FROM cases WHERE total_value > 8000").get();
    const totalEmployees = db.prepare("SELECT COUNT(*) as count FROM employees").get();
    
    const salesByEmployee = db.prepare(`
      SELECT e.name, 
      (COALESCE((SELECT SUM(total_value) FROM cases WHERE employee_id = e.id), 0) + 
       COALESCE((SELECT SUM(price) FROM manual_commissions WHERE employee_id = e.id), 0)) as value
      FROM employees e
      GROUP BY e.id
    `).all();

    res.json({
      vgv: (vgvCases.total || 0) + (vgvManual.total || 0),
      activeCases: activeCases.count,
      premiumCases: premiumCases.count,
      totalEmployees: totalEmployees.count,
      salesByEmployee
    });
  });

  // Manual Commissions
  app.get("/api/manual-commissions", (req, res) => {
    const commissions = db.prepare(`
      SELECT mc.*, e.name as employee_name
      FROM manual_commissions mc
      JOIN employees e ON mc.employee_id = e.id
      ORDER BY mc.created_at DESC
    `).all();
    res.json(commissions);
  });

  app.post("/api/manual-commissions", (req, res) => {
    const { employee_id, product_name, price, commission_value } = req.body;
    const result = db.prepare(`
      INSERT INTO manual_commissions (employee_id, product_name, price, commission_value)
      VALUES (?, ?, ?, ?)
    `).run(employee_id, product_name, price, commission_value);
    res.json({ id: result.lastInsertRowid });
  });

  app.delete("/api/manual-commissions/:id", (req, res) => {
    db.prepare("DELETE FROM manual_commissions WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // WhatsApp API Simulation
  app.post("/api/whatsapp/send", (req, res) => {
    const { employee_id, message, photo, pdf_base64 } = req.body;
    
    // In a real scenario, you would use Twilio or Meta API here.
    // For this SaaS, we simulate the gateway and log the payload.
    
    const employee = db.prepare("SELECT * FROM employees WHERE id = ?").get(employee_id);
    
    if (!employee) {
      return res.status(404).json({ error: "Vendedora não encontrada" });
    }

    console.log("--- WHATSAPP API GATEWAY ---");
    console.log(`Para: ${employee.whatsapp}`);
    console.log(`Mensagem: ${message}`);
    console.log(`Foto: ${photo ? 'Enviada' : 'Nenhuma'}`);
    console.log(`PDF: ${pdf_base64 ? 'Anexado (Base64)' : 'Nenhum'}`);
    console.log("-----------------------------");

    // Log the event
    db.prepare("INSERT INTO logs (case_id, action, details) VALUES (?, ?, ?)").run(
      req.body.case_id || null, 
      'WHATSAPP_API', 
      `Envio automático via API para ${employee.name}`
    );

    res.json({ 
      success: true, 
      message: "Mensagem enviada para a fila de processamento da API WhatsApp",
      payload_preview: {
        to: employee.whatsapp,
        message: message.substring(0, 100) + "...",
        has_media: !!(photo || pdf_base64)
      }
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
