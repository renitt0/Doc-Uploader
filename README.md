# Customer Portal – Document Upload System

A secure, full-stack document management application built with FastAPI and React that allows users to register, log in, and manage private file uploads.

---

## Tech Stack

| Layer            | Technology            | Reason                                                                  |
| ---------------- | --------------------- | ----------------------------------------------------------------------- |
| Backend API      | **FastAPI**           | High-performance async Python API with auto-generated OpenAPI docs      |
| ORM              | **SQLAlchemy**        | Database-agnostic ORM makes switching from SQLite to PostgreSQL trivial |
| Database         | **SQLite**            | Zero-config, file-based database ideal for local development            |
| Auth             | **JWT (python-jose)** | Stateless token auth — no server-side session storage required          |
| Password Hashing | **passlib / bcrypt**  | Industry-standard adaptive hashing resistant to brute-force attacks     |
| Frontend         | **React + Vite**      | Fast HMR dev experience with a minimal production build                 |

---

## Project Structure

```
customer-portal/
├── backend/
│   ├── main.py          # FastAPI app and all route definitions
│   ├── database.py      # SQLAlchemy engine and session setup
│   ├── models.py        # User and Document database models
│   ├── schemas.py       # Pydantic request and response schemas
│   ├── auth.py          # Password hashing and JWT logic
│   ├── uploads/         # Uploaded files stored here (git ignored)
│   │   └── .gitkeep     # Keeps the folder tracked in git
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/       # Login, Register, Dashboard
│   │   ├── services/    # Axios instance and API calls
│   │   └── App.jsx      # Routes setup
│   └── package.json
└── README.md
```

---

## Prerequisites

- Python 3.10+
- Node.js 18+
- Git

---

## Backend Setup

```bash
cd customer-portal/backend
```

```bash
python -m venv .venv
```

Activate the virtual environment:

```bash
# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate
```

```bash
pip install -r requirements.txt
```

Create a `.env` file in the `backend/` directory:

```env
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

> **Tip:** Generate a strong secret key with `python -c "import secrets; print(secrets.token_hex(32))"`

```bash
uvicorn main:app --reload
```

Visit **http://localhost:8000/docs** to verify the API is running and explore all endpoints interactively.

---

## Frontend Setup

```bash
cd customer-portal/frontend
```

```bash
npm install
```

```bash
npm run dev
```

Visit **http://localhost:5173** to open the app.

---

## API Endpoints

| Method   | Endpoint                   | Auth Required | Description                                       |
| -------- | -------------------------- | ------------- | ------------------------------------------------- |
| `POST`   | `/auth/register`           | No            | Register a new user with email and password       |
| `POST`   | `/auth/login`              | No            | Log in and receive a JWT access token             |
| `GET`    | `/auth/me`                 | ✅ Yes        | Get current authenticated user info               |
| `GET`    | `/documents/`              | ✅ Yes        | List all documents belonging to the current user  |
| `POST`   | `/documents/upload`        | ✅ Yes        | Upload a new file (validated before saving)       |
| `GET`    | `/documents/{id}/download` | ✅ Yes        | Download or view a file owned by the current user |
| `DELETE` | `/documents/{id}`          | ✅ Yes        | Delete a file record and its stored copy          |

---

## Key Assumptions

- **SQLite for portability.** The SQLAlchemy ORM abstracts the database layer — switching to PostgreSQL requires only changing the connection string in `database.py`, no code changes needed.

- **UUID filenames on disk.** Files are stored with UUID-generated names to prevent collisions and path traversal attacks. Original filenames are preserved in the database for display.

- **JWT expiry.** Tokens expire after 30 minutes. The frontend's global Axios interceptor automatically clears the session and redirects to `/login` on any `401` response.

- **Strict ownership checks.** Every document endpoint filters by both `document_id` AND `user_id`. A user querying another user's document ID receives a `404` — not a `403` — to avoid leaking that the document exists.

- **Uploads folder:** The uploads/ directory is tracked in git via a .gitkeep file but its contents are ignored. The folder is also created automatically at app startup using os.makedirs("uploads", exist_ok=True) so no manual setup is needed.

---

## File Validation

| Rule                  | Constraint                                            |
| --------------------- | ----------------------------------------------------- |
| Maximum file size     | 10 MB                                                 |
| Allowed file types    | `.pdf`, `.jpg`, `.png`, `.docx`                       |
| Validation location   | Server-side (backend) before the file touches disk    |
| Client-side pre-check | Yes — instant error shown before the API call is made |

Server-side validation is the source of truth. Client-side validation is a UX convenience only.
