package medifind;

import com.sun.net.httpserver.*;
import medifind.Models.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;

/** MediFind web server: serves the website and the REST API. */
public class Server {

    static Database db;
    static Path webRoot;
    static final Map<String, Session> sessions = new ConcurrentHashMap<>();

    static class Session {
        String role; int pharmacyId; String name;
        Session(String role, int pharmacyId, String name) { this.role = role; this.pharmacyId = pharmacyId; this.name = name; }
    }

    static class ApiError extends RuntimeException {
        private static final long serialVersionUID = 1L;
        int code;
        ApiError(int code, String msg) { super(msg); this.code = code; }
    }

    public static void main(String[] args) throws Exception {
        int port = args.length > 0 ? Integer.parseInt(args[0]) : 8080;
        String dataDir = System.getProperty("medifind.data", "data");
        webRoot = Paths.get(System.getProperty("medifind.web", "web")).toAbsolutePath();
        db = new Database(dataDir);

        HttpServer server;
        try {
            server = HttpServer.create(new InetSocketAddress(port), 0);
        } catch (BindException e) {
            System.out.println("\nERROR: Port " + port + " is already in use. Close the other program or run with another port:");
            System.out.println("       java -cp out medifind.Server 9090\n");
            return;
        }
        server.createContext("/api/", Server::api);
        server.createContext("/", Server::staticFile);
        server.setExecutor(Executors.newFixedThreadPool(8));
        server.start();

        System.out.println();
        System.out.println("==============================================");
        System.out.println("   MEDIFIND  -  Smart Medicine Finder");
        System.out.println("==============================================");
        System.out.println("   Open in browser:  http://localhost:" + port);
        System.out.println("   Admin login    :  admin / admin@123");
        System.out.println("   Pharmacy login :  healthplus / 1234");
        System.out.println("   Press Ctrl+C to stop the server");
        System.out.println("==============================================");
    }

    // ================= STATIC FILES =================
    static void staticFile(HttpExchange ex) throws IOException {
        try {
            String path = URLDecoder.decode(ex.getRequestURI().getPath(), "UTF-8");
            if (path.equals("/")) path = "/index.html";
            Path file = webRoot.resolve("." + path).normalize();
            if (!file.startsWith(webRoot) || !Files.isRegularFile(file)) {
                byte[] b = "404 - Page not found".getBytes(StandardCharsets.UTF_8);
                ex.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
                ex.sendResponseHeaders(404, b.length);
                try (OutputStream o = ex.getResponseBody()) { o.write(b); }
                return;
            }
            byte[] data = Files.readAllBytes(file);
            ex.getResponseHeaders().set("Content-Type", mime(file.toString()));
            ex.getResponseHeaders().set("Cache-Control", "no-cache");
            ex.sendResponseHeaders(200, data.length);
            try (OutputStream o = ex.getResponseBody()) { o.write(data); }
        } finally { ex.close(); }
    }

