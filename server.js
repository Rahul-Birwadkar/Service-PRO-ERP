// server.js
// Production backend for Service Pro ERP (Express + Neon/Postgres)

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

// -----------------------------
// Middleware
// -----------------------------
app.use(
  cors({
    origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN,
    credentials: true,
  })
);
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());

// -----------------------------
// Helper: auth (optional now)
// -----------------------------

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      department: user.department,
    },
    JWT_SECRET,
    { expiresIn: "2d" }
  );
}

async function getUserById(id) {
  const { rows } = await db.query(
    "select id, email, full_name, role, department, allowed_modules, denied_modules, is_active from erp_users where id = $1",
    [id]
  );
  return rows[0] || null;
}

async function authMiddleware(req, res, next) {
  const token = req.cookies.erp_token;
  if (!token) {
    // For now we allow unauthenticated to keep compatibility.
    // To hard-enforce auth in production, uncomment next line:
    // return res.status(401).json({ error: "Not authenticated" });
    return next();
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await getUserById(payload.id);
    if (!user || user.is_active === false) {
      return res.status(401).json({ error: "User inactive or not found" });
    }
    req.user = user;
    next();
  } catch (e) {
    console.warn("JWT verification failed:", e.message);
    // again: soft-fail for compatibility
    next();
  }
}

// Apply auth middleware to all /api routes (soft)
app.use("/api", authMiddleware);

// -----------------------------
// Health check
// -----------------------------
app.get("/health", async (req, res) => {
  try {
    const result = await db.query("select now()");
    res.json({ status: "ok", time: result.rows[0].now });
  } catch (err) {
    console.error("Health check error:", err);
    res.status(500).json({ status: "error", message: "DB unreachable" });
  }
});

// =====================================================
// AUTH & USER MANAGEMENT
// =====================================================

