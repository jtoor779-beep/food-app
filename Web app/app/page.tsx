"use client";

import Link from "next/link";
import { Manrope } from "next/font/google";
import { useEffect, useMemo, useState } from "react";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
});

const heroPrimary = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "12px 20px",
  borderRadius: 999,
  fontWeight: 900,
  textDecoration: "none",
  background: "#111827",
  color: "#fff",
  border: "1px solid #111827",
};

const heroSecondary = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "12px 20px",
  borderRadius: 999,
  fontWeight: 900,
  textDecoration: "none",
  background: "rgba(255,255,255,0.96)",
  color: "#111827",
  border: "1px solid rgba(255,255,255,0.78)",
};

const glassCard = {
  borderRadius: 24,
  border: "1px solid rgba(15, 23, 42, 0.08)",
  background: "rgba(255,255,255,0.94)",
  boxShadow: "0 18px 48px rgba(15,23,42,0.08)",
};

const layeredBackground = (primary: string, _fallback: string, overlay: string) =>
  `${overlay}, url('${primary}')`;

const imageTile = (primary: string, fallback: string) => ({
  minHeight: 260,
  borderRadius: 22,
  overflow: "hidden",
  border: "1px solid rgba(15, 23, 42, 0.08)",
  backgroundImage: layeredBackground(
    primary,
    fallback,
    "linear-gradient(180deg, rgba(15,23,42,0.1), rgba(15,23,42,0.34))"
  ),
  backgroundSize: "cover",
  backgroundPosition: "center",
});

const heroSlides = [
  {
    src: "/landing-media/hero-slide-1.jpg",
    fallback: "https://images.unsplash.com/photo-1498654896293-37aacf113fd9?auto=format&fit=crop&w=2000&q=80",
  },
];

const upperRightSlides = [
  {
    src: "/landing-media/right-top-1.jpg",
    fallback: "/landing-media/driver-banner-1.jpg",
  },
  {
    src: "/landing-media/right-top-2.jpg",
    fallback: "/landing-media/driver-banner-2.jpg",
  },
];

const lowerRightSlides = [
  {
    src: "/landing-media/right-bottom-1.jpg",
    fallback: "/landing-media/driver-banner-2.jpg",
  },
  {
    src: "/landing-media/right-bottom-2.jpg",
    fallback: "/landing-media/driver-banner-3.jpg",
  },
];

const driverSlides = [
  {
    src: "/landing-media/driver-banner-1.jpg",
    fallback: "https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?auto=format&fit=crop&w=1600&q=80",
  },
  {
    src: "/landing-media/driver-banner-2.jpg",
    fallback: "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1600&q=80",
  },
  {
    src: "/landing-media/driver-banner-3.jpg",
    fallback: "https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=1600&q=80",
  },
];

const fallbackMediaSlides = [
  "/landing-media/hero-slide-1.jpg",
  "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1800&q=80",
  "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1800&q=80",
];

const initialVideoSlides = [
  { src: "/landing-media/landing-showcase.mp4", poster: "/landing-media/hero-slide-1.jpg" },

];

