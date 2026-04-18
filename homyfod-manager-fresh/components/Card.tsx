import { PropsWithChildren } from "react";
import { StyleSheet, Text, View } from "react-native";

type CardProps = PropsWithChildren<{
  title?: string;
}>;

export default function Card({ title, children }: CardProps) {
  return (
    <View style={styles.card}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
    gap: 12,
  },
  title: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900",
  },
});
