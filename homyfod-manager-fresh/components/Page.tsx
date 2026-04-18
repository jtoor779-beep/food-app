import { PropsWithChildren } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

type PageProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  refreshing?: boolean;
  onRefresh?: () => void;
}>;

export default function Page({ children, title, subtitle, refreshing, onRefresh }: PageProps) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 120 },
  header: { gap: 6 },
  title: { fontSize: 30, fontWeight: "900", color: "#0f172a" },
  subtitle: { color: "#64748b", fontWeight: "700", lineHeight: 21 },
});
