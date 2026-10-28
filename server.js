require("dotenv").config();

const express = require("express");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const nodemailer = require("nodemailer");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const required = ["DATABASE_URL", "SESSION_SECRET", "ADMIN_USERNAME", "ADMIN_PASSWORD"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.warn("Missing environment variables:", missing.join(", "));
  console.warn("Copy .env.example to .env and configure required values before running.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
});

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(session({
  store: new PgSession({ pool, createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || "development-only-change-this",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8
  }
}));

const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(254) NOT NULL,
      phone VARCHAR(50),
      style VARCHAR(80) NOT NULL,
      placement VARCHAR(120),
      size VARCHAR(80),
      preferred_date DATE,
      preferred_time VARCHAR(40),
      budget VARCHAR(80),
      description TEXT NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'Pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS bookings_created_at_idx ON bookings (created_at DESC)
  `);
}

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}
function adminOnly(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: "Please sign in to the studio dashboard." });
}
function mailer() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}
async function sendBookingEmail(booking) {
  const transport = mailer();
  if (!transport) return false;
  const to = process.env.STUDIO_EMAIL || "blueraventattoo@outlook.com";
  const from = process.env.FROM_EMAIL || process.env.SMTP_USER;
  await transport.sendMail({
    from, to,
    subject: `New tattoo booking request #${booking.id} — ${booking.name}`,
    text: [
      `Booking request #${booking.id}`,
      `Name: ${booking.name}`,
      `Email: ${booking.email}`,
      `Phone: ${booking.phone || "Not supplied"}`,
      `Style: ${booking.style}`,
      `Placement: ${booking.placement || "Not supplied"}`,
      `Size: ${booking.size || "Not supplied"}`,
      `Preferred date: ${booking.preferred_date || "Flexible / not supplied"}`,
      `Preferred time: ${booking.preferred_time || "Flexible / not supplied"}`,
      `Budget: ${booking.budget || "Not supplied"}`,
      "",
      "Idea / details:",
      booking.description,
      "",
      "Status: Pending — this is a request, not a confirmed appointment."
    ].join("\n")
  });
  return true;
}
async function sendCustomerEmail(booking, status) {
  const transport = mailer();
  if (!transport) return false;
  const from = process.env.FROM_EMAIL || process.env.SMTP_USER;
  const message = status === "Approved"
    ? "Your requested appointment has been marked approved by the studio. Please contact the studio directly to confirm the final appointment details."
    : status === "Declined"
    ? "The studio is unable to accept this booking request as submitted. Please contact the studio if you would like to discuss another date or idea."
    : "Your booking request is still pending review by the studio.";
  await transport.sendMail({
    from, to: booking.email,
    subject: `Blue Raven Tattoo — booking request #${booking.id} update`,
    text: `Hi ${booking.name},\n\n${message}\n\nBlue Raven Tattoo\n+1 304-520-4160\nblueraventattoo@outlook.com`
  });
  return true;
}

app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/api/config", (req, res) => res.json({ studioName: "Blue Raven Tattoo" }));

app.post("/api/bookings", async (req, res) => {
  try {
    const name = clean(req.body.name, 120);
    const email = clean(req.body.email, 254);
    const phone = clean(req.body.phone, 50);
    const style = clean(req.body.style, 80);
    const placement = clean(req.body.placement, 120);
    const size = clean(req.body.size, 80);
    const preferredDate = clean(req.body.preferredDate, 10);
    const preferredTime = clean(req.body.preferredTime, 40);
    const budget = clean(req.body.budget, 80);
    const description = clean(req.body.description, 3000);

    if (!name || !email || !style || !description) {
      return res.status(400).json({ error: "Please complete your name, email, style, and tattoo idea." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    let dateValue = null;
    if (preferredDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(preferredDate) || Number.isNaN(Date.parse(preferredDate))) {
        return res.status(400).json({ error: "Please choose a valid preferred date." });
      }
      dateValue = preferredDate;
    }

    const result = await pool.query(
      `INSERT INTO bookings (name,email,phone,style,placement,size,preferred_date,preferred_time,budget,description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id,name,email,phone,style,placement,size,preferred_date,preferred_time,budget,description,status,created_at`,
      [name,email,phone,style,placement,size,dateValue,preferredTime,budget,description]
    );
    const booking = result.rows[0];
    let emailSent = false;
    try { emailSent = await sendBookingEmail(booking); }
    catch (mailError) { console.error("Studio notification email failed:", mailError.message); }

    return res.status(201).json({
      message: "Your booking request has been received. It is not confirmed until the studio contacts you.",
      bookingId: booking.id,
      emailNotificationSent: emailSent
    });
  } catch (error) {
    console.error("Booking creation failed:", error);
    return res.status(500).json({ error: "We couldn't save your request right now. Please call the studio directly." });
  }
});

app.post("/api/admin/login", async (req, res) => {
  const username = clean(req.body.username, 120);
  const password = String(req.body.password || "");
  const expectedUser = process.env.ADMIN_USERNAME || "";
  const expectedPassword = process.env.ADMIN_PASSWORD || "";
  const userOk = username.length === expectedUser.length && username === expectedUser;
  // Compare the configured password without storing it in the source code.
  const passwordOk = password.length === expectedPassword.length && password === expectedPassword;
  if (!userOk || !passwordOk) return res.status(401).json({ error: "Incorrect username or password." });
  req.session.isAdmin = true;
  req.session.adminUser = username;
  return res.json({ ok: true });
});
app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});
app.get("/api/admin/me", (req, res) => res.json({ signedIn: !!(req.session && req.session.isAdmin) }));

app.get("/api/admin/bookings", adminOnly, async (req, res) => {
  try {
    const status = clean(req.query.status, 24);
    const allowed = ["Pending", "Approved", "Declined", "Completed"];
    let result;
    if (allowed.includes(status)) {
      result = await pool.query("SELECT * FROM bookings WHERE status=$1 ORDER BY created_at DESC LIMIT 500", [status]);
    } else {
      result = await pool.query("SELECT * FROM bookings ORDER BY created_at DESC LIMIT 500");
    }
    res.json({ bookings: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to load bookings." });
  }
});
app.patch("/api/admin/bookings/:id", adminOnly, async (req, res) => {
  const id = Number(req.params.id);
  const status = clean(req.body.status, 24);
  const allowed = ["Pending", "Approved", "Declined", "Completed"];
  if (!Number.isSafeInteger(id) || id < 1 || !allowed.includes(status)) {
    return res.status(400).json({ error: "Invalid booking ID or status." });
  }
  try {
    const result = await pool.query(
      "UPDATE bookings SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *",
      [status, id]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Booking not found." });
    try { await sendCustomerEmail(result.rows[0], status); }
    catch (mailError) { console.error("Customer status email failed:", mailError.message); }
    res.json({ booking: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to update booking." });
  }
});

app.get("/admin", (req, res) => res.sendFile(path.join(publicDir, "admin.html")));
app.get("*", (req, res) => res.sendFile(path.join(publicDir, "index.html")));

initDb().then(() => {
  app.listen(PORT, () => console.log(`Blue Raven Tattoo website listening on port ${PORT}`));
}).catch((error) => {
  console.error("Database setup failed. Check DATABASE_URL and database access.", error);
  process.exit(1);
});
