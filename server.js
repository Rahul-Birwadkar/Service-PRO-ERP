// server.js
// Full backend API for Service Pro ERP (Neon/Postgres)

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("./db");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 3000;

// -----------------------------
// Middleware
// -----------------------------
app.use(cors()); // tighten later for specific Netlify domain
app.use(express.json());

// -----------------------------
// Root route (for Render / browser test)
// -----------------------------
app.get("/", (req, res) => {
  res.send("Service Pro ERP Backend Running 🚀");
});

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
// CLIENTS ROUTES
// =====================================================

// GET /api/clients  -> list all clients
app.get("/api/clients", async (req, res) => {
  try {
    const result = await db.query(
      `
      select
        id,
        name,
        gst_number,
        billing_contact,
        billing_email,
        billing_phone,
        site_contact,
        site_phone,
        credit_limit,
        outstanding_amount,
        status,
        address_line1,
        address_line2,
        city,
        state,
        postal_code,
        country,
        created_at,
        updated_at
      from public.clients
      order by name asc
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error("GET /api/clients error:", err);
    res.status(500).json({ error: "Failed to fetch clients" });
  }
});

// POST /api/clients  -> create new client
app.post("/api/clients", async (req, res) => {
  try {
    const {
      name,
      gst_number,
      billing_contact,
      billing_email,
      billing_phone,
      site_contact,
      site_phone,
      credit_limit,
      status,
      address_line1,
      address_line2,
      city,
      state,
      postal_code,
      country
    } = req.body || {};

    if (!name) {
      return res.status(400).json({ error: "Client name is required" });
    }

    const result = await db.query(
      `
      insert into public.clients (
        name,
        gst_number,
        billing_contact,
        billing_email,
        billing_phone,
        site_contact,
        site_phone,
        credit_limit,
        status,
        address_line1,
        address_line2,
        city,
        state,
        postal_code,
        country
      )
      values (
        $1,$2,$3,$4,$5,
        $6,$7,
        coalesce($8,0),
        coalesce($9,'active'),
        $10,$11,$12,$13,$14,$15
      )
      returning *
      `,
      [
        name,
        gst_number || null,
        billing_contact || null,
        billing_email || null,
        billing_phone || null,
        site_contact || null,
        site_phone || null,
        credit_limit || 0,
        status || null,
        address_line1 || null,
        address_line2 || null,
        city || null,
        state || null,
        postal_code || null,
        country || null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("POST /api/clients error:", err);
    res.status(500).json({ error: "Failed to create client" });
  }
});

// =====================================================
// VENDORS ROUTES
// =====================================================

// GET /api/vendors  -> list all vendors
app.get("/api/vendors", async (req, res) => {
  try {
    const result = await db.query(
      `
      select
        id,
        name,
        gst_number,
        category,
        payment_terms,
        contact_person,
        contact_email,
        contact_phone,
        status,
        address_line1,
        address_line2,
        city,
        state,
        postal_code,
        country,
        created_at,
        updated_at
      from public.vendors
      order by name asc
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET /api/vendors error:", err);
    res.status(500).json({ error: "Failed to fetch vendors" });
  }
});

// POST /api/vendors  -> create vendor
app.post("/api/vendors", async (req, res) => {
  try {
    const {
      name,
      gst_number,
      category,
      payment_terms,
      contact_person,
      contact_email,
      contact_phone,
      status,
      address_line1,
      address_line2,
      city,
      state,
      postal_code,
      country
    } = req.body || {};

    if (!name) {
      return res.status(400).json({ error: "Vendor name is required" });
    }

    const result = await db.query(
      `
      insert into public.vendors (
        name,
        gst_number,
        category,
        payment_terms,
        contact_person,
        contact_email,
        contact_phone,
        status,
        address_line1,
        address_line2,
        city,
        state,
        postal_code,
        country
      )
      values (
        $1,$2,$3,$4,$5,$6,$7,
        coalesce($8,'active'),
        $9,$10,$11,$12,$13,$14
      )
      returning *
      `,
      [
        name,
        gst_number || null,
        category || null,
        payment_terms || null,
        contact_person || null,
        contact_email || null,
        contact_phone || null,
        status || null,
        address_line1 || null,
        address_line2 || null,
        city || null,
        state || null,
        postal_code || null,
        country || null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("POST /api/vendors error:", err);
    res.status(500).json({ error: "Failed to create vendor" });
  }
});

// PATCH /api/vendors/:id  -> update vendor
app.patch("/api/vendors/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      gst_number,
      category,
      payment_terms,
      contact_person,
      contact_email,
      contact_phone,
      status,
      address_line1,
      address_line2,
      city,
      state,
      postal_code,
      country
    } = req.body || {};

    const result = await db.query(
      `
      update public.vendors
      set
        name = coalesce($1,name),
        gst_number = coalesce($2,gst_number),
        category = coalesce($3,category),
        payment_terms = coalesce($4,payment_terms),
        contact_person = coalesce($5,contact_person),
        contact_email = coalesce($6,contact_email),
        contact_phone = coalesce($7,contact_phone),
        status = coalesce($8,status),
        address_line1 = coalesce($9,address_line1),
        address_line2 = coalesce($10,address_line2),
        city = coalesce($11,city),
        state = coalesce($12,state),
        postal_code = coalesce($13,postal_code),
        country = coalesce($14,country),
        updated_at = now()
      where id = $15
      returning *
      `,
      [
        name || null,
        gst_number || null,
        category || null,
        payment_terms || null,
        contact_person || null,
        contact_email || null,
        contact_phone || null,
        status || null,
        address_line1 || null,
        address_line2 || null,
        city || null,
        state || null,
        postal_code || null,
        country || null,
        id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("PATCH /api/vendors/:id error:", err);
    res.status(500).json({ error: "Failed to update vendor" });
  }
});

// =====================================================
// TECHNICIANS ROUTES
// =====================================================

// GET /api/technicians  -> list technicians (with profile name)
app.get("/api/technicians", async (req, res) => {
  try {
    const result = await db.query(
      `
      select
        t.id,
        t.profile_id,
        t.employee_code,
        t.specialization,
        t.status,
        t.base_salary,
        t.hourly_rate,
        t.erp_user_id,
        t.created_at,
        t.updated_at,
        p.full_name as profile_name
      from public.technicians t
      left join public.profiles p on p.id = t.profile_id
      order by
        t.employee_code asc nulls last,
        p.full_name asc nulls last
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error("GET /api/technicians error:", err);
    res.status(500).json({ error: "Failed to fetch technicians" });
  }
});

// =====================================================
// JOBS ROUTES (SERVICE ORDERS)
// =====================================================

// GET /api/jobs  -> list jobs (with client name)
app.get("/api/jobs", async (req, res) => {
  try {
    const result = await db.query(
      `
      select
        j.id,
        j.job_code,
        j.client_id,
        c.name as client_name,
        j.machine_name,
        j.machine_serial,
        j.fault_description,
        j.priority,
        j.status,
        j.assigned_technician_id,
        j.labor_hours,
        j.labor_rate,
        j.material_cost,
        j.total_amount,
        j.is_return_job,
        j.return_reason,
        j.deadline,
        j.created_at,
        j.updated_at
      from public.jobs j
      left join public.clients c on c.id = j.client_id
      order by j.created_at desc
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error("GET /api/jobs error:", err);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

// POST /api/jobs  -> create job
app.post("/api/jobs", async (req, res) => {
  try {
    const {
      job_code,
      client_id,
      machine_name,
      machine_serial,
      fault_description,
      priority,
      status,
      assigned_technician_id,
      labor_hours,
      labor_rate,
      material_cost,
      total_amount,
      deadline,
      is_return_job,
      return_reason
    } = req.body || {};

    if (!job_code || !client_id) {
      return res
        .status(400)
        .json({ error: "job_code and client_id are required" });
    }

    const result = await db.query(
      `
      insert into public.jobs (
        job_code,
        client_id,
        machine_name,
        machine_serial,
        fault_description,
        priority,
        status,
        assigned_technician_id,
        labor_hours,
        labor_rate,
        material_cost,
        total_amount,
        deadline,
        is_return_job,
        return_reason
      )
      values (
        $1,$2,$3,$4,$5,
        coalesce($6,'medium')::job_priority,
        coalesce($7,'open')::job_status,
        $8,
        coalesce($9,0),
        coalesce($10,0),
        coalesce($11,0),
        coalesce($12,0),
        $13,
        coalesce($14,false),
        $15
      )
      returning *
      `,
      [
        job_code,
        client_id,
        machine_name || null,
        machine_serial || null,
        fault_description || null,
        priority,
        status,
        assigned_technician_id || null,
        labor_hours,
        labor_rate,
        material_cost,
        total_amount,
        deadline || null,
        is_return_job,
        return_reason || null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("POST /api/jobs error:", err);
    res.status(500).json({ error: "Failed to create job" });
  }
});

// PATCH /api/jobs/:id  -> update job fields
app.patch("/api/jobs/:id", async (req, res) => {
  try {
    const jobId = req.params.id;
    const {
      status,
      priority,
      assigned_technician_id,
      is_return_job,
      return_reason,
      total_amount,
      deadline
    } = req.body || {};

    if (!jobId) {
      return res.status(400).json({ error: "Job id is required" });
    }

    const fields = [];
    const values = [];
    let idx = 1;

    function pushField(columnName, value, enumType) {
      if (typeof value === "undefined") return;

      if (enumType) {
        fields.push(
          `${columnName} = coalesce($${idx}, ${columnName})::${enumType}`
        );
      } else {
        fields.push(`${columnName} = $${idx}`);
      }
      values.push(value);
      idx++;
    }

    pushField("status", status, "job_status");
    pushField("priority", priority, "job_priority");
    pushField("assigned_technician_id", assigned_technician_id);
    pushField("is_return_job", is_return_job);
    pushField("return_reason", return_reason);
    pushField("total_amount", total_amount);
    pushField("deadline", deadline);

    fields.push(`updated_at = now()`);

    if (fields.length === 1) {
      return res.status(400).json({ error: "No updatable fields provided" });
    }

    const sql = `
      update public.jobs
      set ${fields.join(", ")}
      where id = $${idx}
      returning *
    `;
    values.push(jobId);

    const result = await db.query(sql, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Job not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("PATCH /api/jobs/:id error:", err);
    res.status(500).json({ error: "Failed to update job" });
  }
});

// =====================================================
// ERP SETTINGS ROUTES (GLOBAL CONFIG)
// =====================================================

// GET /api/settings  -> all settings (usually one "global")
app.get("/api/settings", async (req, res) => {
  try {
    const result = await db.query(
      `
      select
        id,
        key,
        value,
        created_at,
        updated_at
      from public.erp_settings
      order by created_at desc
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET /api/settings error:", err);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// POST /api/settings  -> upsert by key
app.post("/api/settings", async (req, res) => {
  try {
    const { key, value } = req.body || {};

    if (!key) {
      return res.status(400).json({ error: "Settings key is required" });
    }

    const result = await db.query(
      `
      insert into public.erp_settings (key, value)
      values ($1, $2::jsonb)
      on conflict (key)
      do update set
        value = excluded.value,
        updated_at = now()
      returning id, key, value, created_at, updated_at
      `,
      [key, JSON.stringify(value || {})]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("POST /api/settings error:", err);
    res.status(500).json({ error: "Failed to save settings" });
  }
});

// =====================================================
// ERP USERS ROUTES (APP USERS + ADVANCED ACCESS)
// =====================================================

// GET /api/erp-users
app.get("/api/erp-users", async (req, res) => {
  try {
    const result = await db.query(
      `
      select
        id,
        auth_user_id,
        email,
        full_name,
        role,
        department,
        allowed_modules,
        denied_modules,
        is_active,
        notes,
        created_at,
        updated_at
      from public.erp_users
      order by created_at desc
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET /api/erp-users error:", err);
    res.status(500).json({ error: "Failed to fetch ERP users" });
  }
});

// POST /api/erp-users
app.post("/api/erp-users", async (req, res) => {
  try {
    const {
      auth_user_id,
      email,
      full_name,
      role,
      department,
      allowed_modules,
      denied_modules,
      is_active,
      notes
    } = req.body || {};

    if (!email || !role) {
      return res
        .status(400)
        .json({ error: "Both email and role are required to create a user" });
    }

    const result = await db.query(
      `
      insert into public.erp_users (
        auth_user_id,
        email,
        full_name,
        role,
        department,
        allowed_modules,
        denied_modules,
        is_active,
        notes
      )
      values (
        $1,
        $2,
        $3,
        $4,
        $5,
        coalesce($6,'{}'::text[]),
        coalesce($7,'{}'::text[]),
        coalesce($8,true),
        $9
      )
      returning
        id,
        auth_user_id,
        email,
        full_name,
        role,
        department,
        allowed_modules,
        denied_modules,
        is_active,
        notes,
        created_at,
        updated_at
      `,
      [
        auth_user_id || null,
        email.toLowerCase(),
        full_name || null,
        role,
        department || null,
        Array.isArray(allowed_modules) ? allowed_modules : [],
        Array.isArray(denied_modules) ? denied_modules : [],
        typeof is_active === "boolean" ? is_active : true,
        notes || null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("POST /api/erp-users error:", err);
    res.status(500).json({ error: "Failed to create ERP user" });
  }
});

// PATCH /api/erp-users/:id
app.patch("/api/erp-users/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    if (!userId) {
      return res.status(400).json({ error: "User id is required" });
    }

    const {
      auth_user_id,
      email,
      full_name,
      role,
      department,
      allowed_modules,
      denied_modules,
      is_active,
      notes
    } = req.body || {};

    const fields = [];
    const values = [];
    let idx = 1;

    function pushField(columnName, value) {
      if (typeof value === "undefined") return;
      fields.push(`${columnName} = $${idx}`);
      values.push(value);
      idx++;
    }

    pushField("auth_user_id", auth_user_id || null);
    if (email) pushField("email", email.toLowerCase());
    pushField("full_name", full_name || null);
    pushField("role", role);
    pushField("department", department || null);
    if (Array.isArray(allowed_modules)) pushField("allowed_modules", allowed_modules);
    if (Array.isArray(denied_modules)) pushField("denied_modules", denied_modules);
    if (typeof is_active === "boolean") pushField("is_active", is_active);
    if (typeof notes !== "undefined") pushField("notes", notes || null);

    fields.push(`updated_at = now()`);

    if (fields.length === 1) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const sql = `
      update public.erp_users
      set ${fields.join(", ")}
      where id = $${idx}
      returning
        id,
        auth_user_id,
        email,
        full_name,
        role,
        department,
        allowed_modules,
        denied_modules,
        is_active,
        notes,
        created_at,
        updated_at
    `;
    values.push(userId);

    const result = await db.query(sql, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("PATCH /api/erp-users/:id error:", err);
    res.status(500).json({ error: "Failed to update ERP user" });
  }
});

// =====================================================
// INVENTORY ROUTES (ITEMS + STOCK MOVEMENTS)
// =====================================================

// =====================================================
// INVENTORY ROUTES (ITEMS + STOCK MOVEMENTS)
// =====================================================

// GET /api/inventory-items
app.get("/api/inventory-items", async (req, res) => {
  try {
    const result = await db.query(
      `
      select
        id,
        item_code as part_number,
        coalesce(name, description) as description,
        category,
        uom,
        current_stock,
        min_stock_level
      from public.inventory_items
      where is_active = true
      order by category nulls last, item_code
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error("GET /api/inventory-items error:", err);
    res.status(500).json({ error: "Failed to fetch inventory items" });
  }
});

// POST /api/inventory/usage  -> log OUT movement from usage form
app.post("/api/inventory/usage", async (req, res) => {
  const { item_id, job_id, quantity, note } = req.body || {};

  try {
    if (!item_id || !quantity) {
      return res
        .status(400)
        .json({ error: "item_id and quantity are required" });
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return res
        .status(400)
        .json({ error: "Quantity must be a number > 0" });
    }

    // Make sure item exists and is active
    const itemResult = await db.query(
      `
      select id, current_stock
      from public.inventory_items
      where id = $1 and is_active = true
      `,
      [item_id]
    );

    if (itemResult.rowCount === 0) {
      return res.status(404).json({ error: "Inventory item not found" });
    }

    const currentStock = Number(itemResult.rows[0].current_stock) || 0;

    // Business decision: allow negative or not
    // For now, we allow it but log a warning
    if (currentStock < qty) {
      console.warn(
        "Inventory usage would drive stock negative:",
        { item_id, currentStock, qty }
      );
    }

    await db.query("BEGIN");

    // 1) Insert stock movement (OUT)
    await db.query(
      `
      insert into public.stock_movements (
        item_id,
        direction,
        quantity,
        job_id,
        note
      )
      values ($1, 'out'::stock_direction, $2, $3, $4)
      `,
      [item_id, qty, job_id || null, note || null]
    );

    // 2) Update current stock
    await db.query(
      `
      update public.inventory_items
      set current_stock = current_stock - $1,
          updated_at   = now()
      where id = $2
      `,
      [qty, item_id]
    );

    await db.query("COMMIT");
    res.status(201).json({ success: true });
  } catch (err) {
    await db.query("ROLLBACK").catch(() => {});
    console.error("POST /api/inventory/usage error:", err);
    res.status(500).json({ error: "Failed to record inventory usage" });
  }
});


// =====================================================
// QUOTATIONS ROUTES
// =====================================================

// GET /api/quotations
app.get("/api/quotations", async (req, res) => {
  try {
    const result = await db.query(
      `
      select
        q.id,
        q.quote_number,
        q.client_id,
        c.name as client_name,
        q.job_id,
        q.status,
        q.valid_until,
        q.subtotal,
        q.tax_amount,
        q.total,
        q.notes,
        q.created_at,
        q.updated_at
      from public.quotations q
      left join public.clients c on c.id = q.client_id
      order by q.created_at desc
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET /api/quotations error:", err);
    res.status(500).json({ error: "Failed to fetch quotations" });
  }
});

// POST /api/quotations
app.post("/api/quotations", async (req, res) => {
  try {
    const {
      quote_number,
      client_id,
      job_id,
      status,
      valid_until,
      subtotal,
      tax_amount,
      total,
      notes
    } = req.body || {};

    if (!client_id) {
      return res.status(400).json({ error: "client_id is required" });
    }

    const result = await db.query(
      `
      insert into public.quotations (
        quote_number,
        client_id,
        job_id,
        status,
        valid_until,
        subtotal,
        tax_amount,
        total,
        notes
      )
      values (
        $1,$2,$3,
        coalesce($4,'draft'),
        $5,
        coalesce($6,0),
        coalesce($7,0),
        coalesce($8,coalesce($6,0)+coalesce($7,0)),
        $9
      )
      returning *
      `,
      [
        quote_number || null,
        client_id,
        job_id || null,
        status,
        valid_until || null,
        subtotal,
        tax_amount,
        total,
        notes || null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("POST /api/quotations error:", err);
    res.status(500).json({ error: "Failed to create quotation" });
  }
});

// PATCH /api/quotations/:id
app.patch("/api/quotations/:id", async (req, res) => {
  try {
    const quoteId = req.params.id;
    if (!quoteId) {
      return res.status(400).json({ error: "Quotation id is required" });
    }

    const {
      quote_number,
      status,
      valid_until,
      subtotal,
      tax_amount,
      total,
      notes
    } = req.body || {};

    const fields = [];
    const values = [];
    let idx = 1;

    function pushField(columnName, value) {
      if (typeof value === "undefined") return;
      fields.push(`${columnName} = $${idx}`);
      values.push(value);
      idx++;
    }

    pushField("quote_number", quote_number || null);
    pushField("status", status);
    pushField("valid_until", valid_until || null);
    pushField("subtotal", subtotal);
    pushField("tax_amount", tax_amount);
    pushField("total", total);
    pushField("notes", notes || null);
    fields.push("updated_at = now()");

    if (fields.length === 1) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const sql = `
      update public.quotations
      set ${fields.join(", ")}
      where id = $${idx}
      returning *
    `;
    values.push(quoteId);

    const result = await db.query(sql, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Quotation not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("PATCH /api/quotations/:id error:", err);
    res.status(500).json({ error: "Failed to update quotation" });
  }
});

// =====================================================
// INVOICES & FINANCE ROUTES
// =====================================================

// GET /api/invoices
app.get("/api/invoices", async (req, res) => {
  try {
    const result = await db.query(
      `
      select
        i.id,
        i.invoice_number,
        i.client_id,
        i.job_id,
        i.status,
        i.subtotal,
        i.tax_amount,
        i.total,
        i.issue_date,
        i.due_date,
        i.notes,
        i.created_at,
        json_build_object(
          'name', c.name,
          'billing_contact', c.billing_contact,
          'billing_email', c.billing_email,
          'billing_phone', c.billing_phone,
          'address_line1', c.address_line1,
          'city', c.city,
          'state', c.state,
          'postal_code', c.postal_code,
          'country', c.country
        ) as client
      from public.invoices i
      left join public.clients c on c.id = i.client_id
      order by i.issue_date asc nulls last, i.created_at asc
      `
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET /api/invoices error:", err);
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
});

// POST /api/invoices
app.post("/api/invoices", async (req, res) => {
  try {
    const {
      invoice_number,
      client_id,
      job_id,
      status,
      subtotal,
      tax_amount,
      total,
      issue_date,
      due_date,
      notes
    } = req.body || {};

    if (!client_id) {
      return res.status(400).json({ error: "client_id is required" });
    }

    const result = await db.query(
      `
      insert into public.invoices (
        invoice_number,
        client_id,
        job_id,
        status,
        subtotal,
        tax_amount,
        total,
        issue_date,
        due_date,
        notes
      )
      values (
        $1,$2,$3,
        coalesce($4,'unpaid')::invoice_status,
        coalesce($5,0),
        coalesce($6,0),
        coalesce($7,coalesce($5,0)+coalesce($6,0)),
        $8,
        $9,
        $10
      )
      returning *
      `,
      [
        invoice_number || null,
        client_id,
        job_id || null,
        status,
        subtotal,
        tax_amount,
        total,
        issue_date || null,
        due_date || null,
        notes || null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("POST /api/invoices error:", err);
    res.status(500).json({ error: "Failed to create invoice" });
  }
});

// PATCH /api/invoices/:id
app.patch("/api/invoices/:id", async (req, res) => {
  try {
    const invoiceId = req.params.id;
    if (!invoiceId) {
      return res.status(400).json({ error: "Invoice id is required" });
    }

    const {
      invoice_number,
      status,
      subtotal,
      tax_amount,
      total,
      issue_date,
      due_date,
      notes
    } = req.body || {};

    const fields = [];
    const values = [];
    let idx = 1;

    function pushField(columnName, value, enumType) {
      if (typeof value === "undefined") return;
      if (enumType) {
        fields.push(
          `${columnName} = coalesce($${idx}, ${columnName})::${enumType}`
        );
      } else {
        fields.push(`${columnName} = $${idx}`);
      }
      values.push(value);
      idx++;
    }

    pushField("invoice_number", invoice_number || null);
    pushField("status", status, "invoice_status");
    pushField("subtotal", subtotal);
    pushField("tax_amount", tax_amount);
    pushField("total", total);
    pushField("issue_date", issue_date || null);
    pushField("due_date", due_date || null);
    pushField("notes", notes || null);
    fields.push("updated_at = now()");

    if (fields.length === 1) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const sql = `
      update public.invoices
      set ${fields.join(", ")}
      where id = $${idx}
      returning *
    `;
    values.push(invoiceId);

    const result = await db.query(sql, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("PATCH /api/invoices/:id error:", err);
    res.status(500).json({ error: "Failed to update invoice" });
  }
});

// GET /api/finance/summary  -> finance KPIs (for finance.html + dashboard)
app.get("/api/finance/summary", async (req, res) => {
  try {
    const jobsTotal = await db.query(
      `select count(*)::int as count from public.jobs`
    );

    const billableJobs = await db.query(
      `
      select count(*)::int as count
      from public.jobs
      where status in ('completed','closed')
      `
    );

    const invoicedJobs = await db.query(
      `
      select count(distinct job_id)::int as count
      from public.invoices
      where job_id is not null
      `
    );

    const unpaidInvoices = await db.query(
      `
      select
        count(*)::int as count,
        coalesce(sum(total),0)::numeric as total_unpaid
      from public.invoices
      where status in ('unpaid','partially_paid','overdue')
      `
    );

    const invoicedRevenue = await db.query(
      `
      select coalesce(sum(total),0)::numeric as total_invoiced
      from public.invoices
      where status in ('paid','partially_paid')
      `
    );

    const potentialRevenue = await db.query(
      `
      select coalesce(sum(j.total_amount),0)::numeric as potential
      from public.jobs j
      left join public.invoices i on i.job_id = j.id
      where j.status in ('completed','closed') and i.id is null
      `
    );

    res.json({
      total_jobs: jobsTotal.rows[0].count,
      billable_jobs: billableJobs.rows[0].count,
      invoiced_jobs: invoicedJobs.rows[0].count,
      unpaid_invoices_count: unpaidInvoices.rows[0].count,
      unpaid_invoices_amount: unpaidInvoices.rows[0].total_unpaid,
      potential_revenue: potentialRevenue.rows[0].potential,
      invoiced_revenue: invoicedRevenue.rows[0].total_invoiced
    });
  } catch (err) {
    console.error("GET /api/finance/summary error:", err);
    res.status(500).json({ error: "Failed to compute finance summary" });
  }
});

// =====================================================
// EXPENSES ROUTES
// =====================================================

// GET /api/expenses
app.get("/api/expenses", async (req, res) => {
  try {
    const result = await db.query(
      `
      select
        id,
        expense_date,
        type,
        amount,
        job_ref,
        notes,
        created_at,
        updated_at
      from public.expenses
      order by expense_date desc, created_at desc
      `
    );

    res.json(result.rows);
  } catch (err) {
    console.error("GET /api/expenses error:", err);
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
});

// POST /api/expenses
app.post("/api/expenses", async (req, res) => {
  try {
    const { expense_date, type, amount, job_ref, notes } = req.body || {};

    if (!expense_date) {
      return res.status(400).json({ error: "expense_date is required" });
    }

    const numericAmount = Number(amount || 0);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    const result = await db.query(
      `
      insert into public.expenses (
        expense_date,
        type,
        amount,
        job_ref,
        notes
      )
      values ($1,$2,$3,$4,$5)
      returning *
      `,
      [
        expense_date,
        type || "other",
        numericAmount,
        job_ref || null,
        notes || null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("POST /api/expenses error:", err);
    res.status(500).json({ error: "Failed to create expense" });
  }
});

// PATCH /api/expenses/:id
app.patch("/api/expenses/:id", async (req, res) => {
  try {
    const expId = req.params.id;
    const { expense_date, type, amount, job_ref, notes } = req.body || {};

    if (!expId) {
      return res.status(400).json({ error: "Expense id is required" });
    }

    const fields = [];
    const values = [];
    let idx = 1;

    function pushField(column, value) {
      if (value === undefined) return;
      fields.push(`${column} = $${idx}`);
      values.push(value);
      idx++;
    }

    if (amount !== undefined) {
      const numericAmount = Number(amount || 0);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ error: "Valid amount is required" });
      }
      pushField("amount", numericAmount);
    }

    pushField("expense_date", expense_date);
    pushField("type", type);
    pushField("job_ref", job_ref);
    pushField("notes", notes);
    fields.push("updated_at = now()");

    if (fields.length === 1) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const sql = `
      update public.expenses
      set ${fields.join(", ")}
      where id = $${idx}
      returning *
    `;
    values.push(expId);

    const result = await db.query(sql, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Expense not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("PATCH /api/expenses/:id error:", err);
    res.status(500).json({ error: "Failed to update expense" });
  }
});

// DELETE /api/expenses/:id
app.delete("/api/expenses/:id", async (req, res) => {
  try {
    const expId = req.params.id;
    if (!expId) {
      return res.status(400).json({ error: "Expense id is required" });
    }

    const result = await db.query(
      `delete from public.expenses where id = $1 returning id`,
      [expId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Expense not found" });
    }

    res.json({ success: true, id: expId });
  } catch (err) {
    console.error("DELETE /api/expenses/:id error:", err);
    res.status(500).json({ error: "Failed to delete expense" });
  }
});

// =====================================================
// PAYROLL ROUTES
// =====================================================

// GET /api/payroll  (optional filters: technician_id, month=YYYY-MM)
app.get("/api/payroll", async (req, res) => {
  try {
    const { technician_id, month } = req.query;

    let where = [];
    let params = [];
    let idx = 1;

    if (technician_id) {
      where.push(`technician_id = $${idx++}`);
      params.push(technician_id);
    }
    if (month) {
      where.push(
        `to_char(period_start,'YYYY-MM') = $${idx++}`
      );
      params.push(month);
    }

    const sql = `
      select
        id,
        technician_id,
        period_start,
        period_end,
        basic_pay,
        overtime_pay,
        deductions,
        net_pay,
        status,
        created_at,
        updated_at
      from public.payroll_entries
      ${where.length ? "where " + where.join(" and ") : ""}
      order by period_start desc, technician_id asc
    `;

    const result = await db.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error("GET /api/payroll error:", err);
    res.status(500).json({ error: "Failed to fetch payroll entries" });
  }
});

// POST /api/payroll
app.post("/api/payroll", async (req, res) => {
  try {
    const {
      technician_id,
      period_start,
      period_end,
      basic_pay,
      overtime_pay,
      deductions,
      net_pay,
      status
    } = req.body || {};

    if (!technician_id || !period_start || !period_end) {
      return res
        .status(400)
        .json({ error: "technician_id, period_start, period_end are required" });
    }

    const result = await db.query(
      `
      insert into public.payroll_entries (
        technician_id,
        period_start,
        period_end,
        basic_pay,
        overtime_pay,
        deductions,
        net_pay,
        status
      )
      values (
        $1,$2,$3,
        coalesce($4,0),
        coalesce($5,0),
        coalesce($6,0),
        coalesce($7,coalesce($4,0)+coalesce($5,0)-coalesce($6,0)),
        coalesce($8,'pending')
      )
      returning *
      `,
      [
        technician_id,
        period_start,
        period_end,
        basic_pay,
        overtime_pay,
        deductions,
        net_pay,
        status
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("POST /api/payroll error:", err);
    res.status(500).json({ error: "Failed to create payroll entry" });
  }
});

// PATCH /api/payroll/:id
app.patch("/api/payroll/:id", async (req, res) => {
  try {
    const payrollId = req.params.id;
    if (!payrollId) {
      return res.status(400).json({ error: "Payroll id is required" });
    }

    const {
      technician_id,
      period_start,
      period_end,
      basic_pay,
      overtime_pay,
      deductions,
      net_pay,
      status
    } = req.body || {};

    const fields = [];
    const values = [];
    let idx = 1;

    function pushField(columnName, value) {
      if (typeof value === "undefined") return;
      fields.push(`${columnName} = $${idx}`);
      values.push(value);
      idx++;
    }

    pushField("technician_id", technician_id);
    pushField("period_start", period_start);
    pushField("period_end", period_end);
    pushField("basic_pay", basic_pay);
    pushField("overtime_pay", overtime_pay);
    pushField("deductions", deductions);
    pushField("net_pay", net_pay);
    pushField("status", status);
    fields.push("updated_at = now()");

    if (fields.length === 1) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const sql = `
      update public.payroll_entries
      set ${fields.join(", ")}
      where id = $${idx}
      returning *
    `;
    values.push(payrollId);

    const result = await db.query(sql, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Payroll entry not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("PATCH /api/payroll/:id error:", err);
    res.status(500).json({ error: "Failed to update payroll entry" });
  }
});

// =====================================================
// HR DOCS ROUTES
// =====================================================

// GET /api/hr-docs
app.get("/api/hr-docs", async (req, res) => {
  try {
    const { technician_id } = req.query;
    const params = [];
    let whereClause = "";

    if (technician_id) {
      whereClause = "where technician_id = $1";
      params.push(technician_id);
    }

    const result = await db.query(
      `
      select
        id,
        technician_id,
        doc_type,
        doc_number,
        issue_date,
        expiry_date,
        status,
        notes,
        file_url,
        created_at,
        updated_at
      from public.hr_docs
      ${whereClause}
      order by expiry_date asc nulls last, created_at desc
      `,
      params
    );

    res.json(result.rows);
  } catch (err) {
    console.error("GET /api/hr-docs error:", err);
    res.status(500).json({ error: "Failed to fetch HR docs" });
  }
});

// POST /api/hr-docs
app.post("/api/hr-docs", async (req, res) => {
  try {
    const {
      technician_id,
      doc_type,
      doc_number,
      issue_date,
      expiry_date,
      status,
      notes,
      file_url
    } = req.body || {};

    if (!technician_id || !doc_type || !expiry_date) {
      return res.status(400).json({
        error: "technician_id, doc_type and expiry_date are required"
      });
    }

    const result = await db.query(
      `
      insert into public.hr_docs (
        technician_id,
        doc_type,
        doc_number,
        issue_date,
        expiry_date,
        status,
        notes,
        file_url
      )
      values (
        $1,$2,$3,
        $4,
        $5,
        coalesce($6,'valid')::hr_doc_status,
        $7,
        $8
      )
      returning *
      `,
      [
        technician_id,
        doc_type,
        doc_number || null,
        issue_date || null,
        expiry_date,
        status,
        notes || null,
        file_url || null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("POST /api/hr-docs error:", err);
    res.status(500).json({ error: "Failed to create HR doc" });
  }
});

// PATCH /api/hr-docs/:id
app.patch("/api/hr-docs/:id", async (req, res) => {
  try {
    const docId = req.params.id;
    if (!docId) {
      return res.status(400).json({ error: "HR doc id is required" });
    }

    const {
      technician_id,
      doc_type,
      doc_number,
      issue_date,
      expiry_date,
      status,
      notes,
      file_url
    } = req.body || {};

    const fields = [];
    const values = [];
    let idx = 1;

    function pushField(columnName, value, enumType) {
      if (typeof value === "undefined") return;
      if (enumType) {
        fields.push(
          `${columnName} = coalesce($${idx}, ${columnName})::${enumType}`
        );
      } else {
        fields.push(`${columnName} = $${idx}`);
      }
      values.push(value);
      idx++;
    }

    pushField("technician_id", technician_id);
    pushField("doc_type", doc_type);
    pushField("doc_number", doc_number || null);
    pushField("issue_date", issue_date || null);
    pushField("expiry_date", expiry_date || null);
    pushField("status", status, "hr_doc_status");
    pushField("notes", notes || null);
    pushField("file_url", file_url || null);
    fields.push("updated_at = now()");

    if (fields.length === 1) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const sql = `
      update public.hr_docs
      set ${fields.join(", ")}
      where id = $${idx}
      returning *
    `;
    values.push(docId);

    const result = await db.query(sql, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "HR doc not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("PATCH /api/hr-docs/:id error:", err);
    res.status(500).json({ error: "Failed to update HR doc" });
  }
});

// =====================================================
// REPORTS (EXECUTIVE OVERVIEW)
// =====================================================

// GET /api/reports/summary  -> executive KPIs (for reports.html / index.html)
app.get("/api/reports/summary", async (req, res) => {
  try {
    const jobsTotal = await db.query(
      `select count(*)::int as count from public.jobs`
    );
    const jobsByStatus = await db.query(
      `
      select status, count(*)::int as count
      from public.jobs
      group by status
      `
    );
    const returns = await db.query(
      `
      select count(*)::int as count
      from public.jobs
      where is_return_job = true
      `
    );
    const clientsTotal = await db.query(
      `select count(*)::int as count from public.clients`
    );
    const revenue = await db.query(
      `
      select coalesce(sum(total),0)::numeric as total_revenue
      from public.invoices
      where status in ('paid','partially_paid')
      `
    );
    const expenses = await db.query(
      `
      select coalesce(sum(amount),0)::numeric as total_expenses
      from public.expenses
      `
    );

    const totalJobs = jobsTotal.rows[0].count;
    const statusMap = {};
    for (const row of jobsByStatus.rows) {
      statusMap[row.status] = row.count;
    }
    const completed =
      (statusMap["completed"] || 0) + (statusMap["closed"] || 0);
    const returnsCount = returns.rows[0].count;
    const successRatio =
      totalJobs > 0 ? (completed / totalJobs) * 100.0 : 0;
    const returnRatio =
      totalJobs > 0 ? (returnsCount / totalJobs) * 100.0 : 0;

    res.json({
      total_jobs: totalJobs,
      jobs_by_status: statusMap,
      completed_jobs: completed,
      returns: returnsCount,
      success_ratio: successRatio,
      return_ratio: returnRatio,
      total_clients: clientsTotal.rows[0].count,
      total_revenue: revenue.rows[0].total_revenue,
      total_expenses: expenses.rows[0].total_expenses,
      net_revenue:
        Number(revenue.rows[0].total_revenue) -
        Number(expenses.rows[0].total_expenses)
    });
  } catch (err) {
    console.error("GET /api/reports/summary error:", err);
    res.status(500).json({ error: "Failed to compute reports summary" });
  }
});


// =====================================================
// AUTH / LOGIN (email-based using erp_users in Neon)
// =====================================================

// app.post("/api/login", async (req, res) => {
//   try {
//     const { email } = req.body || {};

//     if (!email) {
//       return res
//         .status(400)
//         .json({ error: "Email is required for login" });
//     }

//     const result = await db.query(
//       `
//       select
//         id,
//         email,
//         full_name,
//         role,
//         department,
//         allowed_modules,
//         denied_modules,
//         is_active,
//         created_at,
//         updated_at
//       from public.erp_users
//       where lower(email) = lower($1)
//       limit 1
//       `,
//       [email.trim().toLowerCase()]
//     );

//     if (result.rowCount === 0) {
//       return res
//         .status(401)
//         .json({ error: "Invalid email or account not found" });
//     }

//     const user = result.rows[0];

//     if (user.is_active === false) {
//       return res
//         .status(403)
//         .json({ error: "Your ERP account is inactive. Contact admin." });
//     }

//     res.json({
//       id: user.id,
//       email: user.email,
//       full_name: user.full_name,
//       role: user.role,
//       department: user.department,
//       allowed_modules: user.allowed_modules || [],
//       denied_modules: user.denied_modules || [],
//       is_active: user.is_active
//     });
//   } catch (err) {
//     console.error("POST /api/login error:", err);
//     res.status(500).json({ error: "Login failed due to server error" });
//   }
// });

// =====================================================
// AUTH / LOGIN
// =====================================================
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email and password are required." });
    }

    const result = await db.query(
      `
      select
        id,
        email,
        full_name,
        role,
        department,
        allowed_modules,
        denied_modules,
        is_active,
        password_hash
      from public.erp_users
      where email = $1
      limit 1
      `,
      [email]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: "User is inactive." });
    }

    if (!user.password_hash) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    // Never send hash back
    const { password_hash, ...safeUser } = user;

    res.json(safeUser);
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// TEMP: password hash helper (remove after use)
app.post("/api/util/hash", async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: "Password is required" });
    }

    const hash = await bcrypt.hash(password, 10);
    res.json({ hash });
  } catch (err) {
    console.error("Hash helper error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {
  console.log(`🚀 Service Pro ERP backend listening on port ${PORT}`);
});
