package medifind;

import java.util.*;

/** Tiny JSON reader/writer (no external libraries needed). */
public class Json {

    // ---------- WRITER ----------
    public static String write(Object o) {
        StringBuilder sb = new StringBuilder();
        write(o, sb);
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    private static void write(Object o, StringBuilder sb) {
        if (o == null) { sb.append("null"); }
        else if (o instanceof String) { quote((String) o, sb); }
        else if (o instanceof Number || o instanceof Boolean) { sb.append(o); }
        else if (o instanceof Map) {
            sb.append('{'); boolean first = true;
            for (Map.Entry<String, Object> e : ((Map<String, Object>) o).entrySet()) {
                if (!first) sb.append(','); first = false;
                quote(e.getKey(), sb); sb.append(':'); write(e.getValue(), sb);
            }
            sb.append('}');
        } else if (o instanceof Collection) {
            sb.append('['); boolean first = true;
            for (Object x : (Collection<Object>) o) {
                if (!first) sb.append(','); first = false; write(x, sb);
            }
            sb.append(']');
        } else { quote(o.toString(), sb); }
    }

    private static void quote(String s, StringBuilder sb) {
        sb.append('"');
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c)); else sb.append(c);
            }
        }
        sb.append('"');
    }

    public static Map<String, Object> obj(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    // ---------- READER ----------
    public static Object parse(String s) {
        if (s == null || s.trim().isEmpty()) return new LinkedHashMap<String, Object>();
        return new Parser(s).parseValue();
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> parseObject(String s) {
        Object o = parse(s);
        return o instanceof Map ? (Map<String, Object>) o : new LinkedHashMap<>();
    }

    private static class Parser {
        final String s; int i = 0;
        Parser(String s) { this.s = s; }

        void ws() { while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++; }

        Object parseValue() {
            ws();
            if (i >= s.length()) throw new RuntimeException("Invalid JSON");
            char c = s.charAt(i);
            if (c == '{') return parseObj();
            if (c == '[') return parseArr();
            if (c == '"') return parseStr();
            if (s.startsWith("true", i)) { i += 4; return Boolean.TRUE; }
            if (s.startsWith("false", i)) { i += 5; return Boolean.FALSE; }
            if (s.startsWith("null", i)) { i += 4; return null; }
            int st = i;
            while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
            if (st == i) throw new RuntimeException("Invalid JSON");
            return Double.parseDouble(s.substring(st, i));
        }

        Map<String, Object> parseObj() {
            Map<String, Object> m = new LinkedHashMap<>(); i++; ws();
            if (s.charAt(i) == '}') { i++; return m; }
            while (true) {
                ws(); String k = parseStr(); ws();
                if (s.charAt(i++) != ':') throw new RuntimeException("Invalid JSON");
                m.put(k, parseValue()); ws();
                char c = s.charAt(i++);
                if (c == '}') return m;
                if (c != ',') throw new RuntimeException("Invalid JSON");
            }
        }

        List<Object> parseArr() {
            List<Object> l = new ArrayList<>(); i++; ws();
            if (s.charAt(i) == ']') { i++; return l; }
            while (true) {
                l.add(parseValue()); ws();
                char c = s.charAt(i++);
                if (c == ']') return l;
                if (c != ',') throw new RuntimeException("Invalid JSON");
            }
        }

        String parseStr() {
            if (s.charAt(i) != '"') throw new RuntimeException("Invalid JSON");
            i++; StringBuilder sb = new StringBuilder();
            while (true) {
                char c = s.charAt(i++);
                if (c == '"') return sb.toString();
                if (c == '\\') {
                    char n = s.charAt(i++);
                    switch (n) {
                        case 'n': sb.append('\n'); break;
                        case 'r': sb.append('\r'); break;
                        case 't': sb.append('\t'); break;
                        case 'b': sb.append('\b'); break;
                        case 'f': sb.append('\f'); break;
                        case 'u': sb.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; break;
                        default: sb.append(n);
                    }
                } else sb.append(c);
            }
        }
    }
}
