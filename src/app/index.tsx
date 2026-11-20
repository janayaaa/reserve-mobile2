import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  ImageBackground,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
let hasPlayedAppLaunchSplash = false;

export default function Index() {
  const [showSplash, setShowSplash] = useState(!hasPlayedAppLaunchSplash);

  // Splash Screen Animations
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const splashLogoScale = useRef(new Animated.Value(0.72)).current;
  const splashLogoOpacity = useRef(new Animated.Value(0)).current;
  const splashTaglineY = useRef(new Animated.Value(14)).current;
  const splashTaglineOpacity = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Landing Content Animations
  const landingLogoAnim = useRef(
    new Animated.Value(hasPlayedAppLaunchSplash ? 1 : 0)
  ).current;
  const landingHeroAnim = useRef(
    new Animated.Value(hasPlayedAppLaunchSplash ? 1 : 0)
  ).current;
  const landingButtonsAnim = useRef(
    new Animated.Value(hasPlayedAppLaunchSplash ? 1 : 0)
  ).current;

  const triggerLandingEntrance = () => {
    Animated.stagger(160, [
      Animated.timing(landingLogoAnim, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(landingHeroAnim, {
        toValue: 1,
        duration: 550,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(landingButtonsAnim, {
        toValue: 1,
        duration: 550,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  };

  useEffect(() => {
    if (hasPlayedAppLaunchSplash) {
      setShowSplash(false);
      return;
    }

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, {
          toValue: 1.08,
          duration: 680,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseScale, {
          toValue: 1,
          duration: 680,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();

    Animated.parallel([
      Animated.spring(splashLogoScale, {
        toValue: 1,
        friction: 6,
        tension: 50,
        useNativeDriver: true,
      }),
      Animated.timing(splashLogoOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(splashTaglineOpacity, {
        toValue: 1,
        duration: 600,
        delay: 200,
        useNativeDriver: true,
      }),
      Animated.timing(splashTaglineY, {
        toValue: 0,
        duration: 600,
        delay: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: 2100,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: false,
      }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.timing(splashOpacity, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        pulseLoop.stop();
        hasPlayedAppLaunchSplash = true;
        setShowSplash(false);
        triggerLandingEntrance();
      });
    }, 2250);

    return () => {
      clearTimeout(timer);
      pulseLoop.stop();
    };
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.min(240, SCREEN_WIDTH * 0.62)],
  });

  return (
    <View style={styles.container}>
      <ImageBackground
        source={{
          uri: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=85",
        }}
        style={styles.background}
        resizeMode="cover"
      >
        {/* DARK OVERLAY */}
        <View style={styles.overlay} />

        {/* LANDING CONTENT */}
        <View style={styles.content}>
          {/* LOGO */}
          <Animated.View
            style={[
              styles.logoContainer,
              {
                opacity: landingLogoAnim,
                transform: [
                  {
                    translateY: landingLogoAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-16, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={styles.logo}>RESERVE</Text>
            <Text style={styles.tagline}>Rescue. Reserve. Reduce.</Text>
          </Animated.View>

          {/* MAIN MESSAGE */}
          <Animated.View
            style={[
              styles.middleContent,
              {
                opacity: landingHeroAnim,
                transform: [
                  {
                    translateY: landingHeroAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [20, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={styles.title}>
              Good food deserves
              {"\n"}
              another chance.
            </Text>

            <Text style={styles.description}>
              Connect with local food establishments and rescue quality surplus
              food at affordable prices — while helping reduce food waste.
            </Text>
          </Animated.View>

          {/* BUTTONS */}
          <Animated.View
            style={[
              styles.buttonContainer,
              {
                opacity: landingButtonsAnim,
                transform: [
                  {
                    translateY: landingButtonsAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [24, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {/* GET STARTED */}
            <TouchableOpacity
              style={styles.getStartedButton}
              activeOpacity={0.85}
              onPress={() => router.push("/consumer/account-type")}
            >
              <Text style={styles.getStartedText}>GET STARTED</Text>

              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            {/* LOG IN */}
            <TouchableOpacity
              style={styles.loginButton}
              activeOpacity={0.85}
              onPress={() => router.push("/consumer")}
            >
              <Text style={styles.loginText}>LOG IN</Text>
            </TouchableOpacity>

            {/* VENDOR LINK */}
            <TouchableOpacity
              style={styles.vendorButton}
              activeOpacity={0.7}
              onPress={() => router.push("/establishment/signup")}
            >
              <Text style={styles.vendorText}>
                Are you a food establishment?
              </Text>

              <Text style={styles.vendorLink}>Register as a Vendor</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </ImageBackground>

      {/* SELF-CONTAINED ANIMATED SPLASH SCREEN OVERLAY */}
      {showSplash && (
        <Animated.View
          style={[styles.splashOverlay, { opacity: splashOpacity }]}
          pointerEvents="auto"
        >
          <View style={styles.splashCircleTop} />
          <View style={styles.splashCircleBottom} />

          <View style={styles.splashCenterContent}>
            <Animated.View
              style={[
                styles.splashIconOuter,
                {
                  opacity: splashLogoOpacity,
                  transform: [
                    {
                      scale: Animated.multiply(splashLogoScale, pulseScale),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.splashIconInner}>
                <Ionicons name="leaf" size={40} color="#FFFFFF" />
              </View>
            </Animated.View>

            <Animated.View
              style={{
                opacity: splashLogoOpacity,
                transform: [{ scale: splashLogoScale }],
                alignItems: "center",
              }}
            >
              <Text style={styles.splashBrandTitle}>RESERVE</Text>
            </Animated.View>

            <Animated.View
              style={{
                opacity: splashTaglineOpacity,
                transform: [{ translateY: splashTaglineY }],
                alignItems: "center",
              }}
            >
              <Text style={styles.splashBrandTagline}>
                Rescue. Reserve. Reduce.
              </Text>

              <View style={styles.splashNodePill}>
                <View style={styles.splashNodeDot} />
                <Text style={styles.splashNodePillText}>
                  Cebu Surplus Food Rescue Network
                </Text>
              </View>
            </Animated.View>

            <View style={styles.splashProgressTrack}>
              <Animated.View
                style={[styles.splashProgressFill, { width: progressWidth }]}
              />
            </View>
            <Text style={styles.splashLoadingSubtext}>
              Loading Cebu City Haversine &amp; TTT Food Safety Network...
            </Text>
          </View>

          <View style={styles.splashFooter}>
            <Text style={styles.splashFooterText}>
              CONSUMERS • MERCHANTS • FOOD BANKS
            </Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

/* =====================================================
   STYLES
===================================================== */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#07532F",
  },

  background: {
    flex: 1,
    width: "100%",
    height: "100%",
  },

  /* ===================================================
     OVERLAY
  =================================================== */

  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.48)",
  },

  /* ===================================================
     CONTENT
  =================================================== */

  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 65,
    paddingBottom: 35,
    justifyContent: "space-between",
  },

  /* ===================================================
     LOGO
  =================================================== */

  logoContainer: {
    alignItems: "center",
  },

  logo: {
    fontFamily: "PoppinsBold",
    fontSize: 34,
    color: "#FFFFFF",
    letterSpacing: 1.5,
  },

  tagline: {
    fontFamily: "PoppinsMedium",
    fontSize: 11,
    color: "#D8EBDD",
    marginTop: -2,
    letterSpacing: 0.8,
  },

  /* ===================================================
     MAIN MESSAGE
  =================================================== */

  middleContent: {
    marginTop: 60,
    marginBottom: 30,
  },

  title: {
    fontFamily: "PoppinsBold",
    fontSize: 29,
    lineHeight: 37,
    color: "#FFFFFF",
    textAlign: "left",
    marginBottom: 14,
  },

  description: {
    fontFamily: "PoppinsRegular",
    fontSize: 13,
    lineHeight: 21,
    color: "#F5F5F5",
    maxWidth: 340,
  },

  /* ===================================================
     BUTTONS
  =================================================== */

  buttonContainer: {
    width: "100%",
  },

  getStartedButton: {
    width: "100%",
    height: 53,
    borderRadius: 9,
    backgroundColor: "#07532F",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },

  getStartedText: {
    fontFamily: "PoppinsBold",
    fontSize: 14,
    color: "#FFFFFF",
    marginRight: 8,
  },

  loginButton: {
    width: "100%",
    height: 53,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#FFFFFF",
    marginBottom: 18,
  },

  loginText: {
    fontFamily: "PoppinsBold",
    fontSize: 14,
    color: "#07532F",
  },

  /* ===================================================
     VENDOR
  =================================================== */

  vendorButton: {
    alignItems: "center",
    justifyContent: "center",
  },

  vendorText: {
    fontFamily: "PoppinsRegular",
    fontSize: 10,
    color: "#FFFFFF",
    marginBottom: 2,
  },

  vendorLink: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 11,
    color: "#A8D5BA",
    textDecorationLine: "underline",
  },

  /* ===================================================
     ANIMATED SPLASH SCREEN OVERLAY
  =================================================== */

  splashOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#12372C",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 48,
    paddingHorizontal: 24,
    zIndex: 999,
  },

  splashCircleTop: {
    position: "absolute",
    top: -90,
    right: -70,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(58, 130, 109, 0.22)",
  },

  splashCircleBottom: {
    position: "absolute",
    bottom: -110,
    left: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(7, 83, 47, 0.35)",
  },

  splashCenterContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  splashIconOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(58, 130, 109, 0.28)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    borderWidth: 1.5,
    borderColor: "rgba(168, 213, 186, 0.45)",
  },

  splashIconInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#3A826D",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },

  splashBrandTitle: {
    fontFamily: "PoppinsBold",
    fontSize: 38,
    color: "#FFFFFF",
    letterSpacing: 2.5,
  },

  splashBrandTagline: {
    fontFamily: "PoppinsMedium",
    fontSize: 12.5,
    color: "#D8EBDD",
    letterSpacing: 1.1,
    marginTop: 2,
  },

  splashNodePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(216, 235, 221, 0.25)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 14,
    gap: 6,
  },

  splashNodeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#4ADE80",
  },

  splashNodePillText: {
    fontFamily: "PoppinsMedium",
    fontSize: 10.5,
    color: "#E8EFEA",
  },

  splashProgressTrack: {
    width: Math.min(240, SCREEN_WIDTH * 0.62),
    height: 5,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderRadius: 4,
    overflow: "hidden",
    marginTop: 28,
  },

  splashProgressFill: {
    height: "100%",
    backgroundColor: "#4ADE80",
    borderRadius: 4,
  },

  splashLoadingSubtext: {
    fontFamily: "PoppinsRegular",
    fontSize: 10,
    color: "rgba(216, 235, 221, 0.78)",
    marginTop: 8,
  },

  splashFooter: {
    alignItems: "center",
  },

  splashFooterText: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 10,
    color: "rgba(168, 213, 186, 0.75)",
    letterSpacing: 1.4,
  },
});