    static String mime(String f) {
        f = f.toLowerCase();
        if (f.endsWith(".html")) return "text/html; charset=utf-8";
        if (f.endsWith(".css")) return "text/css; charset=utf-8";
        if (f.endsWith(".js")) return "application/javascript; charset=utf-8";
        if (f.endsWith(".svg")) return "image/svg+xml";
        if (f.endsWith(".png")) return "image/png";
        if (f.endsWith(".ico")) return "image/x-icon";
        if (f.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    // ================= API =================
    static void api(HttpExchange ex) throws IOException {
        int code = 200; Object result;
        try {
            if (ex.getRequestMethod().equals("OPTIONS")) { code = 204; result = null; }
            else result = route(ex);
        } catch (ApiError e) { code = e.code; result = Json.obj("error", e.getMessage()); }
        catch (IllegalArgumentException e) { code = 400; result = Json.obj("error", e.getMessage()); }
        catch (Exception e) { e.printStackTrace(); code = 500; result = Json.obj("error", "Something went wrong on the server"); }

        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        ex.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type, Authorization");
        ex.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        if (code == 204) { ex.sendResponseHeaders(204, -1); ex.close(); return; }
        byte[] data = Json.write(result).getBytes(StandardCharsets.UTF_8);
        ex.sendResponseHeaders(code, data.length);
        try (OutputStream o = ex.getResponseBody()) { o.write(data); }
        ex.close();
    }

    static Session auth(HttpExchange ex) {
        String h = ex.getRequestHeaders().getFirst("Authorization");
        if (h == null || !h.startsWith("Bearer ")) return null;
        return sessions.get(h.substring(7).trim());
    }

    static Session need(HttpExchange ex) {
        Session s = auth(ex);
        if (s == null) throw new ApiError(401, "Please login first");
        return s;
    }

    static Session needAdmin(HttpExchange ex) {
        Session s = need(ex);
        if (!s.role.equals("admin")) throw new ApiError(403, "Admin access required");
        return s;
    }

    static Map<String, Object> body(HttpExchange ex) throws IOException {
        String s = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        try { return Json.parseObject(s); } catch (RuntimeException e) { throw new ApiError(400, "Invalid request data"); }
    }

    static String str(Map<String, Object> m, String k, boolean required) {
        Object v = m.get(k);
        String s = v == null ? "" : v.toString().trim();
        if (required && s.isEmpty()) throw new ApiError(400, "Field '" + k + "' is required");
        return s;
    }

    static int intVal(Map<String, Object> m, String k) {
        try { return (int) Math.round(Double.parseDouble(String.valueOf(m.get(k)))); }
        catch (Exception e) { throw new ApiError(400, "'" + k + "' must be a valid number"); }
    }

    static double dbl(Map<String, Object> m, String k) {
        try { return Double.parseDouble(String.valueOf(m.get(k))); }
        catch (Exception e) { throw new ApiError(400, "'" + k + "' must be a valid number"); }
    }

    static int idFrom(String[] parts, int idx) {
        try { return Integer.parseInt(parts[idx]); } catch (Exception e) { throw new ApiError(400, "Invalid id"); }
    }

    static Object route(HttpExchange ex) throws IOException {
        String method = ex.getRequestMethod();
        String[] p = ex.getRequestURI().getPath().substring(1).split("/"); // api, resource, id
        String res = p.length > 1 ? p[1] : "";
        boolean hasId = p.length > 2;

        switch (res) {
            case "ping": return Json.obj("status", "ok");

            case "login": {
                if (!method.equals("POST")) throw new ApiError(405, "Method not allowed");
                Map<String, Object> b = body(ex);
                String role = str(b, "role", true), u = str(b, "username", true), pw = str(b, "password", true);
                String token = UUID.randomUUID().toString();
                if (role.equals("admin")) {
                    if (!db.checkAdmin(u, pw)) throw new ApiError(401, "Invalid admin username or password");
                    sessions.put(token, new Session("admin", 0, "Administrator"));
                    return Json.obj("token", token, "role", "admin", "name", "Administrator", "pharmacyId", 0);
                }
                Pharmacy ph = db.checkPharmacy(u, pw);
                if (ph == null) throw new ApiError(401, "Invalid pharmacy username or password");
                sessions.put(token, new Session("pharmacy", ph.id, ph.name));
                return Json.obj("token", token, "role", "pharmacy", "name", ph.name, "pharmacyId", ph.id);
            }

            case "logout": {
                String h = ex.getRequestHeaders().getFirst("Authorization");
                if (h != null && h.startsWith("Bearer ")) sessions.remove(h.substring(7).trim());
                return Json.obj("ok", true);
            }

            case "me": {
                Session s = need(ex);
                return Json.obj("role", s.role, "name", s.name, "pharmacyId", s.pharmacyId);
            }

            case "stats": {
                int low = 0, out = 0;
                for (Stock s : db.stocks()) { if (s.quantity == 0) out++; else if (s.quantity <= 5) low++; }
                int pending = 0;
                for (MedRequest r : db.requests()) if (r.status.equals("PENDING")) pending++;
                return Json.obj("medicines", db.medicines().size(), "pharmacies", db.pharmacies().size(),
                        "stock", db.stocks().size(), "requests", db.requests().size(),
                        "pending", pending, "lowStock", low, "outOfStock", out);
            }

            case "medicines": return medicines(ex, method, p, hasId);
            case "pharmacies": return pharmacies(ex, method, p, hasId);
            case "stock": return stock(ex, method, p, hasId);
            case "requests": return requests(ex, method, p, hasId);
            default: throw new ApiError(404, "API endpoint not found");
        }
    }

    // ---------- medicines ----------
    static Object medicines(HttpExchange ex, String method, String[] p, boolean hasId) throws IOException {
        if (method.equals("GET")) {
            List<Object> out = new ArrayList<>();
            for (Medicine m : db.medicines()) {
                int pharmaciesWith = 0; double min = -1;
                for (Stock s : db.stocks()) if (s.medicineId == m.id && s.quantity > 0) {
                    pharmaciesWith++;
                    if (min < 0 || s.price < min) min = s.price;
                }
                out.add(Json.obj("id", m.id, "name", m.name, "category", m.category, "description", m.description,
                        "availableAt", pharmaciesWith, "minPrice", min < 0 ? null : (Object) min));
            }
            return out;
        }
        if (method.equals("POST")) {
            needAdmin(ex);
            Map<String, Object> b = body(ex);
            Medicine m = db.addMedicine(str(b, "name", true), str(b, "category", true), str(b, "description", false));
            return Json.obj("id", m.id, "message", "Medicine added");
        }
        if (method.equals("DELETE") && hasId) {
            needAdmin(ex); db.deleteMedicine(idFrom(p, 2));
            return Json.obj("message", "Medicine deleted");
        }
        throw new ApiError(405, "Method not allowed");
    }

    // ---------- pharmacies ----------
    static Object pharmacies(HttpExchange ex, String method, String[] p, boolean hasId) throws IOException {
        if (method.equals("GET")) {
            List<Object> out = new ArrayList<>();
            for (Pharmacy ph : db.pharmacies()) {
                int count = 0;
                for (Stock s : db.stocks()) if (s.pharmacyId == ph.id) count++;
                out.add(Json.obj("id", ph.id, "name", ph.name, "location", ph.location,
                        "phone", ph.phone, "username", ph.username, "stockItems", count));
            }
            return out;
        }
        if (method.equals("POST")) {
            needAdmin(ex);
            Map<String, Object> b = body(ex);
            String pass = str(b, "password", true);
            if (pass.length() < 4) throw new ApiError(400, "Password must be at least 4 characters");
            String phone = str(b, "phone", true);
            if (!phone.matches("[0-9+\\- ]{7,15}")) throw new ApiError(400, "Enter a valid phone number");
            Pharmacy ph = db.addPharmacy(str(b, "name", true), str(b, "location", true), phone, str(b, "username", true), pass);
            return Json.obj("id", ph.id, "message", "Pharmacy added");
        }
        if (method.equals("DELETE") && hasId) {
            needAdmin(ex); db.deletePharmacy(idFrom(p, 2));
            return Json.obj("message", "Pharmacy deleted");
        }
        throw new ApiError(405, "Method not allowed");
    }

    // ---------- stock ----------
    static Map<String, Object> stockJson(Stock s) {
        Medicine m = db.medicine(s.medicineId); Pharmacy ph = db.pharmacy(s.pharmacyId);
        return Json.obj("id", s.id, "medicineId", s.medicineId, "pharmacyId", s.pharmacyId,
                "medicine", m == null ? "?" : m.name, "category", m == null ? "" : m.category,
                "pharmacy", ph == null ? "?" : ph.name, "location", ph == null ? "" : ph.location,
                "phone", ph == null ? "" : ph.phone, "price", s.price, "quantity", s.quantity);
    }

    static Object stock(HttpExchange ex, String method, String[] p, boolean hasId) throws IOException {
        if (method.equals("GET")) {
            List<Object> out = new ArrayList<>();
            for (Stock s : db.stocks()) out.add(stockJson(s));
            return out;
        }
        Session s = need(ex);
        if (method.equals("POST")) {
            Map<String, Object> b = body(ex);
            int phId = s.role.equals("admin") ? intVal(b, "pharmacyId") : s.pharmacyId;
            double price = dbl(b, "price"); int qty = intVal(b, "quantity");
            if (price < 0) throw new ApiError(400, "Price cannot be negative");
            if (qty < 0) throw new ApiError(400, "Quantity cannot be negative");
            Stock st = db.addStock(intVal(b, "medicineId"), phId, price, qty);
            return Json.obj("id", st.id, "message", "Stock added");
        }
        if (hasId) {
            int id = idFrom(p, 2);
            Stock st = db.stock(id);
            if (st == null) throw new ApiError(404, "Stock record not found");
            if (!s.role.equals("admin") && st.pharmacyId != s.pharmacyId)
                throw new ApiError(403, "You can only manage your own pharmacy stock");
            if (method.equals("PUT")) {
                Map<String, Object> b = body(ex);
                double price = dbl(b, "price"); int qty = intVal(b, "quantity");
                if (price < 0) throw new ApiError(400, "Price cannot be negative");
                if (qty < 0) throw new ApiError(400, "Quantity cannot be negative");
                db.updateStock(id, price, qty);
                return Json.obj("message", "Stock updated");
            }
            if (method.equals("DELETE")) { db.deleteStock(id); return Json.obj("message", "Stock deleted"); }
        }
        throw new ApiError(405, "Method not allowed");
    }

    // ---------- requests ----------
    static Object requests(HttpExchange ex, String method, String[] p, boolean hasId) throws IOException {
        Session s = need(ex);
        if (method.equals("GET")) {
            List<Object> out = new ArrayList<>();
            List<MedRequest> all = db.requests();
            Collections.reverse(all);
            for (MedRequest r : all) {
                if (!s.role.equals("admin") && r.pharmacyId != s.pharmacyId) continue;
                Medicine m = db.medicine(r.medicineId); Pharmacy ph = db.pharmacy(r.pharmacyId);
                out.add(Json.obj("id", r.id, "medicine", m == null ? "?" : m.name, "pharmacy", ph == null ? "?" : ph.name,
                        "quantity", r.quantity, "status", r.status, "createdAt", r.createdAt));
            }
            return out;
        }
        if (method.equals("POST")) {
            if (!s.role.equals("pharmacy")) throw new ApiError(403, "Only pharmacies can request medicines");
            Map<String, Object> b = body(ex);
            int qty = intVal(b, "quantity");
            if (qty <= 0) throw new ApiError(400, "Quantity must be greater than 0");
            MedRequest r = db.addRequest(intVal(b, "medicineId"), s.pharmacyId, qty);
            return Json.obj("id", r.id, "message", "Request submitted");
        }
        if (method.equals("PUT") && hasId) {
            needAdmin(ex);
            String status = str(body(ex), "status", true).toUpperCase();
            if (!status.equals("APPROVED") && !status.equals("REJECTED") && !status.equals("PENDING"))
                throw new ApiError(400, "Invalid status");
            db.setRequestStatus(idFrom(p, 2), status);
            return Json.obj("message", "Request " + status.toLowerCase());
        }
        throw new ApiError(405, "Method not allowed");
    }
}
