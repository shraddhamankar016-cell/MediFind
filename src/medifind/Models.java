package medifind;

/** Plain data classes used across the project. */
public class Models {

    public static class Medicine {
        public int id; public String name, category, description;
        public Medicine(int id, String name, String category, String description) {
            this.id = id; this.name = name; this.category = category; this.description = description;
        }
    }

    public static class Pharmacy {
        public int id; public String name, location, phone, username, passwordHash;
        public Pharmacy(int id, String name, String location, String phone, String username, String passwordHash) {
            this.id = id; this.name = name; this.location = location; this.phone = phone;
            this.username = username; this.passwordHash = passwordHash;
        }
    }

    public static class Stock {
        public int id, medicineId, pharmacyId, quantity; public double price;
        public Stock(int id, int medicineId, int pharmacyId, double price, int quantity) {
            this.id = id; this.medicineId = medicineId; this.pharmacyId = pharmacyId;
            this.price = price; this.quantity = quantity;
        }
    }

    public static class MedRequest {
        public int id, medicineId, pharmacyId, quantity; public String status, createdAt;
        public MedRequest(int id, int medicineId, int pharmacyId, int quantity, String status, String createdAt) {
            this.id = id; this.medicineId = medicineId; this.pharmacyId = pharmacyId;
            this.quantity = quantity; this.status = status; this.createdAt = createdAt;
        }
    }
}
