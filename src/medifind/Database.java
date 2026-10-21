package medifind;

import medifind.Models.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Embedded persistent database (no installation needed).
 * Four tables are stored as files inside the /data folder:
 * medicines, pharmacies, stock, requests. All methods are synchronized (thread-safe).
 * Passwords are stored as salted SHA-256 hashes.
 */
public class Database {

    private final Path dir;
    private final List<Medicine> medicines = new ArrayList<>();
    private final List<Pharmacy> pharmacies = new ArrayList<>();
    private final List<Stock> stocks = new ArrayList<>();
    private final List<MedRequest> requests = new ArrayList<>();
    private int nextMed = 1, nextPh = 1, nextStock = 1, nextReq = 1;

    public static final String ADMIN_USER = "admin";
    private String adminHash;

    public Database(String folder) throws IOException {
        dir = Paths.get(folder);
        Files.createDirectories(dir);
        load();
        if (medicines.isEmpty() && pharmacies.isEmpty()) seed();
        if (adminHash == null) { adminHash = hash("admin@123"); saveMeta(); }
    }

    // ---------- password hashing ----------
    public static String hash(String password) {
        try {
            String salt = "MediFind#2026";
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] b = md.digest((salt + password).getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte x : b) sb.append(String.format("%02x", x));
            return sb.toString();
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    public synchronized boolean checkAdmin(String user, String pass) {
        return ADMIN_USER.equalsIgnoreCase(user) && adminHash.equals(hash(pass));
    }

    public synchronized Pharmacy checkPharmacy(String user, String pass) {
        for (Pharmacy p : pharmacies)
            if (p.username.equalsIgnoreCase(user) && p.passwordHash.equals(hash(pass))) return p;
        return null;
    }

    // ---------- MEDICINES ----------
    public synchronized List<Medicine> medicines() { return new ArrayList<>(medicines); }

    public synchronized Medicine medicine(int id) {
        for (Medicine m : medicines) if (m.id == id) return m;
        return null;
    }

    public synchronized Medicine addMedicine(String name, String category, String desc) {
        for (Medicine m : medicines) if (m.name.equalsIgnoreCase(name))
            throw new IllegalArgumentException("Medicine '" + name + "' already exists");
        Medicine m = new Medicine(nextMed++, name, category, desc);
        medicines.add(m); save();
        return m;
    }

    public synchronized void deleteMedicine(int id) {
        for (Stock s : stocks) if (s.medicineId == id)
            throw new IllegalArgumentException("Cannot delete: stock records exist for this medicine");
        medicines.removeIf(m -> m.id == id);
        requests.removeIf(r -> r.medicineId == id);
        save();
    }

    // ---------- PHARMACIES ----------
    public synchronized List<Pharmacy> pharmacies() { return new ArrayList<>(pharmacies); }

    public synchronized Pharmacy pharmacy(int id) {
        for (Pharmacy p : pharmacies) if (p.id == id) return p;
        return null;
    }

    public synchronized Pharmacy addPharmacy(String name, String loc, String phone, String user, String pass) {
        for (Pharmacy p : pharmacies) if (p.username.equalsIgnoreCase(user))
            throw new IllegalArgumentException("Username '" + user + "' is already taken");
        if (ADMIN_USER.equalsIgnoreCase(user)) throw new IllegalArgumentException("Username not allowed");
        Pharmacy p = new Pharmacy(nextPh++, name, loc, phone, user, hash(pass));
        pharmacies.add(p); save();
        return p;
    }

    public synchronized void deletePharmacy(int id) {
        pharmacies.removeIf(p -> p.id == id);
        stocks.removeIf(s -> s.pharmacyId == id);
        requests.removeIf(r -> r.pharmacyId == id);
        save();
    }

    // ---------- STOCK ----------
    public synchronized List<Stock> stocks() { return new ArrayList<>(stocks); }

    public synchronized Stock stock(int id) {
        for (Stock s : stocks) if (s.id == id) return s;
        return null;
    }

    public synchronized Stock addStock(int medId, int phId, double price, int qty) {
        if (medicine(medId) == null) throw new IllegalArgumentException("Medicine not found");
        if (pharmacy(phId) == null) throw new IllegalArgumentException("Pharmacy not found");
        for (Stock s : stocks) if (s.medicineId == medId && s.pharmacyId == phId)
            throw new IllegalArgumentException("Stock for this medicine already exists in this pharmacy. Edit it instead.");
        Stock s = new Stock(nextStock++, medId, phId, price, qty);
        stocks.add(s); save();
        return s;
    }

    public synchronized void updateStock(int id, double price, int qty) {
        Stock s = stock(id);
        if (s == null) throw new IllegalArgumentException("Stock record not found");
        s.price = price; s.quantity = qty; save();
    }

    public synchronized void deleteStock(int id) {
        if (!stocks.removeIf(s -> s.id == id)) throw new IllegalArgumentException("Stock record not found");
        save();
    }

    // ---------- REQUESTS ----------
    public synchronized List<MedRequest> requests() { return new ArrayList<>(requests); }

    public synchronized MedRequest addRequest(int medId, int phId, int qty) {
        if (medicine(medId) == null || pharmacy(phId) == null) throw new IllegalArgumentException("Invalid medicine or pharmacy");
        String now = LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd MMM yyyy, hh:mm a"));
        MedRequest r = new MedRequest(nextReq++, medId, phId, qty, "PENDING", now);
        requests.add(r); save();
        return r;
    }

    public synchronized void setRequestStatus(int id, String status) {
        for (MedRequest r : requests) if (r.id == id) { r.status = status; save(); return; }
        throw new IllegalArgumentException("Request not found");
    }

    // ---------- persistence ----------
    private static String esc(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "");
    }

