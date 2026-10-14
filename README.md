# Real-Time Polling Platform

A backend API for running live polls. Hosts create sessions, add polls and publish them; participants join a session with a short code and answer. Published polls go out to everyone in the session over WebSockets as soon as the host publishes them.

Built with **Node.js**, **Express 5**, **PostgreSQL** and **Socket.IO**.

---

## Features

- **Host accounts**: registration and login with bcrypt-hashed passwords and JWT authentication
- **Sessions**: hosts create sessions, and each one gets a unique 6-character join code
- **Polls**: three poll types (`single-choice`, `multiple-choice`, `open-ended`) that move through a `draft → published → closed` lifecycle
- **Real-time delivery**: publishing a poll sends a `pollPublished` event to every participant in that session's Socket.IO room
- **Participants**: join with a name and email, no account needed; a participant can change their answer by submitting again
- **Results**: hosts see each participant's response, broken down by option for choice polls
- **Validation**: request validation with `express-validator`

---

## Tech Stack

| Layer          | Technology                          |
| -------------- | ----------------------------------- |
| Runtime        | Node.js (ES modules)                |
| Web framework  | Express 5                           |
| Database       | PostgreSQL (`pg` connection pool)   |
| Real-time      | Socket.IO 4                         |
| Auth           | JSON Web Tokens, bcrypt             |
| Validation     | express-validator                   |
| Logging        | morgan                              |

---

## Project Structure

```
.
├── app.js                  # Express app, Socket.IO server, middleware and routes
├── bin/www                 # Entry point: starts the HTTP server
├── config/
│   ├── db.js               # PostgreSQL connection pool
│   └── db-init.js          # Creates tables on startup (if they don't exist)
├── middleware/
│   ├── auth.js             # JWT bearer-token verification
│   ├── ratelimiting.js     # Rate limiter for auth endpoints
│   └── regValidation.js    # Register/login validation rules
├── routes/
│   ├── index.js            # GET /: health/welcome message
│   ├── host.js             # /api/host/*: host-facing endpoints
│   └── participant.js      # /api/participant/*: participant-facing endpoints
├── views/                  # Jade templates (error page)
└── public/                 # Static assets
```

---

## Getting Started

### Prerequisites

- Node.js 18 or newer
- A PostgreSQL database (local or hosted, e.g. Aiven, Railway, Supabase)

### Installation

```bash
git clone https://github.com/kongnyuroger/real-time-polling-platform.git
cd real-time-polling-platform
npm install
```

### Configuration

Create a `.env` file in the project root:

```env
# Server
PORT=3000
ORIGIN=http://localhost:5173      # Frontend origin allowed to connect to Socket.IO

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=pollingdb

# Auth
SECRET_KEY=a_long_random_secret
TOKEN_LENGTH=1h                   # JWT lifetime, e.g. 15m, 1h, 7d
```

| Variable       | Required | Default     | Description                                   |
| -------------- | -------- | ----------- | --------------------------------------------- |
| `PORT`         | No       | `3000`      | Port the server listens on                    |
| `ORIGIN`       | Yes      | n/a         | Allowed CORS origin for Socket.IO             |
| `DB_HOST`      | No       | `localhost` | PostgreSQL host                               |
| `DB_PORT`      | No       | `5432`      | PostgreSQL port                               |
| `DB_USER`      | Yes      | n/a         | PostgreSQL user                               |
| `DB_PASSWORD`  | No       | `1234`      | PostgreSQL password                           |
| `DB_NAME`      | No       | `pollingdb` | Database name                                 |
| `SECRET_KEY`   | Yes      | n/a         | Secret used to sign JWTs                      |
| `TOKEN_LENGTH` | Yes      | n/a         | JWT expiry (any format `jsonwebtoken` accepts) |

> **Note:** The database connection uses SSL (`ssl: { rejectUnauthorized: false }`), which hosted providers such as Aiven require. A local PostgreSQL install without SSL will refuse the connection. Either enable SSL locally or remove the `ssl` option in `config/db.js` for local development.

