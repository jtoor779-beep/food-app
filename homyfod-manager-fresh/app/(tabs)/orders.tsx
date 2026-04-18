import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import Card from "@/components/Card";
import Page from "@/components/Page";
import { fetchOwnerOrders } from "@/lib/manager";

export default function OrdersScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState<any[]>([]);
  const [section, setSection] = useState<"active" | "completed" | "canceled">("active");

  const load = useCallback(async () => {
    try {
      setError("");
      const next = await fetchOwnerOrders();
      setOrders(next.orders || []);
    } catch (err: any) {
      setError(String(err?.message || "Unable to load orders."));
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

  const filtered = useMemo(() => {
    return orders.filter((order) => {
      const status = String(order?.status || "").toLowerCase();
      if (section === "completed") return status === "completed" || status === "delivered";
      if (section === "canceled") return status === "canceled" || status === "cancelled" || status === "rejected";
      return !["completed", "delivered", "canceled", "cancelled", "rejected"].includes(status);
    });
  }, [orders, section]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  return (
    <Page
      title="Orders"
      subtitle="Flat list only. No heavy detail joins in the list."
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.filterRow}>
        {(["active", "completed", "canceled"] as const).map((nextSection) => (
          <Text
            key={nextSection}
            style={[styles.filterChip, section === nextSection && styles.filterChipActive]}
            onPress={() => setSection(nextSection)}
          >
            {nextSection}
          </Text>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <Card>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>#{String(item.id).slice(0, 8)}</Text>
                <Text style={styles.meta}>{item?.customer_name || "Customer"}</Text>
                <Text style={styles.meta}>{item?.delivery_address || item?.address || "No address"}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.status}>{String(item?.status || "pending")}</Text>
                <Text style={styles.meta}>${Number(item?.total_amount || item?.total || 0).toFixed(2)}</Text>
              </View>
            </View>
          </Card>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListEmptyComponent={<Text style={styles.meta}>No orders in this section.</Text>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
          setRefreshing(true);
          void load();
        }} />}
      />
    </Page>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { color: "#b91c1c", fontWeight: "700" },
  filterRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    color: "#0f172a",
    fontWeight: "800",
    backgroundColor: "#fff",
  },
  filterChipActive: {
    backgroundColor: "#0f172a",
    borderColor: "#0f172a",
    color: "#fff",
  },
  row: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  title: { fontSize: 16, fontWeight: "900", color: "#0f172a" },
  meta: { color: "#64748b", fontWeight: "700", marginTop: 4 },
  status: { color: "#0f172a", fontWeight: "900", textTransform: "capitalize" },
});