// POST /api/login
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const { rows } = await db.query(
      "select * from erp_users where lower(email) = lower($1)",
      [email]
    );
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    // TEMP login check (REMOVE after first login)
    if (password !== "admin123") {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    if (user.is_active === false) {
      return res.status(403).json({ error: "User inactive" });
    }

    const token = createToken(user);
    res.cookie("erp_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: !!process.env.CORS_ORIGIN && process.env.CORS_ORIGIN.startsWith("https"),
      maxAge: 2 * 24 * 60 * 60 * 1000,
    });

    const safeUser = {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      roleKey: (user.role || "").toLowerCase(),
      roleLabel: user.role,
      department: user.department,
      allowed_modules: user.allowed_modules || [],
      denied_modules: user.denied_modules || [],
      is_active: user.is_active,
      created_at: user.created_at,
    };

    res.json(safeUser);
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/erp-users
app.get("/api/erp-users", async (req, res) => {
  try {
    const { rows } = await db.query(
      `select id, email, full_name, role, department,
              allowed_modules, denied_modules, is_active,
              created_at, updated_at
       from erp_users
       order by created_at desc`
    );
    res.json(rows);
  } catch (err) {
    console.error("List users error:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// POST /api/erp-users
app.post("/api/erp-users", async (req, res) => {
  const {
    email,
    password,
    full_name,
    role,
    department,
    allowed_modules,
    denied_modules,
    is_active,
  } = req.body || {};

  if (!email || !password || !full_name || !role) {
    return res.status(400).json({ error: "email, password, full_name, role required" });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await db.query(
      `insert into erp_users
       (email, password_hash, full_name, role, department,
        allowed_modules, denied_modules, is_active)
       values ($1,$2,$3,$4,$5,$6,$7, coalesce($8,true))
       returning id, email, full_name, role, department,
                 allowed_modules, denied_modules, is_active,
                 created_at, updated_at`,
      [
        email,
        hash,
        full_name,
        role,
        department || null,
        allowed_modules || [],
        denied_modules || [],
        is_active !== false,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Create user error:", err);
    res.status(500).json({ error: "Failed to create user" });
  }
});

// PATCH /api/erp-users/:id
app.patch("/api/erp-users/:id", async (req, res) => {
  const { id } = req.params;
  const {
    full_name,
    role,
    department,
    allowed_modules,
    denied_modules,
    is_active,
    password,
  } = req.body || {};

  try {
    const fields = [];
    const values = [];
    let idx = 1;

    if (full_name !== undefined) {
      fields.push(`full_name = $${idx++}`);
      values.push(full_name);
    }
    if (role !== undefined) {
      fields.push(`role = $${idx++}`);
      values.push(role);
    }
    if (department !== undefined) {
      fields.push(`department = $${idx++}`);
      values.push(department);
    }
    if (allowed_modules !== undefined) {
      fields.push(`allowed_modules = $${idx++}`);
      values.push(allowed_modules);
    }
    if (denied_modules !== undefined) {
      fields.push(`denied_modules = $${idx++}`);
      values.push(denied_modules);
    }
    if (is_active !== undefined) {
      fields.push(`is_active = $${idx++}`);
      values.push(is_active);
    }
    if (password !== undefined && password) {
      const hash = await bcrypt.hash(password, 10);
      fields.push(`password_hash = $${idx++}`);
      values.push(hash);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    fields.push(`updated_at = now()`);
    const sql = `update erp_users set ${fields.join(", ")} where id = $${idx} returning id, email, full_name, role, department, allowed_modules, denied_modules, is_active, created_at, updated_at`;
    values.push(id);

    const { rows } = await db.query(sql, values);
    if (!rows[0]) return res.status(404).json({ error: "User not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("Update user error:", err);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// DELETE /api/erp-users/:id
app.delete("/api/erp-users/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("delete from erp_users where id = $1", [id]);
    res.status(204).end();
  } catch (err) {
    console.error("Delete user error:", err);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// =====================================================
// SETTINGS
// =====================================================

// GET /api/settings
app.get("/api/settings", async (req, res) => {
  try {
    const { rows } = await db.query("select * from settings where id = 1");
    if (!rows[0]) {
      return res.json({
        jobPrefix: "ST-",
        jobNextNumber: 1,
        jobPadding: 4,
        invoicePrefix: "INV-",
        invoiceNextNumber: 1,
        invoicePadding: 4,
        quotePrefix: "Q-",
        quoteNextNumber: 1,
        quotePadding: 4,
        gstPercent: 18,
        creditRiskThreshold: 80,
        lowStockMargin: 0,
      });
    }
    const s = rows[0];
    res.json({
      jobPrefix: s.job_prefix,
      jobNextNumber: s.job_next_number,
      jobPadding: s.job_padding,
      invoicePrefix: s.invoice_prefix,
      invoiceNextNumber: s.invoice_next_number,
      invoicePadding: s.invoice_padding,
      quotePrefix: s.quote_prefix,
      quoteNextNumber: s.quote_next_number,
      quotePadding: s.quote_padding,
      gstPercent: Number(s.gst_percent),
      creditRiskThreshold: s.credit_risk_threshold,
      lowStockMargin: s.low_stock_margin,
    });
  } catch (err) {
    console.error("Get settings error:", err);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// POST /api/settings
app.post("/api/settings", async (req, res) => {
  const s = req.body || {};
  try {
    await db.query(
      `insert into settings
       (id, job_prefix, job_next_number, job_padding,
        invoice_prefix, invoice_next_number, invoice_padding,
        quote_prefix, quote_next_number, quote_padding,
        gst_percent, credit_risk_threshold, low_stock_margin, updated_at)
       values (1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
       on conflict (id) do update set
         job_prefix = $1,
         job_next_number = $2,
         job_padding = $3,
         invoice_prefix = $4,
         invoice_next_number = $5,
         invoice_padding = $6,
         quote_prefix = $7,
         quote_next_number = $8,
         quote_padding = $9,
         gst_percent = $10,
         credit_risk_threshold = $11,
         low_stock_margin = $12,
         updated_at = now()`,
      [
        s.jobPrefix || "ST",
        s.jobNextNumber || 1,
        s.jobPadding || 4,
        s.invoicePrefix || "INV",
        s.invoiceNextNumber || 1,
        s.invoicePadding || 4,
        s.quotePrefix || "Q",
        s.quoteNextNumber || 1,
        s.quotePadding || 4,
        s.gstPercent || 18,
        s.creditRiskThreshold || 80,
        s.lowStockMargin || 0,
      ]
    );
    res.status(204).end();
  } catch (err) {
    console.error("Update settings error:", err);
    res.status(500).json({ error: "Failed to save settings" });
  }
});

// =====================================================
// CLIENTS
// =====================================================

// GET /api/clients
app.get("/api/clients", async (req, res) => {
  try {
    const { rows } = await db.query(
      `select *
       from clients
       order by created_at desc`
    );
    res.json(rows);
  } catch (err) {
    console.error("Get clients error:", err);
    res.status(500).json({ error: "Failed to fetch clients" });
  }
});

// POST /api/clients
app.post("/api/clients", async (req, res) => {
  const c = req.body || {};
  if (!c.name) {
    return res.status(400).json({ error: "Client name is required" });
  }

  try {
    const { rows } = await db.query(
      `insert into clients
       (code, name, gst_number, pan_number, billing_contact, billing_email, billing_phone,
        site_contact, site_phone, credit_limit, outstanding_amount, status,
        address_line1, address_line2, city, state, postal_code, country, industry)
       values
       ($1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11,$12,
        $13,$14,$15,$16,$17,$18,$19)
       returning *`,
      [
        c.code || null,
        c.name,
        c.gst_number || null,
        c.pan_number || null,
        c.billing_contact || null,
        c.billing_email || null,
        c.billing_phone || null,
        c.site_contact || null,
        c.site_phone || null,
        c.credit_limit || 0,
        c.outstanding_amount || 0,
        c.status || "active",
        c.address_line1 || null,
        c.address_line2 || null,
        c.city || null,
        c.state || null,
        c.postal_code || null,
        c.country || null,
        c.industry || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Create client error:", err);
    res.status(500).json({ error: "Failed to create client" });
  }
});

// PATCH /api/clients/:id (optional)
app.patch("/api/clients/:id", async (req, res) => {
  const { id } = req.params;
  const c = req.body || {};
  try {
    const fields = [];
    const values = [];
    let idx = 1;

    for (const [key, col] of [
      ["name", "name"],
      ["code", "code"],
      ["gst_number", "gst_number"],
      ["pan_number", "pan_number"],
      ["billing_contact", "billing_contact"],
      ["billing_email", "billing_email"],
      ["billing_phone", "billing_phone"],
      ["site_contact", "site_contact"],
      ["site_phone", "site_phone"],
      ["credit_limit", "credit_limit"],
      ["outstanding_amount", "outstanding_amount"],
      ["status", "status"],
      ["address_line1", "address_line1"],
      ["address_line2", "address_line2"],
      ["city", "city"],
      ["state", "state"],
      ["postal_code", "postal_code"],
      ["country", "country"],
      ["industry", "industry"],
    ]) {
      if (c[key] !== undefined) {
        fields.push(`${col} = $${idx++}`);
        values.push(c[key]);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    fields.push(`updated_at = now()`);
    const sql = `update clients set ${fields.join(", ")} where id = $${idx} returning *`;
    values.push(id);

    const { rows } = await db.query(sql, values);
    if (!rows[0]) return res.status(404).json({ error: "Client not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("Update client error:", err);
    res.status(500).json({ error: "Failed to update client" });
  }
});

// =====================================================
// TECHNICIANS
// =====================================================

// GET /api/technicians
app.get("/api/technicians", async (req, res) => {
  try {
    const { rows } = await db.query(
      `select *
       from technicians
       order by created_at desc`
    );
    res.json(rows);
  } catch (err) {
    console.error("Get technicians error:", err);
    res.status(500).json({ error: "Failed to fetch technicians" });
  }
});

// POST /api/technicians
app.post("/api/technicians", async (req, res) => {
  const t = req.body || {};
  if (!t.full_name) {
    return res.status(400).json({ error: "Technician full_name is required" });
  }

  try {
    const { rows } = await db.query(
      `insert into technicians
       (employee_code, full_name, department, designation, phone, email, status, join_date, base_salary)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       returning *`,
      [
        t.employee_code || null,
        t.full_name,
        t.department || null,
        t.designation || null,
        t.phone || null,
        t.email || null,
        t.status || "active",
        t.join_date || null,
        t.base_salary || 0,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Create technician error:", err);
    res.status(500).json({ error: "Failed to create technician" });
  }
});

// PATCH /api/technicians/:id
app.patch("/api/technicians/:id", async (req, res) => {
  const { id } = req.params;
  const t = req.body || {};
  try {
    const fields = [];
    const values = [];
    let idx = 1;

    for (const [key, col] of [
      ["employee_code", "employee_code"],
      ["full_name", "full_name"],
      ["department", "department"],
      ["designation", "designation"],
      ["phone", "phone"],
      ["email", "email"],
      ["status", "status"],
      ["join_date", "join_date"],
      ["base_salary", "base_salary"],
    ]) {
      if (t[key] !== undefined) {
        fields.push(`${col} = $${idx++}`);
        values.push(t[key]);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    fields.push(`updated_at = now()`);
    const sql = `update technicians set ${fields.join(", ")} where id = $${idx} returning *`;
    values.push(id);

    const { rows } = await db.query(sql, values);
    if (!rows[0]) return res.status(404).json({ error: "Technician not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("Update technician error:", err);
    res.status(500).json({ error: "Failed to update technician" });
  }
});

// =====================================================
// JOBS
// =====================================================

// GET /api/jobs
app.get("/api/jobs", async (req, res) => {
  try {
    const { rows } = await db.query(
      `select j.*,
              c.name as client_name
       from jobs j
       left join clients c on j.client_id = c.id
       order by j.created_at desc`
    );
    res.json(rows);
  } catch (err) {
    console.error("Get jobs error:", err);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

// POST /api/jobs
app.post("/api/jobs", async (req, res) => {
  const j = req.body || {};
  if (!j.job_code) {
    return res.status(400).json({ error: "job_code is required (from frontend settings)" });
  }

  try {
    const { rows } = await db.query(
      `insert into jobs
       (job_code, client_id, client_name, machine_name, machine_serial,
        fault_description, priority, status, assigned_technician_id,
        is_return_job, return_reason,
        estimated_value, material_cost, labor_hours, labor_rate, total_amount,
        job_date, deadline)
       values
       ($1,$2,$3,$4,$5,
        $6,$7,$8,$9,
        coalesce($10,false), $11,
        $12,$13,$14,$15,$16,
        $17,$18)
       returning *`,
      [
        j.job_code,
        j.client_id || null,
        j.client_name || null,
        j.machine_name || null,
        j.machine_serial || null,
        j.fault_description || null,
        (j.priority || "medium").toLowerCase(),
        (j.status || "open").toLowerCase(),
        j.assigned_technician_id || null,
        j.is_return_job || false,
        j.return_reason || null,
        j.estimated_value || j.total_amount || 0,
        j.material_cost || 0,
        j.labor_hours || 0,
        j.labor_rate || 0,
        j.total_amount || j.estimated_value || 0,
        j.job_date || j.inward_date || new Date().toISOString().slice(0, 10),
        j.deadline || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Create job error:", err);
    res.status(500).json({ error: "Failed to create job" });
  }
});

// PATCH /api/jobs/:id
app.patch("/api/jobs/:id", async (req, res) => {
  const { id } = req.params;
  const j = req.body || {};

  try {
    const fields = [];
    const values = [];
    let idx = 1;

    for (const [key, col] of [
      ["status", "status"],
      ["priority", "priority"],
      ["assigned_technician_id", "assigned_technician_id"],
      ["is_return_job", "is_return_job"],
      ["return_reason", "return_reason"],
      ["material_cost", "material_cost"],
      ["labor_hours", "labor_hours"],
      ["labor_rate", "labor_rate"],
      ["total_amount", "total_amount"],
      ["deadline", "deadline"],
    ]) {
      if (j[key] !== undefined) {
        fields.push(`${col} = $${idx++}`);
        values.push(j[key]);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    fields.push("updated_at = now()");
    const sql = `update jobs set ${fields.join(", ")} where id = $${idx} returning *`;
    values.push(id);

    const { rows } = await db.query(sql, values);
    if (!rows[0]) return res.status(404).json({ error: "Job not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("Update job error:", err);
    res.status(500).json({ error: "Failed to update job" });
  }
});

// POST /api/jobs/:id/transfer (JobService.transferJob)
app.post("/api/jobs/:id/transfer", async (req, res) => {
  const { id } = req.params;
  const { fromTechnicianId, toTechnicianId, reason } = req.body || {};
  if (!toTechnicianId) {
    return res.status(400).json({ error: "toTechnicianId is required" });
  }

  try {
    await db.query("begin");

    const { rows: jobRows } = await db.query(
      "update jobs set assigned_technician_id = $1, updated_at = now() where id = $2 returning *",
      [toTechnicianId, id]
    );
    const job = jobRows[0];
    if (!job) {
      await db.query("rollback");
      return res.status(404).json({ error: "Job not found" });
    }

    const { rows: transferRows } = await db.query(
      `insert into job_transfers (job_id, from_technician_id, to_technician_id, reason)
       values ($1,$2,$3,$4)
       returning *`,
      [id, fromTechnicianId || null, toTechnicianId, reason || null]
    );

    await db.query("commit");
    res.status(201).json({ job, transfer: transferRows[0] });
  } catch (err) {
    await db.query("rollback").catch(() => {});
    console.error("Job transfer error:", err);
    res.status(500).json({ error: "Failed to transfer job" });
  }
});

// =====================================================
// VENDORS
// =====================================================

app.get("/api/vendors", async (req, res) => {
  try {
    const { rows } = await db.query("select * from vendors order by created_at desc");
    res.json(rows);
  } catch (err) {
    console.error("Get vendors error:", err);
    res.status(500).json({ error: "Failed to fetch vendors" });
  }
});

app.post("/api/vendors", async (req, res) => {
  const v = req.body || {};
  if (!v.name) {
    return res.status(400).json({ error: "Vendor name is required" });
  }

  try {
    const { rows } = await db.query(
      `insert into vendors
       (name, gst_number, contact_name, email, phone, category, status,
        address_line1, address_line2, city, state, postal_code, country)
       values
       ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       returning *`,
      [
        v.name,
        v.gst_number || null,
        v.contact_name || null,
        v.email || null,
        v.phone || null,
        v.category || null,
        v.status || "active",
        v.address_line1 || null,
        v.address_line2 || null,
        v.city || null,
        v.state || null,
        v.postal_code || null,
        v.country || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Create vendor error:", err);
    res.status(500).json({ error: "Failed to create vendor" });
  }
});

// =====================================================
// INVENTORY
// =====================================================

// GET /api/inventory-items
app.get("/api/inventory-items", async (req, res) => {
  try {
    const { rows } = await db.query(
      `select i.*, v.name as vendor_name
       from inventory_items i
       left join vendors v on i.vendor_id = v.id
       order by i.created_at desc`
    );
    res.json(rows);
  } catch (err) {
    console.error("Get inventory items error:", err);
    res.status(500).json({ error: "Failed to fetch inventory items" });
  }
});

// POST /api/inventory-items (add / update stock)
app.post("/api/inventory-items", async (req, res) => {
  const i = req.body || {};
  if (!i.part_number && !i.description) {
    return res.status(400).json({ error: "part_number or description required" });
  }

  try {
    const { rows } = await db.query(
      `insert into inventory_items
       (part_number, description, category, unit, current_stock, min_level, location, vendor_id)
       values
       ($1,$2,$3,$4,$5,$6,$7,$8)
       returning *`,
      [
        i.part_number || null,
        i.description || null,
        i.category || null,
        i.unit || null,
        i.current_stock || 0,
        i.min_level || 0,
        i.location || null,
        i.vendor_id || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Create inventory item error:", err);
    res.status(500).json({ error: "Failed to create inventory item" });
  }
});

// POST /api/inventory/usage – log usage & decrease stock
app.post("/api/inventory/usage", async (req, res) => {
  const { job_id, item_id, quantity, note } = req.body || {};
  if (!item_id || !quantity || quantity <= 0) {
    return res.status(400).json({ error: "item_id and positive quantity required" });
  }

  try {
    await db.query("begin");

    const { rows: currentRows } = await db.query(
      "select current_stock from inventory_items where id = $1 for update",
      [item_id]
    );
    const current = currentRows[0];
    if (!current) {
      await db.query("rollback");
      return res.status(404).json({ error: "Inventory item not found" });
    }

    const newStock = Number(current.current_stock) - Number(quantity);
    if (newStock < 0) {
      // Still allow negative, but you could block here
    }

    await db.query(
      "update inventory_items set current_stock = $1, updated_at = now() where id = $2",
      [newStock, item_id]
    );

    const { rows: movementRows } = await db.query(
      `insert into stock_movements
       (item_id, job_id, movement_type, quantity, note)
       values ($1,$2,'out',$3,$4)
       returning *`,
      [item_id, job_id || null, quantity, note || null]
    );

    await db.query("commit");
    res.status(201).json(movementRows[0]);
  } catch (err) {
    await db.query("rollback").catch(() => {});
    console.error("Inventory usage error:", err);
    res.status(500).json({ error: "Failed to log inventory usage" });
  }
});

// =====================================================
// EXPENSES
// =====================================================

app.get("/api/expenses", async (req, res) => {
  try {
    const { rows } = await db.query(
      "select * from expenses order by exp_date desc, created_at desc"
    );
    res.json(rows);
  } catch (err) {
    console.error("Get expenses error:", err);
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
});

app.post("/api/expenses", async (req, res) => {
  const e = req.body || {};
  if (!e.exp_type || !e.amount) {
    return res.status(400).json({ error: "exp_type and amount are required" });
  }

  try {
    const { rows } = await db.query(
      `insert into expenses
       (exp_date, exp_type, amount, job_ref, notes)
       values ($1,$2,$3,$4,$5)
       returning *`,
      [
        e.exp_date || new Date().toISOString().slice(0, 10),
        e.exp_type,
        e.amount,
        e.job_ref || null,
        e.notes || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Create expense error:", err);
    res.status(500).json({ error: "Failed to create expense" });
  }
});

app.delete("/api/expenses/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("delete from expenses where id = $1", [id]);
    res.status(204).end();
  } catch (err) {
    console.error("Delete expense error:", err);
    res.status(500).json({ error: "Failed to delete expense" });
  }
});

// =====================================================
// INVOICES
// =====================================================

app.get("/api/invoices", async (req, res) => {
  try {
    const { rows } = await db.query(
      "select * from invoices order by issue_date desc, created_at desc"
    );
    res.json(rows);
  } catch (err) {
    console.error("Get invoices error:", err);
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
});

app.post("/api/invoices", async (req, res) => {
  const i = req.body || {};
  if (!i.invoice_number || !i.subtotal || !i.total) {
    return res
      .status(400)
      .json({ error: "invoice_number, subtotal and total are required" });
  }

  try {
    const { rows } = await db.query(
      `insert into invoices
       (invoice_number, job_id, client_id, client_name, client_address,
        subtotal, tax_amount, total, status, issue_date, due_date, notes)
       values
       ($1,$2,$3,$4,$5,
        $6,$7,$8,$9,$10,$11,$12)
       returning *`,
      [
        i.invoice_number,
        i.job_id || null,
        i.client_id || null,
        i.client_name || null,
        i.client_address || null,
        i.subtotal,
        i.tax_amount || 0,
        i.total,
        (i.status || "unpaid").toLowerCase(),
        i.issue_date || new Date().toISOString().slice(0, 10),
        i.due_date || null,
        i.notes || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Create invoice error:", err);
    res.status(500).json({ error: "Failed to create invoice" });
  }
});

// PATCH /api/invoices/:idOrNumber
// Frontend passes invoiceNumber (string)
app.patch("/api/invoices/:id", async (req, res) => {
  const { id } = req.params;
  const i = req.body || {};

  try {
    const fields = [];
    const values = [];
    let idx = 1;

    for (const [key, col] of [
      ["status", "status"],
      ["subtotal", "subtotal"],
      ["tax_amount", "tax_amount"],
      ["total", "total"],
      ["notes", "notes"],
    ]) {
      if (i[key] !== undefined) {
        fields.push(`${col} = $${idx++}`);
        values.push(i[key]);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    fields.push("updated_at = now()");
    const sql = `update invoices set ${fields.join(
      ", "
    )} where invoice_number = $${idx} or id::text = $${idx} returning *`;
    values.push(id);

    const { rows } = await db.query(sql, values);
    if (!rows[0]) return res.status(404).json({ error: "Invoice not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("Update invoice error:", err);
    res.status(500).json({ error: "Failed to update invoice" });
  }
});

// =====================================================
// QUOTATIONS
// =====================================================

// GET /api/quotations
app.get("/api/quotations", async (req, res) => {
  try {
    const { rows } = await db.query(
      `select q.*,
              c.name as client_name_db
       from quotations q
       left join clients c on q.client_id = c.id
       order by q.created_at desc`
    );
    res.json(rows);
  } catch (err) {
    console.error("Get quotations error:", err);
    res.status(500).json({ error: "Failed to fetch quotations" });
  }
});

// POST /api/quotations (header + items)
app.post("/api/quotations", async (req, res) => {
  const { client_id, valid_until, subtotal, tax_amount, total, status, notes, items, provisional_quote_number } =
    req.body || {};

  if (!client_id || !Array.isArray(items) || items.length === 0) {
    return res
      .status(400)
      .json({ error: "client_id and at least one item are required" });
  }

  try {
    await db.query("begin");

    // Generate quote_number if not provided
    let quoteNumber = provisional_quote_number || null;
    if (!quoteNumber) {
      const { rows: sRows } = await db.query(
        "select quote_prefix, quote_next_number, quote_padding from settings where id = 1"
      );
      const s = sRows[0] || {
        quote_prefix: "Q",
        quote_next_number: 1,
        quote_padding: 4,
      };
      const padded = String(s.quote_next_number).padStart(
        s.quote_padding || 4,
        "0"
      );
      quoteNumber = `${s.quote_prefix || "Q"}-${padded}`;
      await db.query(
        "update settings set quote_next_number = quote_next_number + 1, updated_at = now() where id = 1"
      );
    }

    const { rows: clientRows } = await db.query(
      "select name from clients where id = $1",
      [client_id]
    );
    const clientName = clientRows[0]?.name || null;

    const { rows: qRows } = await db.query(
      `insert into quotations
       (quote_number, client_id, client_name, valid_until,
        subtotal, tax_amount, total, status, notes)
       values
       ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       returning *`,
      [
        quoteNumber,
        client_id,
        clientName,
        valid_until || null,
        subtotal || 0,
        tax_amount || 0,
        total || 0,
        (status || "sent").toLowerCase(),
        notes || null,
      ]
    );
    const quotation = qRows[0];

    for (const item of items) {
      await db.query(
        `insert into quotation_items
         (quotation_id, description, qty, rate, amount)
         values ($1,$2,$3,$4,$5)`,
        [
          quotation.id,
          item.description || "Item",
          item.qty || 1,
          item.rate || 0,
          item.amount || 0,
        ]
      );
    }

    await db.query("commit");
    res.status(201).json(quotation);
  } catch (err) {
    await db.query("rollback").catch(() => {});
    console.error("Create quotation error:", err);
    res.status(500).json({ error: "Failed to create quotation" });
  }
});

// PATCH /api/quotations/:id – change status
app.patch("/api/quotations/:id", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};
  if (!status) return res.status(400).json({ error: "status is required" });

  try {
    const { rows } = await db.query(
      `update quotations
       set status = $1, updated_at = now()
       where id = $2 or quote_number = $2
       returning *`,
      [(status || "draft").toLowerCase(), id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Quotation not found" });
    res.json(rows[0]);
  } catch (err) {
    console.error("Update quotation error:", err);
    res.status(500).json({ error: "Failed to update quotation" });
  }
});

// =====================================================
// HR DOCS
// =====================================================

// GET /api/hr-docs?erp_user_id=...&technician_id=...
app.get("/api/hr-docs", async (req, res) => {
  const { erp_user_id, technician_id } = req.query;
  try {
    const params = [];
    const conds = [];

    if (erp_user_id) {
      params.push(erp_user_id);
      conds.push(`erp_user_id = $${params.length}`);
    }
    if (technician_id) {
      params.push(technician_id);
      conds.push(`technician_id = $${params.length}`);
    }

    let sql = "select * from hr_docs";
    if (conds.length > 0) {
      sql += " where " + conds.join(" and ");
    }
    sql += " order by created_at desc";

    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("Get hr_docs error:", err);
    res.status(500).json({ error: "Failed to fetch HR docs" });
  }
});

// POST /api/hr-docs
app.post("/api/hr-docs", async (req, res) => {
  const d = req.body || {};
  if (!d.doc_type || !d.doc_name) {
    return res
      .status(400)
      .json({ error: "doc_type and doc_name are required" });
  }

  try {
    const { rows } = await db.query(
      `insert into hr_docs
       (erp_user_id, technician_id, doc_type, doc_name, doc_number,
        issue_date, expiry_date, status, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       returning *`,
      [
        d.erp_user_id || null,
        d.technician_id || null,
        d.doc_type,
        d.doc_name,
        d.doc_number || null,
        d.issue_date || null,
        d.expiry_date || null,
        d.status || null,
        d.notes || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Create hr_doc error:", err);
    res.status(500).json({ error: "Failed to create HR doc" });
  }
});

// =====================================================
// PAYROLL
// =====================================================

// GET /api/payroll?month=&year=
app.get("/api/payroll", async (req, res) => {
  const month = parseInt(req.query.month, 10);
  const year = parseInt(req.query.year, 10);
  if (!year || !month) {
    return res.status(400).json({ error: "month and year are required" });
  }

  try {
    const { rows: runRows } = await db.query(
      "select * from payroll_runs where year = $1 and month = $2",
      [year, month]
    );
    const run = runRows[0] || null;

    let entries = [];
    if (run) {
      const { rows: eRows } = await db.query(
        "select * from payroll_entries where payroll_run_id = $1",
        [run.id]
      );
      entries = eRows;
    }

    res.json({ run, entries });
  } catch (err) {
    console.error("Get payroll error:", err);
    res.status(500).json({ error: "Failed to fetch payroll" });
  }
});

// POST /api/payroll/generate-run { month, year }
// Uses technicians.base_salary, zero bonus/deductions initially
app.post("/api/payroll/generate-run", async (req, res) => {
  const month = parseInt(req.body?.month, 10);
  const year = parseInt(req.body?.year, 10);
  if (!year || !month) {
    return res.status(400).json({ error: "month and year are required" });
  }

  try {
    await db.query("begin");

    const { rows: runRows } = await db.query(
      `insert into payroll_runs (year, month, status)
       values ($1,$2,'generated')
       on conflict (year, month) do update
         set status = 'generated', created_at = now()
       returning *`,
      [year, month]
    );
    const run = runRows[0];

    await db.query("delete from payroll_entries where payroll_run_id = $1", [
      run.id,
    ]);

    const { rows: techRows } = await db.query(
      "select * from technicians where status = 'active'"
    );

    const entries = [];
    for (const t of techRows) {
      const base = Number(t.base_salary || 0);
      const bonus = 0;
      const deductions = 0;
      const net = base + bonus - deductions;

      const { rows: eRows } = await db.query(
        `insert into payroll_entries
         (payroll_run_id, technician_id, employee_code, name,
          base_salary, bonus, deductions, net_pay)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         returning *`,
        [
          run.id,
          t.id,
          t.employee_code || null,
          t.full_name || null,
          base,
          bonus,
          deductions,
          net,
        ]
      );
      entries.push(eRows[0]);
    }

    await db.query("commit");
    res.json({ run, entries });
  } catch (err) {
    await db.query("rollback").catch(() => {});
    console.error("Generate payroll error:", err);
    res.status(500).json({ error: "Failed to generate payroll" });
  }
});

// For reports page: /api/payroll/entries?year=YYYY[&month=MM]
app.get("/api/payroll/entries", async (req, res) => {
  const year = parseInt(req.query.year, 10);
  const month = req.query.month ? parseInt(req.query.month, 10) : null;
  if (!year) return res.status(400).json({ error: "year is required" });

  try {
    let sql =
      "select pe.* from payroll_entries pe join payroll_runs pr on pe.payroll_run_id = pr.id where pr.year = $1";
    const params = [year];
    if (month) {
      sql += " and pr.month = $2";
      params.push(month);
    }
    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("Get payroll entries error:", err);
    res.status(500).json({ error: "Failed to fetch payroll entries" });
  }
});

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {
  console.log(`Service Pro ERP backend running on port ${PORT}`);
});