### Running

```bash
npm start
```

On startup the server creates any missing tables. Open `http://localhost:3000/` and you should see `welcome to pollpules api`.

---

## Database Schema

Tables are created automatically by `config/db-init.js`:

```
hosts ──< sessions ──< polls ──< poll_options
              │           │
              └──< participants ──< responses >── polls
```

| Table          | Key columns                                                                  |
| -------------- | ---------------------------------------------------------------------------- |
| `hosts`        | `id`, `email` (unique), `name` (unique), `password_hash`                     |
| `sessions`     | `id`, `host_id`, `session_code` (unique), `name`                             |
| `polls`        | `id`, `session_id`, `question`, `status` (`draft` by default), `type`        |
| `poll_options` | `id`, `poll_id`, `text`                                                      |
| `participants` | `id`, `session_id`, `name`, `email`, unique on (`session_id`, `email`)       |
| `responses`    | `id`, `poll_id`, `participant_id`, `response_data` (JSONB), unique on (`poll_id`, `participant_id`) |

Deleting a host, session or poll also deletes its dependent rows (`ON DELETE CASCADE`).

---

## API Reference

Base URL: `http://localhost:3000`

Endpoints marked 🔒 need an `Authorization: Bearer <token>` header with the token returned by `/api/host/login`.

### Host endpoints (`/api/host`)

| Method | Endpoint                         | Auth | Description                                  |
| ------ | -------------------------------- | ---- | -------------------------------------------- |
| POST   | `/register`                      |      | Register a host account                      |
| POST   | `/login`                         |      | Log in and get a JWT                         |
| POST   | `/sessions`                      | 🔒   | Create a session                             |
| GET    | `/sessions`                      | 🔒   | List the host's sessions                     |
| GET    | `/sessions/:sessionId`           | 🔒   | Get a session and all its polls              |
| POST   | `/sessions/:sessionId/polls`     | 🔒   | Create a poll (status `draft`)               |
| PUT    | `/polls/:pollId/publish`         | 🔒   | Publish a poll and broadcast it              |
| PUT    | `/polls/:pollId/close`           | 🔒   | Close a poll                                 |
| GET    | `/polls/:pollId/results`         | 🔒   | Get the responses to a poll                  |
| DELETE | `/polls/:pollId`                 | 🔒   | Delete a poll with its options and responses |

#### Register

```http
POST /api/host/register
Content-Type: application/json

{ "name": "alice", "email": "alice@example.com", "password": "supersecret" }
```

Validation: `name` must be at least 3 characters, `email` must be a valid email, and `password` must be at least 8 characters.

#### Login

```http
POST /api/host/login
Content-Type: application/json

{ "email": "alice@example.com", "password": "supersecret" }
```

```json
{ "message": "Login successful", "token": "eyJhbGciOi..." }
```

#### Create a session

```http
POST /api/host/sessions
Authorization: Bearer <token>
Content-Type: application/json

{ "name": "Team retro" }
```

```json
{
  "message": "Session created successfully",
  "session": { "id": 1, "name": "Team retro", "session_code": "K3F9QZ" }
}
```

#### Create a poll

```http
POST /api/host/sessions/1/polls
Authorization: Bearer <token>
Content-Type: application/json

{
  "question": "Which day works best?",
  "type": "single-choice",
  "options": ["Monday", "Wednesday", "Friday"]
}
```

`type` is one of `single-choice`, `multiple-choice` or `open-ended`. `options` is used only for the two choice types.

#### Poll results

For choice polls, the response has one row per selected option:

```json
{
  "results": [
    { "participant_name": "Bob", "email": "bob@example.com", "option_text": "Wednesday" }
  ]
}
```

For open-ended polls it returns the raw `response_data` for each participant.

### Participant endpoints (`/api/participant`)

No authentication is needed.

