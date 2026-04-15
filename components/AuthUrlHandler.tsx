"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabase";

function hasAuthUrlParams(url: URL) {
  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  const hashParams = new URLSearchParams(hash);

  return (
    url.searchParams.has("code") ||
    (url.searchParams.has("token_hash") && url.searchParams.has("type")) ||
    (hashParams.has("access_token") && hashParams.has("refresh_token"))
  );
}

export default function AuthUrlHandler() {
  const router = useRouter();
  const busyRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || busyRef.current) return;

    const url = new URL(window.location.href);
    if (!hasAuthUrlParams(url)) return;

    busyRef.current = true;

    const run = async () => {
      try {
        const code = url.searchParams.get("code");
        const tokenHash = url.searchParams.get("token_hash");
        const type = url.searchParams.get("type");
        const rawHash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
        const hashParams = new URLSearchParams(rawHash);
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({
            type,
            token_hash: tokenHash,
          });
          if (error) throw error;
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        }

        const cleanPath = "/login?confirmed=1";
        window.history.replaceState({}, "", cleanPath);
        router.replace(cleanPath);
        router.refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Email confirmation failed.";
        const next = `/login?auth_error=${encodeURIComponent(message)}`;
        window.history.replaceState({}, "", next);
        router.replace(next);
      } finally {
        busyRef.current = false;
      }
    };

    void run();
  }, [router]);

  return null;
}
