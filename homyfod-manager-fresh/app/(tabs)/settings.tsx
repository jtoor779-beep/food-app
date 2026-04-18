import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Card from "@/components/Card";
import Page from "@/components/Page";
import { getManagerContext, signOutManager, updateStoreOpenState } from "@/lib/manager";
import { router } from "expo-router";

export default function SettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [context, setContext] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      setError("");
      const next = await getManagerContext();
      setContext(next);
    } catch (err: any) {
      setError(String(err?.message || "Unable to load store settings."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function setOpenState(nextOpen: boolean) {
    try {
      setSaving(true);
      setError("");
      setMessage("");
      await updateStoreOpenState(nextOpen);
      setMessage(nextOpen ? "Store opened." : "Store closed.");
      await load();
    } catch (err: any) {
      setError(String(err?.message || "Unable to update store status."));
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await signOutManager();
    router.replace("/login");
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  return (
    <Page
      title="Store"
      subtitle="Only the controls we can keep stable from day one."
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Card title="Store status">
        <Text style={styles.line}>Name: {context?.activeStore?.name || "Store"}</Text>
        <Text style={styles.line}>City: {context?.activeStore?.city || "Not set"}</Text>
        <Text style={styles.line}>
          Accepting orders: {context?.activeStore?.accepting_orders === false ? "No" : "Yes"}
        </Text>
        <Text style={styles.line}>Open time: {context?.activeStore?.opens_at_time || "Not set"}</Text>
        <Text style={styles.line}>Close time: {context?.activeStore?.closes_at_time || "Not set"}</Text>
      </Card>

      <View style={styles.row}>
        <Pressable style={styles.primaryButton} onPress={() => void setOpenState(true)} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Open now</Text>}
        </Pressable>
        <Pressable style={styles.dangerButton} onPress={() => void setOpenState(false)} disabled={saving}>
          <Text style={styles.dangerButtonText}>Close now</Text>
        </Pressable>
      </View>

      <Pressable style={styles.ghostButton} onPress={logout}>
        <Text style={styles.ghostButtonText}>Logout</Text>
      </Pressable>
    </Page>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", gap: 10 },
  line: { color: "#334155", fontWeight: "700" },
  error: { color: "#b91c1c", fontWeight: "700" },
  message: { color: "#166534", fontWeight: "700" },
  primaryButton: {
    flex: 1,
    backgroundColor: "#f97316",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonText: { color: "#fff", fontWeight: "900" },
  dangerButton: {
    flex: 1,
    backgroundColor: "#fee2e2",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  dangerButtonText: { color: "#b91c1c", fontWeight: "900" },
  ghostButton: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
  },
  ghostButtonText: { color: "#0f172a", fontWeight: "900" },
});