| Method | Endpoint                          | Description                                 |
| ------ | --------------------------------- | ------------------------------------------- |
| GET    | `/sessions/:sessionCode`          | Check that a session exists                 |
| POST   | `/sessions/:sessionCode/join`     | Join a session (or rejoin with the same email) |
| GET    | `/sessions/:sessionCode/polls`    | List the session's published polls with their options |
| POST   | `/polls/:pollId/submit`           | Submit or update a response                 |

#### Join a session

```http
POST /api/participant/sessions/K3F9QZ/join
Content-Type: application/json

{ "name": "Bob", "email": "bob@example.com" }
```

```json
{ "message": "Joined session successfully", "participantId": 7, "sessionId": 1 }
```

Keep `participantId` for submitting responses and `sessionId` for joining the Socket.IO room.

#### Submit a response

```http
POST /api/participant/polls/3/submit
Content-Type: application/json

{ "participantId": 7, "responseData": { ... } }
```

The shape of `responseData` depends on the poll type:

| Poll type         | `responseData`                    |
| ----------------- | --------------------------------- |
| `single-choice`   | `{ "optionId": 12 }`              |
| `multiple-choice` | `{ "optionIds": [12, 14] }`       |
| `open-ended`      | Any JSON, e.g. `{ "text": "..." }` |

Submitting again for the same poll replaces the earlier response.

---

## Real-Time Events (Socket.IO)

Clients connect to the same host and port as the API.

| Direction        | Event           | Payload                    | Description                                            |
| ---------------- | --------------- | -------------------------- | ------------------------------------------------------ |
| client → server  | `joinSession`   | `sessionId` (number)       | Join the room `session-<sessionId>`                    |
| server → client  | `pollPublished` | poll object (see below)    | Sent to the room when the host publishes a poll        |

`pollPublished` payload:

```json
{
  "id": 3,
  "session_id": 1,
  "question": "Which day works best?",
  "status": "published",
  "type": "single-choice",
  "options": [ { "id": 12, "text": "Monday" }, { "id": 13, "text": "Wednesday" } ]
}
```

### Example client

```js
import { io } from "socket.io-client";

const socket = io("http://localhost:3000");

// sessionId comes from the /join response
socket.emit("joinSession", sessionId);

socket.on("pollPublished", (poll) => {
  console.log("New poll:", poll.question, poll.options);
});
```

---

## Typical Flow

1. The host **registers** and **logs in**, then keeps the JWT.
2. The host **creates a session** and shares its `session_code` with participants.
3. Participants **join** with the code, get a `participantId` and `sessionId`, and emit `joinSession` over Socket.IO.
4. The host **creates polls** (as drafts) and **publishes** them when ready. Participants receive `pollPublished` straight away.
5. Participants **submit** responses and can change them later.
6. The host **views results** and **closes** the poll.

---

## Deployment

The server listens on `0.0.0.0` on `PORT`, so it works on platforms like Railway, Render or Fly.io. Set the environment variables above in your platform's dashboard. Point the `DB_*` variables at a hosted PostgreSQL instance (the project currently uses Aiven) and set `ORIGIN` to your frontend's URL.

---

## Known Issues / TODO

- The `dev` script points to `./bin/ww`; it should be `nodemon ./bin/www`.
- `cors` is imported in `app.js` but not listed in `package.json` dependencies. It currently resolves only as a transitive dependency, so run `npm install cors` to make it explicit.
- The rate limiter in `middleware/ratelimiting.js` is defined but not yet applied to `/register` or `/login`.
- The error handler calls `res.render('error')`, but no view engine is configured, so unhandled errors (including 404s) don't render properly. Either set `app.set('view engine', 'jade')` or return JSON errors.
- Only publishing emits a socket event. Closing a poll and new responses are not yet pushed to clients.
- Participant submissions aren't checked against the poll's status or session, so a closed poll still accepts responses.
- No automated tests yet.

---

## License

No license has been specified yet. Add one (for example MIT) if you plan to share the project.
