import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { getCurrentManagerUser } from "@/lib/manager";

export default function IndexScreen() {
  const [route, setRoute] = useState<"/login" | "/(tabs)">("/login");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function boot() {
      const user = await getCurrentManagerUser().catch(() => null);
      if (!alive) return;
      setRoute(user?.id ? "/(tabs)" : "/login");
      setLoading(false);
    }

    void boot();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  return <Redirect href={route} />;
}
