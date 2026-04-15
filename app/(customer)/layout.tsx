"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabase";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    async function check() {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;

      // allow guest to view home/restaurants/menu if you want
      // but block owner from customer ordering pages
      if (!session?.user) {
        setOk(true);
        return;
      }

      const userId = session.user.id;

      // role from profiles OR fallback owner by restaurants table
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      let role = prof?.role;

      if (!role) {
        const [{ data: ownedRestaurant }, { data: ownedGrocery }] = await Promise.all([
          supabase.from("restaurants").select("id").eq("owner_user_id", userId).limit(1).maybeSingle(),
          supabase.from("grocery_stores").select("id").eq("owner_user_id", userId).limit(1).maybeSingle(),
        ]);
        if (ownedRestaurant?.id) role = "restaurant_owner";
        else if (ownedGrocery?.id) role = "grocery_owner";
      }

      if (role === "restaurant_owner") {
        router.replace("/restaurants/orders");
        return;
      }

      if (role === "grocery_owner") {
        router.replace("/groceries/owner/dashboard");
        return;
      }

      setOk(true);
    }

    check();
  }, [router]);

  if (!ok) return null;
  return <>{children}</>;
}
