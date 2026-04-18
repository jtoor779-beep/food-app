import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import Card from "@/components/Card";
import Page from "@/components/Page";
import { fetchOwnerItems } from "@/lib/manager";

export default function ItemsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      const next = await fetchOwnerItems();
      setItems(next.items || []);
    } catch (err: any) {
      setError(String(err?.message || "Unable to load items."));
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
    const query = String(search || "").trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) =>
      `${item?.name || ""} ${item?.category || ""} ${item?.subcategory || ""} ${item?.cuisine || ""}`
        .toLowerCase()
        .includes(query)
    );
  }, [items, search]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  return (
    <Page
      title="Items"
      subtitle="Text-first list for stability. Search before we add richer editing."
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void load();
      }}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search item, category, or tag"
        placeholderTextColor="#94a3b8"
        style={styles.input}
      />

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <Card>
            <Text style={styles.title}>{item?.name || "Item"}</Text>
            <Text style={styles.meta}>${Number(item?.price || 0).toFixed(2)}</Text>
            <Text style={styles.meta}>
              {item?.subcategory || item?.cuisine || item?.category || "Uncategorized"}
            </Text>
            <Text style={styles.meta}>
              {item?.is_available === false ? "Hidden" : "Live"} | {item?.in_stock === false ? "Out of stock" : "In stock"}
            </Text>
          </Card>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListEmptyComponent={<Text style={styles.meta}>No matching items.</Text>}
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
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: "#0f172a",
    backgroundColor: "#fff",
  },
  title: { fontSize: 16, fontWeight: "900", color: "#0f172a" },
  meta: { color: "#64748b", fontWeight: "700" },
});
