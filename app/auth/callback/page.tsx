"use client";

export default function AuthCallbackPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background:
          "radial-gradient(1000px 520px at 18% 10%, rgba(255,140,0,0.16), transparent 58%), radial-gradient(900px 520px at 82% 0%, rgba(120,180,255,0.18), transparent 60%), linear-gradient(180deg, #f8fafc, #ffffff)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          background: "rgba(255,255,255,0.92)",
          border: "1px solid rgba(15,23,42,0.08)",
          borderRadius: 24,
          padding: 32,
          boxShadow: "0 20px 45px rgba(15,23,42,0.08)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-block",
            padding: "8px 14px",
            borderRadius: 999,
            background: "#ecfdf5",
            color: "#15803d",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          HomyFod
        </div>
        <h1 style={{ margin: "18px 0 12px", fontSize: 30, lineHeight: 1.1, color: "#0f172a" }}>
          Confirming your email
        </h1>
        <p style={{ margin: 0, color: "#475569", fontSize: 16, lineHeight: 1.7 }}>
          Please wait while we finish your sign-in and return you safely to the app.
        </p>
      </div>
    </main>
  );
}
