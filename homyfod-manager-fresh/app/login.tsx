import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { signInManager } from "@/lib/manager";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    try {
      setLoading(true);
      setError("");
      await signInManager(email, password);
      router.replace("/(tabs)");
    } catch (err: any) {
      setError(String(err?.message || "Unable to sign in."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.wrapper}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.card}>
          <Text style={styles.title}>HomyFod Manager</Text>
          <Text style={styles.subtitle}>Fresh rebuild. Clean, simple, stable.</Text>

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
            placeholderTextColor="#94a3b8"
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            style={styles.input}
            placeholderTextColor="#94a3b8"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={styles.button} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Login</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f8fafc" },
  wrapper: { flex: 1, justifyContent: "center", padding: 20 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 20,
    gap: 14,
  },
  title: { fontSize: 30, fontWeight: "900", color: "#0f172a" },
  subtitle: { color: "#64748b", fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: "#0f172a",
    backgroundColor: "#fff",
  },
  button: {
    backgroundColor: "#f97316",
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  error: { color: "#b91c1c", fontWeight: "700" },
});