export default function LandingPage() {
  const [heroIndex, setHeroIndex] = useState(0);
  const [upperRightIndex, setUpperRightIndex] = useState(0);
  const [lowerRightIndex, setLowerRightIndex] = useState(0);
  const [driverIndex, setDriverIndex] = useState(0);
  const [mediaFallbackIndex, setMediaFallbackIndex] = useState(0);
  const [videoSlides, setVideoSlides] = useState(initialVideoSlides);
  const [videoIndex, setVideoIndex] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  

  useEffect(() => {
    const timer = window.setInterval(() => {
      setUpperRightIndex((prev) => (prev + 1) % upperRightSlides.length);
    }, 4700);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLowerRightIndex((prev) => (prev + 1) % lowerRightSlides.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDriverIndex((prev) => (prev + 1) % driverSlides.length);
    }, 4300);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMediaFallbackIndex((prev) => (prev + 1) % fallbackMediaSlides.length);
    }, 4800);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (videoIndex >= videoSlides.length) setVideoIndex(0);
  }, [videoIndex, videoSlides.length]);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY || 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 900);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const activeVideo = useMemo(() => videoSlides[videoIndex] || null, [videoIndex, videoSlides]);
  const videoTilt = Math.min(scrollY * 0.012, 10);
  const videoLift = Math.min(scrollY * 0.04, 32);
  const lowerLift = Math.min(scrollY * 0.025, 18);
  const downloadPhoneLift = Math.max(-8, 60 - scrollY * 0.05);
  const heroTextLift = Math.max(-22, 10 - scrollY * 0.03);
  const driverCardLift = Math.max(-16, 20 - scrollY * 0.02);

  function handleVideoError() {
    if (!activeVideo) return;
    setVideoSlides((prev) => {
      const next = prev.filter((slide) => slide.src !== activeVideo.src);
      return next;
    });
    setVideoIndex(0);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        width: "100%",
        fontFamily: manrope.style.fontFamily,
        background:
          "radial-gradient(1200px 520px at 12% 4%, rgba(255,140,0,0.18), transparent 58%), radial-gradient(1200px 520px at 88% 3%, rgba(80,160,255,0.12), transparent 56%), linear-gradient(180deg, #fff9f4, #ffffff 24%, #fffaf6 72%, #ffffff)",
      }}
    >
      <div
        style={{
          width: "100%",
          padding: isMobile ? "14px 14px 0" : "22px 20px 0",
          boxSizing: "border-box",
          display: "grid",
          gap: 20,
        }}
      >
        <section
          style={{
            ...glassCard,
            minHeight: isMobile ? 500 : 620,
            overflow: "hidden",
            position: "relative",
            display: "flex",
            alignItems: "flex-end",
          }}
        >
          {heroSlides.map((slide, index) => (
            <div
              key={slide.fallback}
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage: layeredBackground(
                  slide.src,
                  slide.fallback,
                  "linear-gradient(180deg, rgba(7,10,18,0.14), rgba(7,10,18,0.72))"
                ),
                backgroundSize: "cover",
                backgroundPosition: "center",
                opacity: heroIndex === index ? 1 : 0,
                transition: "opacity 1100ms ease-in-out",
              }}
            />
          ))}
          <div
            style={{
              width: "100%",
              padding: isMobile ? "24px 20px" : "34px 36px",
              color: "#fff",
              display: "grid",
              gap: 14,
              transform: `translateY(${heroTextLift}px)`,
              transition: "transform 180ms linear",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                width: "fit-content",
                alignItems: "center",
                padding: "7px 12px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.14)",
                border: "1px solid rgba(255,255,255,0.18)",
                fontWeight: 900,
                fontSize: 14,
              }}
            >
              HomyFod
            </div>

            <div
              style={{
                display: "inline-flex",
                width: "fit-content",
                alignItems: "center",
                padding: "8px 14px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.14)",
                fontWeight: 900,
                fontSize: 13,
                letterSpacing: 0.6,
                textTransform: "uppercase",
              }}
            >
              Best food app in California
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: isMobile ? 42 : 64,
                lineHeight: 0.95,
                fontWeight: 1000,
                maxWidth: 780,
                letterSpacing: -1.3,
              }}
            >
              Restaurant meals, grocery essentials, and local delivery in one premium flow.
            </h1>

            <div
              style={{
                maxWidth: 720,
                fontSize: isMobile ? 18 : 21,
                lineHeight: 1.58,
                color: "rgba(255,255,255,0.92)",
                fontWeight: 650,
              }}
            >
              Namaste! Your Indian groceries from HomyFod.
            </div>

            <div
              style={{
                maxWidth: 760,
                fontSize: isMobile ? 15 : 16,
                lineHeight: 1.7,
                color: "rgba(255,255,255,0.84)",
                fontWeight: 700,
              }}
            >
              From fresh sabzi to atta, rice, spices, and frozen snacks, HomyFod delivers it all.
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 2 }}>
              <Link href="/home" style={heroPrimary}>
                Open App Home
              </Link>
              <Link href="/login" style={heroSecondary}>
                Login
              </Link>
            </div>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: 16,
          }}
        >
            {[
              ["Indian restaurant favorites", "Browse biryani, curries, tandoori picks, and house specials with smoother ordering."],
              ["Indian grocery essentials", "Restock atta, rice, lentils, masala, frozen snacks, and fresh sabzi from nearby stores."],
              ["Live delivery progress", "Follow each order through preparation, pickup, and drop-off."],
              ["One connected platform", "Customers, stores, drivers, and operations stay aligned in one system."],
            ].map(([title, text]) => (
            <div key={title} style={{ ...glassCard, padding: 22 }}>
              <div style={{ fontSize: 19, fontWeight: 1000, color: "#0f172a" }}>{title}</div>
              <div style={{ marginTop: 10, color: "rgba(15,23,42,0.74)", fontWeight: 700, lineHeight: 1.65 }}>{text}</div>
            </div>
          ))}
        </section>

        <section
          style={{
            ...glassCard,
            padding: 22,
            display: "grid",
            gap: 18,
            transform: `perspective(1400px) translateY(${videoLift * -1}px) rotateX(${videoTilt}deg)`,
            transformOrigin: "top center",
            transition: "transform 180ms linear",
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 950, color: "#f97316" }}>See HomyFod in motion</div>
            <h2 style={{ margin: "8px 0 0 0", fontSize: 42, lineHeight: 1.06, color: "#0f172a" }}>
              A bigger look at the experience.
            </h2>
            <div style={{ marginTop: 12, maxWidth: 920, color: "rgba(15,23,42,0.74)", fontWeight: 700, lineHeight: 1.7 }}>
              Compare grocery picks, browse Indian meals, apply offers, and move through checkout with a cleaner ordering journey.
            </div>
          </div>

          <div style={{ overflow: "hidden", borderRadius: 26, border: "1px solid rgba(15, 23, 42, 0.08)", background: "#0f172a", position: "relative" }}>
            {!activeVideo ? (
              <div
                style={{
                  height: 620,
                  width: "100%",
                  position: "relative",
                }}
              >
                {fallbackMediaSlides.map((url, index) => (
                  <div
                    key={url}
                    style={{
                      position: "absolute",
                      inset: 0,
                      backgroundImage: `linear-gradient(180deg, rgba(7,10,18,0.2), rgba(7,10,18,0.68)), url('${url}')`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      opacity: mediaFallbackIndex === index ? 1 : 0,
                      transition: "opacity 1100ms ease-in-out",
                    }}
                  />
                ))}
                <div
                  style={{
                    position: "absolute",
                    inset: "auto 28px 28px 28px",
                    color: "#fff",
                    maxWidth: 760,
                  }}
                >
                  <div style={{ fontSize: 32, fontWeight: 1000, lineHeight: 1.08 }}>
                    Drop your updated landing videos into the media folder and they will rotate here automatically.
                  </div>
                </div>
              </div>
            ) : (
              <video
                key={activeVideo.src}
                autoPlay
                muted
                playsInline
                preload="none"
                disablePictureInPicture
                controls={false}
                loop={videoSlides.length === 1}
                onError={handleVideoError}
                poster={activeVideo.poster}
                style={{
                  width: "100%",
                  height: 620,
                  objectFit: "cover",
                  display: "block",
                  background: "#0f172a",
                  pointerEvents: "none",
                  transition: "opacity 700ms ease-in-out",
                }}
                src={activeVideo.src}
              />
            )}
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1.08fr 0.92fr",
            gap: 18,
          }}
        >
          <div style={{ ...glassCard, padding: 24, display: "grid", gap: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 950, color: "#f97316" }}>What people come for</div>
            <h2 style={{ margin: 0, fontSize: 40, lineHeight: 1.06, color: "#0f172a" }}>
              Better food nights and faster grocery runs.
            </h2>
              <div style={{ color: "rgba(15,23,42,0.74)", fontWeight: 700, lineHeight: 1.75 }}>
                HomyFod brings Indian restaurant ordering and grocery shopping together with delivery updates, clearer pricing, and a smoother everyday experience.
              </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 14,
              }}
            >
                <div
                  style={{
                    ...imageTile(
                    "/landing-media/left-small-1.jpg",
                    "/landing-media/hero-slide-1.jpg"
                  ),
                  padding: 18,
                  display: "flex",
                  alignItems: "flex-end",
                  minHeight: 220,
                  width: isMobile ? "100%" : "84%",
                  justifySelf: "start",
                }}
              >
                <div style={{ color: "#fff", fontWeight: 950, fontSize: 24 }}>Indian meal picks</div>
              </div>
                <div
                  style={{
                    ...imageTile(
                    "/landing-media/left-small-2.jpg",
                    "/landing-media/driver-banner-1.jpg"
                  ),
                  padding: 18,
                  display: "flex",
                  alignItems: "flex-end",
                  minHeight: 220,
                  width: isMobile ? "100%" : "76%",
                  justifySelf: isMobile ? "stretch" : "end",
                }}
              >
                <div style={{ color: "#fff", fontWeight: 950, fontSize: 24 }}>Sabzi and pantry staples</div>
              </div>
            </div>
          </div>

          <div
            style={{
              ...glassCard,
              padding: 24,
              color: "#fff",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              minHeight: 420,
              position: "relative",
              overflow: "hidden",
              transform: `translateY(${Math.max(0, lowerLift * -1)}px)`,
              transition: "transform 180ms linear",
            }}
          >
            {upperRightSlides.map((slide, index) => (
              <div
                key={slide.fallback}
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage: layeredBackground(
                    slide.src,
                    slide.fallback,
                    "linear-gradient(135deg, rgba(17,24,39,0.98), rgba(31,41,55,0.94))"
                  ),
                  backgroundBlendMode: "overlay",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  opacity: upperRightIndex === index ? 1 : 0,
                  transition: "opacity 1100ms ease-in-out",
                }}
              />
            ))}
            <div>
              <div style={{ fontSize: 13, fontWeight: 950, color: "rgba(255,196,128,0.98)" }}>Ready to open the app</div>
              <h2 style={{ margin: "10px 0 0 0", fontSize: 38, lineHeight: 1.06 }}>
                Start from the app home and order with less friction.
              </h2>
              <div style={{ marginTop: 14, color: "rgba(255,255,255,0.9)", fontWeight: 700, lineHeight: 1.75 }}>
                HomyFod - Apna taste. Apna store.
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gap: 12,
                alignSelf: "flex-end",
                justifyItems: "start",
                position: "relative",
                zIndex: 1,
              }}
            >
              {[
                { text: "Fresh sabzi", shift: 0 },
                { text: "Late-night cravings", shift: isMobile ? 28 : 86 },
                { text: "Weekend tandoori", shift: isMobile ? 10 : 46 },
              ].map((item) => (
                <div
                  key={item.text}
                  style={{
                    marginLeft: item.shift,
                    padding: "10px 16px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.1)",
                    border: "1px solid rgba(255,255,255,0.16)",
                    color: "#fff",
                    fontWeight: 900,
                    backdropFilter: "blur(8px)",
                  }}
                >
                  {item.text}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "0.95fr 1.05fr",
            gap: 18,
          }}
        >
          <div
            style={{
              ...glassCard,
              padding: 24,
              minHeight: 430,
              background:
                "linear-gradient(135deg, rgba(255,246,237,0.98), rgba(255,255,255,0.96))",
              display: "grid",
              alignContent: "space-between",
              gap: 18,
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 950, color: "#f97316" }}>Built for everyday use</div>
              <h2 style={{ margin: "10px 0 0 0", fontSize: 38, lineHeight: 1.06, color: "#0f172a" }}>
                One place for dinner plans, pantry runs, and repeat orders.
              </h2>
              <div style={{ marginTop: 14, color: "rgba(15,23,42,0.74)", fontWeight: 700, lineHeight: 1.75 }}>
                Save time with quicker reorders, clear delivery pricing, live order progress, and a cleaner checkout flow across Indian food and groceries.
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 14,
              }}
            >
              {[
                ["Live pricing", "See discounts, delivery, and final totals more clearly."],
                ["Order tracking", "Follow every order from store prep to your doorstep."],
                ["Repeat favorites", "Jump back into rotis, curries, atta, rice, and pantry staples without starting from scratch."],
              ].map(([title, text]) => (
                <div
                  key={title}
                  style={{
                    borderRadius: 18,
                    border: "1px solid rgba(15,23,42,0.08)",
                    background: "#fff",
                    padding: 16,
                  }}
                >
                  <div style={{ fontSize: 18, fontWeight: 950, color: "#0f172a" }}>{title}</div>
                  <div style={{ marginTop: 8, color: "rgba(15,23,42,0.7)", fontWeight: 700, lineHeight: 1.6 }}>{text}</div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              ...glassCard,
              minHeight: 430,
              overflow: "hidden",
              display: "flex",
              alignItems: "flex-end",
              position: "relative",
            }}
          >
            {lowerRightSlides.map((slide, index) => (
              <div
                key={`${slide.fallback}-lower`}
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage: layeredBackground(
                    slide.src,
                    slide.fallback,
                    "linear-gradient(180deg, rgba(15,23,42,0.12), rgba(15,23,42,0.58))"
                  ),
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  opacity: lowerRightIndex === index ? 1 : 0,
                  transition: "opacity 1100ms ease-in-out",
                }}
              />
            ))}
            <div
              style={{
                padding: 26,
                color: "#fff",
                maxWidth: 720,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 950, color: "rgba(255,210,164,0.98)" }}>Always ready for the next order</div>
              <div style={{ marginTop: 10, fontSize: 38, fontWeight: 1000, lineHeight: 1.06 }}>
                A fuller HomyFod experience from first browse to final delivery.
              </div>
              <div style={{ marginTop: 14, color: "rgba(255,255,255,0.9)", fontWeight: 700, lineHeight: 1.7 }}>
                Explore local Indian restaurants, stock up on essentials, apply offers, and keep everything moving with one connected ordering flow.
              </div>
              <div
                style={{
                  marginTop: 18,
                  display: "grid",
                  gap: 10,
                  justifyItems: "start",
                }}
              >
                {[
                  { text: "Biryani nights", shift: 0 },
                  { text: "Pantry restocks", shift: isMobile ? 22 : 72 },
                  { text: "Smooth delivery", shift: isMobile ? 8 : 34 },
                ].map((item) => (
                  <div
                    key={item.text}
                    style={{
                      marginLeft: item.shift,
                      padding: "9px 15px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.1)",
                      border: "1px solid rgba(255,255,255,0.18)",
                      color: "#fff",
                      fontWeight: 900,
                      backdropFilter: "blur(8px)",
                    }}
                  >
                    {item.text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section
          style={{
            ...glassCard,
            padding: isMobile ? 20 : 28,
            background:
              "radial-gradient(700px 320px at 8% 12%, rgba(255,167,112,0.16), transparent 62%), radial-gradient(520px 240px at 90% 86%, rgba(255,192,203,0.18), transparent 62%), linear-gradient(180deg, #fff8f6, #fff3f3)",
            border: "1px solid rgba(255,192,203,0.45)",
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 420px",
            gap: 24,
            overflow: "hidden",
            minHeight: isMobile ? 680 : 470,
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              right: isMobile ? "-100px" : "-10px",
              bottom: isMobile ? "-120px" : "-80px",
              width: isMobile ? 280 : 420,
              height: isMobile ? 280 : 420,
              borderRadius: "50%",
              border: "1px solid rgba(255,179,192,0.35)",
            }}
          />
          <div style={{ display: "grid", alignContent: "center", gap: 14, position: "relative", zIndex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#f97316", textTransform: "uppercase", letterSpacing: 0.7 }}>
              Download now
            </div>
            <h2 style={{ margin: 0, fontSize: isMobile ? 36 : 48, lineHeight: 1.02, color: "#0f172a", letterSpacing: -0.8 }}>
              Get the HomyFod app and order faster every day.
            </h2>
            <div style={{ maxWidth: 540, color: "rgba(15,23,42,0.72)", fontWeight: 700, lineHeight: 1.75, fontSize: isMobile ? 17 : 18 }}>
              Jump into Indian food ordering, grocery browsing, coupons, and cleaner checkout with the HomyFod customer app. The driver app keeps delivery partners moving smoothly too.
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, max-content))",
                gap: 12,
                alignItems: "center",
                marginTop: 4,
              }}
            >
              {[
                "Indian stores near you",
                "Coupons and repeat orders",
                "Smooth checkout and tracking",
              ].map((label, index) => (
                <div
                  key={label}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 999,
                    background: "#fff",
                    border: "1px solid rgba(15,23,42,0.08)",
                    fontWeight: 850,
                    color: "#0f172a",
                    boxShadow: "0 12px 30px rgba(15,23,42,0.08)",
                    transform: isMobile ? "none" : `translateY(${index % 2 === 0 ? "0px" : "12px"})`,
                  }}
                >
                  {label}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
              <a
                href="https://apps.apple.com/us/app/homyfod/id6761292931"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  borderRadius: 14,
                  background: "#000",
                  color: "#fff",
                  textDecoration: "none",
                  fontWeight: 900,
                  minWidth: 210,
                }}
              >
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M15.2 12.1C15.21 14.38 17.19 15.14 17.21 15.15C17.19 15.21 16.89 16.24 16.16 17.31C15.53 18.23 14.87 19.14 13.84 19.16C12.83 19.18 12.51 18.56 11.36 18.56C10.22 18.56 9.86 19.14 8.9 19.18C7.9 19.22 7.14 18.18 6.51 17.27C5.22 15.41 4.24 12.02 5.57 9.71C6.23 8.56 7.43 7.83 8.73 7.81C9.72 7.79 10.66 8.49 11.27 8.49C11.88 8.49 13.03 7.66 14.22 7.78C14.72 7.8 16.11 7.98 16.99 9.27C16.92 9.31 15.19 10.32 15.2 12.1Z" fill="currentColor" />
                  <path d="M13.45 6.4C13.98 5.76 14.33 4.87 14.23 4C13.47 4.03 12.56 4.5 12 5.13C11.5 5.7 11.06 6.61 11.19 7.47C12.04 7.54 12.92 7.03 13.45 6.4Z" fill="currentColor" />
                </svg>
                <span style={{ display: "grid", lineHeight: 1.1 }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.72)" }}>Download on the</span>
                  <span style={{ fontSize: 22 }}>App Store</span>
                </span>
              </a>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  borderRadius: 14,
                  background: "#000",
                  color: "rgba(255,255,255,0.78)",
                  fontWeight: 900,
                  minWidth: 210,
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3.3 2.87C3.11 3.16 3 3.58 3 4.13V19.86C3 20.4 3.11 20.83 3.3 21.12L12.12 12L3.3 2.87Z" fill="currentColor" />
                  <path d="M15.06 8.94L6.38 3.88L13.26 10.76L15.06 8.94Z" fill="currentColor" />
                  <path d="M15.06 15.06L13.26 13.24L6.38 20.12L15.06 15.06Z" fill="currentColor" />
                  <path d="M21 11.36C21.4 11.58 21.4 12.42 21 12.64L16.63 15.11L14.4 12.88L16.63 10.89L21 11.36Z" fill="currentColor" />
                </svg>
                <span style={{ display: "grid", lineHeight: 1.1 }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.58)" }}>Coming soon on</span>
                  <span style={{ fontSize: 22 }}>Google Play</span>
                </span>
              </div>
            </div>
          </div>

          <div
            style={{
              position: "relative",
              minHeight: isMobile ? 360 : 420,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {!isMobile ? (
              <>
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 34,
                    padding: "12px 16px",
                    borderRadius: 22,
                    background: "#fff",
                    border: "1px solid rgba(15,23,42,0.08)",
                    boxShadow: "0 20px 45px rgba(15,23,42,0.12)",
                    transform: `translateY(${Math.max(-8, 18 - scrollY * 0.015)}px) rotate(-4deg)`,
                    zIndex: 1,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 900, color: "#f97316" }}>Fast checkout</div>
                  <div style={{ marginTop: 4, fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Meals, groceries, and offers in one app</div>
                </div>
                <div
                  style={{
                    position: "absolute",
                    right: 8,
                    bottom: 36,
                    padding: "12px 16px",
                    borderRadius: 22,
                    background: "#fff",
                    border: "1px solid rgba(15,23,42,0.08)",
                    boxShadow: "0 20px 45px rgba(15,23,42,0.12)",
                    transform: `translateY(${Math.max(-12, 26 - scrollY * 0.018)}px) rotate(5deg)`,
                    zIndex: 1,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 900, color: "#f97316" }}>Live tracking</div>
                  <div style={{ marginTop: 4, fontSize: 15, fontWeight: 800, color: "#0f172a" }}>From store shelf to doorstep</div>
                </div>
              </>
            ) : null}
            <div
              style={{
                width: isMobile ? 240 : 280,
                height: isMobile ? 470 : 560,
                borderRadius: 38,
                background: "#0f172a",
                border: "10px solid #111827",
                boxShadow: "0 30px 80px rgba(15,23,42,0.22)",
                transform: `translateY(${downloadPhoneLift}px) rotate(${isMobile ? "0deg" : "-2deg"})`,
                transition: "transform 180ms linear",
                overflow: "hidden",
                position: "relative",
                zIndex: 2,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 10,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 110,
                  height: 18,
                  borderRadius: 999,
                  background: "#0b1220",
                  zIndex: 2,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "#ffffff",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage: "url('/landing-media/customer-home.png')",
                    backgroundSize: "contain",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "top center",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(180deg, rgba(255,255,255,0) 50%, rgba(15,23,42,0.18) 100%)",
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        <section
          style={{
            ...glassCard,
            padding: isMobile ? 20 : 24,
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "0.9fr 1.1fr",
            gap: 20,
            overflow: "hidden",
            background:
              "radial-gradient(520px 220px at 0% 20%, rgba(255,140,0,0.08), transparent 68%), linear-gradient(180deg, #ffffff, #fffaf5)",
          }}
        >
          <div
            style={{
              minHeight: isMobile ? 300 : 420,
              borderRadius: 24,
              position: "relative",
              overflow: "hidden",
            }}
          >
            {driverSlides.map((slide, index) => (
              <div
                key={slide.fallback}
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage: layeredBackground(
                    slide.src,
                    slide.fallback,
                    "linear-gradient(180deg, rgba(15,23,42,0.16), rgba(15,23,42,0.58))"
                  ),
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  opacity: driverIndex === index ? 1 : 0,
                  transition: "opacity 1000ms ease-in-out",
                }}
              />
            ))}
            <div
              style={{
                position: "absolute",
                left: 20,
                right: 20,
                bottom: 18,
                display: "grid",
                gap: 10,
                justifyItems: "start",
                zIndex: 1,
              }}
            >
              {[
                { text: "Join on your schedule", shift: 0 },
                { text: "Accept and deliver smoothly", shift: isMobile ? 16 : 58 },
                { text: "Track payouts clearly", shift: isMobile ? 6 : 28 },
              ].map((item) => (
                <div
                  key={item.text}
                  style={{
                    marginLeft: item.shift,
                    padding: "10px 16px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.12)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    color: "#fff",
                    fontWeight: 900,
                    backdropFilter: "blur(8px)",
                  }}
                >
                  {item.text}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", alignContent: "center", gap: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#f97316", textTransform: "uppercase", letterSpacing: 0.7 }}>
              For drivers
            </div>
            <h2 style={{ margin: 0, fontSize: isMobile ? 34 : 46, lineHeight: 1.04, color: "#0f172a", letterSpacing: -0.7 }}>
              Join HomyFod and deliver smoothly while earning on your own schedule.
            </h2>
            <div style={{ color: "rgba(15,23,42,0.74)", fontWeight: 700, lineHeight: 1.8, fontSize: isMobile ? 17 : 18 }}>
              The HomyFod driver app helps delivery partners accept orders, manage active trips, follow route progress, and complete deliveries with less friction.
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
                gap: 12,
                transform: `translateY(${driverCardLift}px)`,
                transition: "transform 180ms linear",
              }}
            >
              {[
                ["Smooth dispatch", "Accept and move through active orders faster."],
                ["Better visibility", "See trip progress, payouts, and updates clearly."],
                ["Flexible earning", "Stay available when you want and keep moving."],
              ].map(([title, text]) => (
                <div
                  key={title}
                  style={{
                    borderRadius: 18,
                    border: "1px solid rgba(15,23,42,0.08)",
                    background: "#fff",
                    padding: 16,
                  }}
                >
                  <div style={{ fontSize: 19, fontWeight: 900, color: "#0f172a" }}>{title}</div>
                  <div style={{ marginTop: 8, color: "rgba(15,23,42,0.72)", fontWeight: 700, lineHeight: 1.65 }}>{text}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Link href="/signup?role=delivery_partner" style={heroPrimary}>
                Join as driver
              </Link>
              <a
                href="https://apps.apple.com/us/app/homyfod-driver/id6761338026"
                target="_blank"
                rel="noreferrer"
                style={heroSecondary}
              >
                Driver app
              </a>
            </div>
          </div>
        </section>

        <footer
          style={{
            marginTop: 10,
            marginLeft: "calc(50% - 50vw)",
            width: "100vw",
            background: "#000000",
            color: "#fff",
            padding: isMobile ? "40px 20px 56px" : "56px 42px 72px",
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1.1fr 0.8fr 0.95fr",
            gap: 22,
            boxSizing: "border-box",
            minHeight: 340,
          }}
        >
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1.02, letterSpacing: -0.8 }}>HomyFod - Apna taste. Apna store.</div>
            <div style={{ color: "rgba(255,255,255,0.78)", fontWeight: 600, lineHeight: 1.8, maxWidth: 520, fontSize: 18 }}>
              Indian meals, grocery essentials, fresh sabzi, pantry staples, and connected local delivery in one smoother everyday experience.
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[
                ["Instagram", "https://www.instagram.com/"],
                ["Facebook", "https://www.facebook.com/"],
                ["YouTube", "https://www.youtube.com/"],
              ].map(([label, href]) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 50,
                    height: 50,
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(255,255,255,0.02)",
                    color: "#fff",
                    textDecoration: "none",
                    fontWeight: 900,
                  }}
                  aria-label={label}
                  title={label}
                >
                  {label === "Instagram" ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="2" />
                      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
                      <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" />
                    </svg>
                  ) : label === "Facebook" ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M13.5 21V13.5H16L16.4 10.5H13.5V8.6C13.5 7.73 13.75 7.13 15 7.13H16.5V4.45C16.24 4.41 15.33 4.33 14.27 4.33C12.05 4.33 10.5 5.69 10.5 8.18V10.5H8V13.5H10.5V21H13.5Z" fill="currentColor" />
                    </svg>
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M21 7.2C21 5.98 20.57 4.93 19.71 4.33C18.25 3.33 12 3.33 12 3.33C12 3.33 5.75 3.33 4.29 4.33C3.43 4.93 3 5.98 3 7.2V16.8C3 18.02 3.43 19.07 4.29 19.67C5.75 20.67 12 20.67 12 20.67C12 20.67 18.25 20.67 19.71 19.67C20.57 19.07 21 18.02 21 16.8V7.2Z" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M10 9L15 12L10 15V9Z" fill="currentColor" />
                    </svg>
                  )}
                </a>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(255,196,128,0.98)", textTransform: "uppercase", letterSpacing: 0.8 }}>
              Policies
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {[
                ["About Us", "/about"],
                ["Policies", "/policies"],
                ["Privacy Policy", "/privacy-policy"],
                ["Refund Policy", "/refund-policy"],
                ["Terms & Conditions", "/terms-and-conditions"],
              ].map(([label, href]) => (
                <Link
                  key={label}
                  href={href}
                  style={{
                    color: "rgba(255,255,255,0.9)",
                    textDecoration: "none",
                    fontWeight: 700,
                    fontSize: 20,
                  }}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "rgba(255,196,128,0.98)", textTransform: "uppercase", letterSpacing: 0.8 }}>
              Download apps
            </div>
            <div
              style={{
                display: "grid",
                gap: 12,
                maxWidth: isMobile ? "100%" : 360,
              }}
            >
              <a
                href="https://apps.apple.com/us/app/homyfod/id6761292931"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  borderRadius: 16,
                  background: "linear-gradient(180deg, #131313, #050505)",
                  color: "#fff",
                  textDecoration: "none",
                  fontWeight: 900,
                  gap: 14,
                  border: "1px solid rgba(255,255,255,0.22)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
                }}
              >
                <span style={{ display: "grid", gap: 1 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.72)" }}>Download now</span>
                  <span style={{ fontSize: 20, lineHeight: 1.1 }}>Customer app</span>
                </span>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M15.2 12.1C15.21 14.38 17.19 15.14 17.21 15.15C17.19 15.21 16.89 16.24 16.16 17.31C15.53 18.23 14.87 19.14 13.84 19.16C12.83 19.18 12.51 18.56 11.36 18.56C10.22 18.56 9.86 19.14 8.9 19.18C7.9 19.22 7.14 18.18 6.51 17.27C5.22 15.41 4.24 12.02 5.57 9.71C6.23 8.56 7.43 7.83 8.73 7.81C9.72 7.79 10.66 8.49 11.27 8.49C11.88 8.49 13.03 7.66 14.22 7.78C14.72 7.8 16.11 7.98 16.99 9.27C16.92 9.31 15.19 10.32 15.2 12.1Z" fill="currentColor" />
                  <path d="M13.45 6.4C13.98 5.76 14.33 4.87 14.23 4C13.47 4.03 12.56 4.5 12 5.13C11.5 5.7 11.06 6.61 11.19 7.47C12.04 7.54 12.92 7.03 13.45 6.4Z" fill="currentColor" />
                </svg>
              </a>
              <a
                href="https://apps.apple.com/us/app/homyfod-driver/id6761338026"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  borderRadius: 16,
                  background: "linear-gradient(180deg, #131313, #050505)",
                  color: "#fff",
                  textDecoration: "none",
                  fontWeight: 900,
                  border: "1px solid rgba(255,255,255,0.22)",
                  gap: 14,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
                }}
              >
                <span style={{ display: "grid", gap: 1 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.72)" }}>Download now</span>
                  <span style={{ fontSize: 20, lineHeight: 1.1 }}>Driver app</span>
                </span>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M15.2 12.1C15.21 14.38 17.19 15.14 17.21 15.15C17.19 15.21 16.89 16.24 16.16 17.31C15.53 18.23 14.87 19.14 13.84 19.16C12.83 19.18 12.51 18.56 11.36 18.56C10.22 18.56 9.86 19.14 8.9 19.18C7.9 19.22 7.14 18.18 6.51 17.27C5.22 15.41 4.24 12.02 5.57 9.71C6.23 8.56 7.43 7.83 8.73 7.81C9.72 7.79 10.66 8.49 11.27 8.49C11.88 8.49 13.03 7.66 14.22 7.78C14.72 7.8 16.11 7.98 16.99 9.27C16.92 9.31 15.19 10.32 15.2 12.1Z" fill="currentColor" />
                  <path d="M13.45 6.4C13.98 5.76 14.33 4.87 14.23 4C13.47 4.03 12.56 4.5 12 5.13C11.5 5.7 11.06 6.61 11.19 7.47C12.04 7.54 12.92 7.03 13.45 6.4Z" fill="currentColor" />
                </svg>
              </a>
              <a
                href="#"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  borderRadius: 16,
                  background: "linear-gradient(180deg, #131313, #050505)",
                  color: "rgba(255,255,255,0.75)",
                  fontWeight: 900,
                  border: "1px solid rgba(255,255,255,0.18)",
                  textDecoration: "none",
                  pointerEvents: "none",
                  gap: 14,
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                }}
              >
                <span style={{ display: "grid", gap: 1 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.62)" }}>Coming soon</span>
                  <span style={{ fontSize: 20, lineHeight: 1.1 }}>Play Store</span>
                </span>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3.3 2.87C3.11 3.16 3 3.58 3 4.13V19.86C3 20.4 3.11 20.83 3.3 21.12L12.12 12L3.3 2.87Z" fill="currentColor" />
                  <path d="M15.06 8.94L6.38 3.88L13.26 10.76L15.06 8.94Z" fill="currentColor" />
                  <path d="M15.06 15.06L13.26 13.24L6.38 20.12L15.06 15.06Z" fill="currentColor" />
                  <path d="M21 11.36C21.4 11.58 21.4 12.42 21 12.64L16.63 15.11L14.4 12.88L16.63 10.89L21 11.36Z" fill="currentColor" />
                </svg>
              </a>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
