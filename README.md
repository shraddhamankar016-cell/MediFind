# MediFind - Smart Medicine Finder

A full-stack web application where patients can search medicines, compare prices and check live stock
across pharmacies. Pharmacies manage their own stock and request medicines; the admin manages the whole system.

## Tech stack
| Layer     | Technology |
|-----------|------------|
| Frontend  | HTML5, CSS3, JavaScript (no framework) |
| Backend   | Java (built-in `com.sun.net.httpserver`), REST API, JSON |
| Database  | Embedded file-based database (`data/` folder, 4 tables) - no installation needed |
| Security  | Salted SHA-256 password hashing, token sessions, role-based access (Admin / Pharmacy) |

## How to run
1. Install **JDK 11 or newer** (check with `javac -version`).
2. **Windows:** double-click `run.bat`  |  **Linux/Mac:** `./run.sh`
3. Open **http://localhost:8080**  (run.bat opens it automatically)

Manual way:
```
javac -d out src/medifind/*.java
java -cp out medifind.Server
```
Different port: `java -cp out medifind.Server 9090`

## Demo logins
| Role     | Username    | Password  |
|----------|-------------|-----------|
| Admin    | admin       | admin@123 |
| Pharmacy | healthplus  | 1234      |
| Pharmacy | medcare / wellness / apollo | 1234 |

## Features
**Public (no login):** live search, category filter, sort by price, in-stock filter, best-price comparison,
pharmacy directory with call button, availability table with filters.

**Pharmacy dashboard:** stock alerts, add / edit / delete own stock, request medicines and track status.

**Admin dashboard:** overview and alerts, manage stock of all pharmacies, add / delete medicines,
add / delete pharmacies (with login creation), approve / reject medicine requests.

## Database tables (`data/` folder, created automatically with sample data on first run)
- `medicines.tbl`  (id, name, category, description)
- `pharmacies.tbl` (id, name, location, phone, username, password_hash)
- `stock.tbl`      (id, medicine_id, pharmacy_id, price, quantity)
- `requests.tbl`   (id, medicine_id, pharmacy_id, quantity, status, created_at)

To reset to fresh sample data, stop the server and delete the `data/` folder.

## REST API
`GET /api/medicines | /api/pharmacies | /api/stock | /api/stats` (public)  
`POST /api/login` `POST /api/logout`  
`POST|DELETE /api/medicines` (admin) - `POST|DELETE /api/pharmacies` (admin)  
`POST|PUT|DELETE /api/stock` (admin or own pharmacy)  
`GET|POST|PUT /api/requests` (pharmacy creates, admin approves/rejects)

## Project structure
```
MediFind/
  run.bat / run.sh
  src/medifind/   Server.java  Database.java  Models.java  Json.java
  web/            index.html  style.css  app.js
  data/           database files (auto-created)
```
