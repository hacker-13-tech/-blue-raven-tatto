# Blue Raven Tattoo — website + booking requests

A responsive website based on the supplied Blue Raven Tattoo profile screenshots. Includes a real server-backed booking-request form, PostgreSQL storage, a private studio dashboard, and optional email notifications.

## Features
- Mobile-friendly studio website and tattoo gallery
- Booking request form: contact details, tattoo style, placement, size, preferred date/time, budget, and description
- PostgreSQL storage (requests persist in the database)
- Private dashboard at `/admin`
- Filter bookings and change status to Pending, Approved, Declined, or Completed
- Optional SMTP email to notify the studio of new requests and customers of status changes
- Booking requests are not automatically confirmed; studio must confirm the actual appointment

## What you need
- GitHub account
- Render account
- A PostgreSQL database URL (Render PostgreSQL or another PostgreSQL provider)
- Optional SMTP email credentials to enable email notifications

## Run locally
1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env` and fill in the required values.
3. Run `npm install`
4. Run `npm start`
5. Open `http://localhost:3000`

Do not upload `.env` or passwords to GitHub.

## Deploy on Render
1. Create a GitHub repository named `blue-raven-tattoo`.
2. Extract this ZIP and upload the *contents* of this folder to the repository root. The root should contain `package.json`, `server.js`, `render.yaml`, `public/`, and `.env.example`.
3. In Render, create a PostgreSQL database. Copy its **Internal Database URL** if the web service is in the same Render region. If using an external database URL, use that provider's connection details.
4. Create a Render **Web Service** connected to your GitHub repository. Runtime: Node. Build command: `npm install`. Start command: `npm start`.
5. In Render Environment, add:
   - `DATABASE_URL` = database connection URL
   - `DATABASE_SSL` = `true` if your database provider requires SSL (Render internal URLs usually use the provider's recommended setting)
   - `SESSION_SECRET` = a long random secret
   - `ADMIN_USERNAME` = the studio's chosen admin username
   - `ADMIN_PASSWORD` = a long, unique password
   - `STUDIO_EMAIL` = `blueraventattoo@outlook.com`
6. Optional email notifications: set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `FROM_EMAIL` using credentials from an email provider that permits SMTP sending. Do not use your regular email password unless your provider explicitly supports it.
7. Deploy. Open the Render URL. Booking page is `/`; studio dashboard is `/admin`.
8. Test by submitting a booking request and checking it appears in `/admin`.

## Email setup
Email notifications are disabled until SMTP variables are configured. Booking requests are still saved to PostgreSQL when SMTP is not configured. Set the sender address to one your SMTP provider authorizes.

## Notes
- The phone, address, email, Instagram handle, experience claim, and recommendation count came from screenshots supplied by the user. Verify they are accurate and that you have permission to use the images before publishing.
- The booking form is a **request**, not a live availability calendar. The studio must review the request and confirm the exact slot directly.
- This project does not take deposits or card payments.
- Configure a strong admin password and keep credentials private.
