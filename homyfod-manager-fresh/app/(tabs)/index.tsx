import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Card from "@/components/Card";
import Page from "@/components/Page";
import { fetchDashboardData } from "@/lib/manager";

export default function HomeScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      setError("");
      const next = await fetchDashboardData();
      setData(next);
    } catch (err: any) {
      setError(String(err?.message || "Unable to load dashboard."));
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  return (
    <Page
      title="Manager Home"
      subtitle={data?.context?.activeStore?.name || "Owner store"}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Card>
        <Text style={styles.heroTitle}>{data?.context?.activeStore?.name || "Store"}</Text>
        <Text style={styles.heroMeta}>
          {data?.context?.storeType === "grocery" ? "Grocery owner" : "Restaurant owner"} | Approval:{" "}
          {String(data?.context?.activeStore?.approval_status || "pending")}
        </Text>
      </Card>

      <View style={styles.grid}>
        <Stat label="Orders" value={data?.summary?.totalOrders || 0} />
        <Stat label="Active" value={data?.summary?.activeOrders || 0} />
        <Stat label="Done" value={data?.summary?.completedOrders || 0} />
        <Stat label="Sales" value={`$${Number(data?.summary?.sales || 0).toFixed(0)}`} />
      </View>

      <Card title="Recent orders">
        {(data?.orders || []).length ? (
          data.orders.slice(0, 6).map((order: any) => (
            <View key={String(order.id)} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.orderTitle}>#{String(order.id).slice(0, 8)}</Text>
                <Text style={styles.orderMeta}>{order?.customer_name || "Customer"}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.status}>{String(order?.status || "pending")}</Text>
                <Text style={styles.orderMeta}>${Number(order?.total_amount || order?.total || 0).toFixed(2)}</Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.muted}>No recent orders yet.</Text>
        )}
      </Card>

      <Card title="Store hours">
        <Text style={styles.muted}>Open: {data?.context?.activeStore?.opens_at_time || "Not set"}</Text>
        <Text style={styles.muted}>Close: {data?.context?.activeStore?.closes_at_time || "Not set"}</Text>
        <Text style={styles.muted}>
          Accepting orders: {data?.context?.activeStore?.accepting_orders === false ? "No" : "Yes"}
        </Text>
      </Card>
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { color: "#b91c1c", fontWeight: "700" },
  heroTitle: { fontSize: 24, fontWeight: "900", color: "#0f172a" },
  heroMeta: { color: "#64748b", fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stat: {
    width: "47%",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 18,
    padding: 16,
  },
  statValue: { fontSize: 22, fontWeight: "900", color: "#0f172a" },
  statLabel: { marginTop: 4, color: "#64748b", fontWeight: "700" },
  row: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  orderTitle: { fontWeight: "800", color: "#0f172a" },
  orderMeta: { color: "#64748b" },
  status: { color: "#0f172a", fontWeight: "800", textTransform: "capitalize" },
  muted: { color: "#64748b", fontWeight: "700" },
});