    private static String unesc(String s) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '\\' && i + 1 < s.length()) {
                char n = s.charAt(++i);
                sb.append(n == 't' ? '\t' : n == 'n' ? '\n' : n);
            } else sb.append(c);
        }
        return sb.toString();
    }

    private void writeAtomic(String file, List<String> lines) throws IOException {
        Path tmp = dir.resolve(file + ".tmp"), target = dir.resolve(file);
        Files.write(tmp, lines, StandardCharsets.UTF_8);
        Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING);
    }

    private List<String> read(String file) throws IOException {
        Path p = dir.resolve(file);
        return Files.exists(p) ? Files.readAllLines(p, StandardCharsets.UTF_8) : new ArrayList<>();
    }

    private void save() {
        try {
            List<String> l = new ArrayList<>();
            for (Medicine m : medicines) l.add(m.id + "\t" + esc(m.name) + "\t" + esc(m.category) + "\t" + esc(m.description));
            writeAtomic("medicines.tbl", l);
            l = new ArrayList<>();
            for (Pharmacy p : pharmacies)
                l.add(p.id + "\t" + esc(p.name) + "\t" + esc(p.location) + "\t" + esc(p.phone) + "\t" + esc(p.username) + "\t" + p.passwordHash);
            writeAtomic("pharmacies.tbl", l);
            l = new ArrayList<>();
            for (Stock s : stocks) l.add(s.id + "\t" + s.medicineId + "\t" + s.pharmacyId + "\t" + s.price + "\t" + s.quantity);
            writeAtomic("stock.tbl", l);
            l = new ArrayList<>();
            for (MedRequest r : requests)
                l.add(r.id + "\t" + r.medicineId + "\t" + r.pharmacyId + "\t" + r.quantity + "\t" + r.status + "\t" + esc(r.createdAt));
            writeAtomic("requests.tbl", l);
        } catch (IOException e) { throw new RuntimeException("Could not save data: " + e.getMessage()); }
    }

    private void saveMeta() {
        try { writeAtomic("admin.tbl", Collections.singletonList(adminHash)); }
        catch (IOException e) { throw new RuntimeException(e); }
    }

    private void load() throws IOException {
        for (String ln : read("medicines.tbl")) {
            String[] a = ln.split("\t", -1);
            if (a.length < 4) continue;
            Medicine m = new Medicine(Integer.parseInt(a[0]), unesc(a[1]), unesc(a[2]), unesc(a[3]));
            medicines.add(m); nextMed = Math.max(nextMed, m.id + 1);
        }
        for (String ln : read("pharmacies.tbl")) {
            String[] a = ln.split("\t", -1);
            if (a.length < 6) continue;
            Pharmacy p = new Pharmacy(Integer.parseInt(a[0]), unesc(a[1]), unesc(a[2]), unesc(a[3]), unesc(a[4]), a[5]);
            pharmacies.add(p); nextPh = Math.max(nextPh, p.id + 1);
        }
        for (String ln : read("stock.tbl")) {
            String[] a = ln.split("\t", -1);
            if (a.length < 5) continue;
            Stock s = new Stock(Integer.parseInt(a[0]), Integer.parseInt(a[1]), Integer.parseInt(a[2]),
                    Double.parseDouble(a[3]), Integer.parseInt(a[4]));
            stocks.add(s); nextStock = Math.max(nextStock, s.id + 1);
        }
        for (String ln : read("requests.tbl")) {
            String[] a = ln.split("\t", -1);
            if (a.length < 6) continue;
            MedRequest r = new MedRequest(Integer.parseInt(a[0]), Integer.parseInt(a[1]), Integer.parseInt(a[2]),
                    Integer.parseInt(a[3]), a[4], unesc(a[5]));
            requests.add(r); nextReq = Math.max(nextReq, r.id + 1);
        }
        List<String> adm = read("admin.tbl");
        if (!adm.isEmpty()) adminHash = adm.get(0).trim();
    }

    // ---------- sample data ----------
    private void seed() {
        String[][] meds = {
            {"Paracetamol 500mg", "Pain Relief", "Fever and mild to moderate pain relief."},
            {"Dolo 650", "Pain Relief", "Paracetamol 650mg tablet for fever and body ache."},
            {"Cetirizine 10mg", "Allergy", "Antihistamine for cold, sneezing and allergies."},
            {"Vitamin C 500mg", "Supplement", "Immunity booster chewable tablets."},
            {"Amoxicillin 500mg", "Antibiotic", "Antibiotic for bacterial infections (prescription required)."},
            {"Azithromycin 500mg", "Antibiotic", "Antibiotic for respiratory infections (prescription required)."},
            {"Pantoprazole 40mg", "Digestive", "Reduces stomach acid, relieves acidity and GERD."},
            {"ORS Powder", "Hydration", "Oral rehydration salts for dehydration."},
            {"Metformin 500mg", "Diabetes", "Helps control blood sugar in type 2 diabetes."},
            {"Cough Syrup 100ml", "Cough & Cold", "Soothes dry and wet cough."},
            {"Ibuprofen 400mg", "Pain Relief", "Anti-inflammatory for pain and swelling."},
            {"Multivitamin", "Supplement", "Daily multivitamin and mineral tablets."}
        };
        for (String[] m : meds) medicines.add(new Medicine(nextMed++, m[0], m[1], m[2]));

        String[][] ph = {
            {"HealthPlus Pharmacy", "Station Road, Pune", "9876543210", "healthplus"},
            {"MedCare Pharmacy", "Shivajinagar, Pune", "9876501234", "medcare"},
            {"Wellness Pharmacy", "Kothrud, Pune", "9823456710", "wellness"},
            {"Apollo Pharmacy", "Camp, Pune", "9876543211", "apollo"}
        };
        for (String[] p : ph) pharmacies.add(new Pharmacy(nextPh++, p[0], p[1], p[2], p[3], hash("1234")));

        Random rnd = new Random(7);
        int[][] plan = { // medicineId, pharmacyId, price, qty
            {1,1,42,50},{1,2,39,0},{1,3,45,22},{2,1,32,40},{2,4,34,3},{3,3,58,15},{3,1,55,28},
            {4,1,120,30},{4,4,115,2},{5,2,95,18},{5,4,98,12},{6,2,118,9},{6,3,121,0},
            {7,1,88,35},{7,3,90,4},{8,2,22,60},{8,4,20,75},{9,3,35,45},{9,1,38,20},
            {10,4,85,16},{10,2,80,5},{11,1,48,26},{11,3,52,0},{12,4,210,14},{12,2,199,8}
        };
        for (int[] p : plan) stocks.add(new Stock(nextStock++, p[0], p[1], p[2], p[3]));

        requests.add(new MedRequest(nextReq++, 5, 1, 25, "PENDING", "18 Oct 2026, 10:30 AM"));
        requests.add(new MedRequest(nextReq++, 2, 4, 50, "APPROVED", "17 Oct 2026, 04:15 PM"));
        requests.add(new MedRequest(nextReq++, 6, 3, 15, "REJECTED", "16 Oct 2026, 11:00 AM"));
        save();
    }
}
