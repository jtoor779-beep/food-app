// src/lib/uiTheme.js

export const theme = {
  bg: {
    page: {
      minHeight: "calc(100vh - 64px)",
      padding: 24,
      background:
        "radial-gradient(1200px 600px at 20% 10%, rgba(255,165,0,0.25), transparent 60%), radial-gradient(900px 500px at 80% 20%, rgba(80,160,255,0.22), transparent 55%), linear-gradient(180deg, #f7f7fb, #ffffff)",
    },
  },
  card: {
    base: {
      borderRadius: 18,
      padding: 16,
      background: "rgba(255,255,255,0.78)",
      border: "1px solid rgba(0,0,0,0.08)",
      boxShadow: "0 12px 40px rgba(0,0,0,0.08)",
      backdropFilter: "blur(10px)",
    },
  },
  text: {
    muted: { color: "#666" },
    title: { fontSize: 28, fontWeight: 950, margin: 0, color: "#111" },
    h2: { fontSize: 20, fontWeight: 900, margin: 0, color: "#111" },
  },
  input: {
    base: {
      width: "100%",
      padding: 12,
      borderRadius: 12,
      border: "1px solid rgba(0,0,0,0.12)",
      background: "rgba(255,255,255,0.9)",
      outline: "none",
    },
  },
  button: {
    primary: {
      padding: "12px 14px",
      borderRadius: 14,
      border: "1px solid rgba(0,0,0,0.12)",
      background: "#111",
      color: "#fff",
      cursor: "pointer",
      fontWeight: 950,
    },
    ghost: {
      padding: "12px 14px",
      borderRadius: 14,
      border: "1px solid rgba(0,0,0,0.12)",
      background: "#fff",
      color: "#111",
      cursor: "pointer",
      fontWeight: 900,
    },
  },
};
