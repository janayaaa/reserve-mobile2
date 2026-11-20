import { Colors } from "@/constants/color";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ExpoLocation from "expo-location";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  DeviceEventEmitter,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { WebView } from "react-native-webview";
import { api } from "../../../services/api";
import {
  ReserveAlertModal,
  ReserveModalState,
} from "../components/CebuRegistrationHelpers";
import {
  CONSUMER_LOCATION_KEY,
  ConsumerBottomNav,
  ConsumerHeader,
  useIsInsideConsumerShell,
} from "../components/ConsumerNav";

type ReviewItem = {
  id: number;
  consumer: string;
  score: number;
  comment: string;
  date: string;
};

type FoodItem = {
  id: string;
  name: string;
  description: string;
  merchantId: number;
  establishment: string;
  merchantAddress: string;
  merchantLat: number;
  merchantLng: number;
  merchantAvgRating: number;
  merchantReviewCount: number;
  avgRating: number;
  reviewCount: number;
  reviews: ReviewItem[];
  price: number;
  originalPrice: number;
  floorPrice: number;
  pricingMode?: string;
  discount: number;
  quantity: number;
  unit: string;
  expiryDate: string;
  expiryTime: string;
  storageCondition: string;
  preparationDate: string;
  image: string;
  category: string;
  distance: string;
  expiryTimestamp: number;
  shopOpenTime: string;
  shopCloseTime: string;
  shopHoursEnabled: boolean;
  isShopOpen: boolean;
};

type Establishment = {
  id: string;
  merchantId: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  avgRating: number;
  reviewCount: number;
  category: string;
  distance: string;
  image: string;
  shopOpenTime: string;
  shopCloseTime: string;
  shopHoursEnabled: boolean;
  isShopOpen: boolean;
};

type ReportTarget = {
  targetType: "listing" | "merchant";
  prodId?: string;
  foodName?: string;
  merchantId?: number;
  establishment: string;
};

const REPORT_REASONS = [
  "Inappropriate Photo / Content",
  "Prohibited Item (Cooked Meal / Raw Meat)",
  "Food Safety / Spoilage Concern",
  "Misleading Price or Stock",
  "Other Violation",
];

const CART_STORAGE_KEY = "@reserve_cart";

let cachedListingsMemory: FoodItem[] = [];
let cachedEstablishmentsMemory: Establishment[] = [];
let cachedConsumerFirstName = "Consumer";

const getStorageItem = async (key: string): Promise<string | null> => {
  if (Platform.OS === "web") return localStorage.getItem(key);
  return await SecureStore.getItemAsync(key);
};

const normalizeListingClassification = (item: any): string => {
  const produceCats = ["Leafy Greens", "Vegetables", "Fruits", "Root Crops"];
  const rawCatName = String(item.category_name || item.category || "").trim();
  if (produceCats.includes(rawCatName)) {
    return rawCatName;
  }

  const rawSec = String(item.secondary_classification || "").trim();
  if (["Plain", "Sweet", "Egg-Based"].includes(rawSec)) {
    return rawSec;
  }

  if (rawCatName === "Bread") return "Plain";
  if (rawCatName === "Pastry" || rawCatName === "Pastries") return "Sweet";
  if (rawCatName === "Cake") return "Egg-Based";
  if (["Plain", "Sweet", "Egg-Based"].includes(rawCatName)) return rawCatName;

  return rawSec || "Plain";
};

const parseTimeSlotToMinutes = (timeStr?: string): number | null => {
  if (!timeStr) return null;
  const clean = String(timeStr).trim().toUpperCase();
  const match = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const mins = parseInt(match[2], 10);
  const mer = match[3];
  if (mer === "PM" && hours < 12) hours += 12;
  if (mer === "AM" && hours === 12) hours = 0;
  return hours * 60 + mins;
};

const checkIsShopCurrentlyOpen = (
  openStr?: string,
  closeStr?: string,
  enabled = true,
  backendIsOpen?: boolean
): boolean => {
  if (typeof backendIsOpen === "boolean") return backendIsOpen;
  if (!enabled) return true;
  const openMins = parseTimeSlotToMinutes(openStr);
  const closeMins = parseTimeSlotToMinutes(closeStr);
  if (openMins === null || closeMins === null) return true;

  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();

  if (openMins <= closeMins) {
    return currentMins >= openMins && currentMins <= closeMins;
  }
  return currentMins >= openMins || currentMins <= closeMins;
};

const formatDynamicDateFallback = (offsetHours = 0) => {
  const dt = new Date(Date.now() + offsetHours * 3600 * 1000);
  const datePart = dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timePart = dt
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/\u202f/g, " ");
  return { datePart, timePart, combined: `${datePart}, ${timePart}` };
};

const parseSafeDate = (dateStr: string, timeStr?: string) => {
  try {
    let full = timeStr ? `${dateStr} ${timeStr}` : dateStr;
    full = full.replace(/,/g, "").replace(/\s+/g, " ").trim();

    const parts = full.split(" ");
    const monthIndex = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ].indexOf(parts[0]);
    const day = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);

    let hours = 0;
    let minutes = 0;

    if (parts[3]) {
      const timeParts = parts[3].split(":");
      hours = parseInt(timeParts[0], 10);
      minutes = parseInt(timeParts[1], 10);

      const fullUpper = full.toUpperCase();
      if (fullUpper.includes("PM") && hours < 12) hours += 12;
      if (fullUpper.includes("AM") && hours === 12) hours = 0;
    }

    return new Date(year, monthIndex, day, hours, minutes).getTime();
  } catch (error) {
    return new Date().getTime();
  }
};

const getLivePricingData = (
  prepDate: string,
  expDate: string,
  expTime: string,
  initialPrice: number,
  minPrice: number,
  pricingMode?: string
) => {
  const startTime = parseSafeDate(prepDate);
  const endTime = parseSafeDate(expDate, expTime);
  const now = new Date().getTime();
  const distance = endTime - now;

  if (distance <= 0) {
    return {
      timeLeft: "Time's up",
      livePrice:
        pricingMode === "fixed"
          ? initialPrice
          : minPrice > 0
          ? minPrice
          : initialPrice,
      isExpired: true,
    };
  }

  const d = Math.floor(distance / (1000 * 60 * 60 * 24));
  const h = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
  const s = Math.floor((distance % (1000 * 60)) / 1000);

  const timeLeft = d > 0 ? `${d}d ${h}h ${m}m ${s}s` : `${h}h ${m}m ${s}s`;

  if (pricingMode === "fixed") {
    return {
      timeLeft,
      livePrice: Math.round(initialPrice * 100) / 100,
      isExpired: false,
    };
  }

  const totalHours = (endTime - startTime) / (1000 * 60 * 60);
  const totalDrop = initialPrice - minPrice;
  const hourlyDropAmount = totalHours > 0 ? totalDrop / totalHours : 0;
  const hoursPassed = Math.floor((now - startTime) / (1000 * 60 * 60));

  let livePrice = initialPrice;
  if (hoursPassed > 0 && minPrice > 0 && initialPrice > minPrice) {
    livePrice = initialPrice - hourlyDropAmount * hoursPassed;
    if (livePrice < minPrice) livePrice = minPrice;
  }

  return {
    timeLeft,
    livePrice: Math.round(livePrice * 100) / 100,
    isExpired: false,
  };
};

const LiveCountdown = ({
  prepDate,
  expiryDate,
  expiryTime,
  initialPrice,
  floorPrice,
  pricingMode,
  textStyle,
}: {
  prepDate: string;
  expiryDate: string;
  expiryTime: string;
  initialPrice: number;
  floorPrice: number;
  pricingMode?: string;
  textStyle?: any;
}) => {
  const [data, setData] = useState(() =>
    getLivePricingData(
      prepDate,
      expiryDate,
      expiryTime,
      initialPrice,
      floorPrice,
      pricingMode
    )
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setData(
        getLivePricingData(
          prepDate,
          expiryDate,
          expiryTime,
          initialPrice,
          floorPrice,
          pricingMode
        )
      );
    }, 1000);

    return () => clearInterval(timer);
  }, [prepDate, expiryDate, expiryTime, initialPrice, floorPrice, pricingMode]);

  return (
    <View style={styles.timerRow}>
      <Ionicons
        name="time-outline"
        size={13}
        color={data.isExpired ? "#B3261E" : Colors.primary}
      />
      <Text
        style={[
          styles.timerText,
          data.isExpired && styles.timerExpiredText,
          textStyle,
        ]}
        numberOfLines={1}
      >
        {data.timeLeft}
      </Text>
    </View>
  );
};

export function ShopLocationMapModal({
  visible,
  shopName,
  address,
  lat,
  lng,
  onClose,
}: {
  visible: boolean;
  shopName: string;
  address: string;
  lat: number;
  lng: number;
  onClose: () => void;
}) {
  const safeLat = Number(lat) || 10.3157;
  const safeLng = Number(lng) || 123.8854;

  const [userCoords, setUserCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);

  const requestConsumerLiveLocation = useCallback(async () => {
    setLocLoading(true);
    setPermissionNotice(null);

    try {
      if (Platform.OS === "web") {
        if (typeof navigator !== "undefined" && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setUserCoords({
                lat: Number(pos.coords.latitude.toFixed(6)),
                lng: Number(pos.coords.longitude.toFixed(6)),
              });
              setLocLoading(false);
            },
            async () => {
              const saved = localStorage.getItem(CONSUMER_LOCATION_KEY);
              if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.lat && parsed.lng) {
                  setUserCoords({
                    lat: Number(parsed.lat),
                    lng: Number(parsed.lng),
                  });
                }
              }
              setPermissionNotice(
                "Browser GPS permission was denied. Showing directions from your saved Cebu City pin. Allow location access in your browser to use live GPS."
              );
              setLocLoading(false);
            },
            { enableHighAccuracy: true, timeout: 10000 }
          );
          return;
        }
      } else {
        const { status } =
          await ExpoLocation.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          const saved = await getStorageItem(CONSUMER_LOCATION_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.lat && parsed.lng) {
              setUserCoords({
                lat: Number(parsed.lat),
                lng: Number(parsed.lng),
              });
            }
          }
          setPermissionNotice(
            "GPS Location permission is required for live turn-by-turn directions. Please grant location permission."
          );
          setLocLoading(false);
          return;
        }

        const currentPos = await ExpoLocation.getCurrentPositionAsync({
          accuracy: ExpoLocation.Accuracy.High,
        });
        setUserCoords({
          lat: Number(currentPos.coords.latitude.toFixed(6)),
          lng: Number(currentPos.coords.longitude.toFixed(6)),
        });
        setLocLoading(false);
        return;
      }
    } catch (e) {
      try {
        const saved = await getStorageItem(CONSUMER_LOCATION_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.lat && parsed.lng) {
            setUserCoords({
              lat: Number(parsed.lat),
              lng: Number(parsed.lng),
            });
          }
        }
      } catch (err) {}
      setPermissionNotice(
        "Could not acquire live GPS signal. Showing route from your pinned Cebu City address."
      );
      setLocLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      requestConsumerLiveLocation();
    }
  }, [visible, requestConsumerLiveLocation]);

  const originLat = userCoords?.lat || 10.3157;
  const originLng = userCoords?.lng || 123.8854;
  const hasOrigin = Boolean(userCoords);

  const mapHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; font-family: sans-serif; -webkit-touch-callout: none; }
        .route-badge {
          position: absolute;
          top: 10px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 1000;
          background: #12372C;
          color: #FFFFFF;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25);
          white-space: nowrap;
        }
      </style>
    </head>
    <body>
      <div id="routeInfo" class="route-badge">Calculating live route...</div>
      <div id="map"></div>
      <script>
        var shopLat = ${safeLat};
        var shopLng = ${safeLng};
        var userLat = ${originLat};
        var userLng = ${originLng};
        var hasUser = ${hasOrigin ? "true" : "false"};

        var map = L.map('map', { zoomControl: true, tap: false }).setView([shopLat, shopLng], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap'
        }).addTo(map);

        var shopIcon = L.divIcon({
          html: '<div style="background:#1B4D3E;color:#fff;width:30px;height:30px;border-radius:15px;display:flex;align-items:center;justify-content:center;font-weight:bold;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">🏪</div>',
          className: '',
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        });

        var userIcon = L.divIcon({
          html: '<div style="background:#2563EB;color:#fff;width:28px;height:28px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-weight:bold;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">📍</div>',
          className: '',
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });

        var shopMarker = L.marker([shopLat, shopLng], { icon: shopIcon }).addTo(map);
        shopMarker.bindPopup("<b>${shopName.replace(/"/g, "")}</b><br>${address.replace(
    /"/g,
    ""
  )}");

        function haversineKm(lat1, lon1, lat2, lon2) {
          var R = 6371;
          var dLat = (lat2 - lat1) * Math.PI / 180;
          var dLon = (lon2 - lon1) * Math.PI / 180;
          var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        }

        if (hasUser) {
          var userMarker = L.marker([userLat, userLng], { icon: userIcon }).addTo(map);
          userMarker.bindPopup("<b>Your Location</b>");

          var osrmUrl = "https://router.project-osrm.org/route/v1/driving/" +
            userLng + "," + userLat + ";" + shopLng + "," + shopLat +
            "?overview=full&geometries=geojson";

          fetch(osrmUrl)
            .then(function(r) { return r.json(); })
            .then(function(data) {
              if (data && data.routes && data.routes.length > 0) {
                var route = data.routes[0];
                var distKm = (route.distance / 1000).toFixed(1);
                var mins = Math.max(1, Math.round(route.duration / 60));
                document.getElementById('routeInfo').innerText =
                  "Live Route: " + distKm + " km • ~" + mins + " min drive";

                var routeLine = L.geoJSON(route.geometry, {
                  style: { color: '#1B4D3E', weight: 5, opacity: 0.85 }
                }).addTo(map);
                map.fitBounds(routeLine.getBounds(), { padding: [36, 36] });
              } else {
                throw new Error("No OSRM route");
              }
            })
            .catch(function() {
              var directKm = haversineKm(userLat, userLng, shopLat, shopLng).toFixed(1);
              document.getElementById('routeInfo').innerText =
                "Direct Distance: " + directKm + " km from your location";
              var line = L.polyline([[userLat, userLng], [shopLat, shopLng]], {
                color: '#1B4D3E', weight: 4, dashArray: '6, 8'
              }).addTo(map);
              map.fitBounds(line.getBounds(), { padding: [40, 40] });
            });
        } else {
          document.getElementById('routeInfo').innerText = "Waiting for GPS permission...";
          shopMarker.openPopup();
        }
      </script>
    </body>
    </html>
  `;

  const openExternalDirections = () => {
    const originParam = userCoords
      ? `&origin=${userCoords.lat},${userCoords.lng}`
      : "";
    const googleDirectionsUrl = `https://www.google.com/maps/dir/?api=1${originParam}&destination=${safeLat},${safeLng}&travelmode=driving`;
    const iosDirectionsUrl = userCoords
      ? `maps://?saddr=${userCoords.lat},${userCoords.lng}&daddr=${safeLat},${safeLng}&dirflg=d`
      : `maps:0,0?q=${encodeURIComponent(shopName)}@${safeLat},${safeLng}`;

    if (Platform.OS === "web") {
      window.open(googleDirectionsUrl, "_blank");
    } else if (Platform.OS === "ios") {
      Linking.openURL(iosDirectionsUrl).catch(() =>
        Linking.openURL(googleDirectionsUrl)
      );
    } else {
      Linking.openURL(googleDirectionsUrl);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                Directions to {shopName}
              </Text>
              <Text
                style={{
                  fontFamily: "PoppinsRegular",
                  fontSize: 10,
                  color: Colors.primary1,
                }}
                numberOfLines={1}
              >
                {address} ({safeLat.toFixed(4)}° N, {safeLng.toFixed(4)}° E)
              </Text>
            </View>
            <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
              <Ionicons name="close" size={18} color={Colors.primary2} />
            </TouchableOpacity>
          </View>

          {permissionNotice && (
            <View
              style={{
                backgroundColor: "#FEF3C7",
                paddingHorizontal: 14,
                paddingVertical: 8,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <Text
                style={{
                  flex: 1,
                  fontFamily: "PoppinsMedium",
                  fontSize: 10,
                  color: "#B45309",
                }}
              >
                {permissionNotice}
              </Text>
              <TouchableOpacity
                style={{
                  backgroundColor: Colors.primary,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 6,
                }}
                onPress={requestConsumerLiveLocation}
              >
                <Text
                  style={{
                    fontFamily: "PoppinsSemiBold",
                    fontSize: 9.5,
                    color: Colors.white,
                  }}
                >
                  Allow GPS
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View
            style={{ height: 300, width: "100%", backgroundColor: "#E8EFEA" }}
          >
            {locLoading ? (
              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text
                  style={{
                    fontFamily: "PoppinsMedium",
                    fontSize: 11,
                    color: Colors.primary2,
                  }}
                >
                  Requesting GPS location &amp; building route...
                </Text>
              </View>
            ) : Platform.OS === "web" ? (
              React.createElement("iframe", {
                srcDoc: mapHtml,
                style: { width: "100%", height: "100%", border: "none" },
                title: "Shop Live Directions Map",
              })
            ) : (
              <WebView
                originWhitelist={["*"]}
                source={{ html: mapHtml }}
                style={{ flex: 1 }}
                scrollEnabled={false}
                bounces={false}
                javaScriptEnabled={true}
                domStorageEnabled={true}
              />
            )}
          </View>

          <View style={{ padding: 14, flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              style={[
                styles.addToCartButton,
                { flex: 1, marginTop: 0, backgroundColor: Colors.primary },
              ]}
              onPress={openExternalDirections}
            >
              <Ionicons
                name="navigate-outline"
                size={16}
                color={Colors.white}
              />
              <Text style={styles.addToCartText}>
                Start Turn-by-Turn Navigation
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.addToCartButton,
                {
                  flex: 0.38,
                  marginTop: 0,
                  backgroundColor: Colors.input,
                  borderWidth: 1,
                  borderColor: Colors.border,
                },
              ]}
              onPress={onClose}
            >
              <Text style={[styles.addToCartText, { color: Colors.primary2 }]}>
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function Homepage() {
  const isInsideShell = useIsInsideConsumerShell();
  if (!isInsideShell) return null;

  const [consumerName, setConsumerName] = useState(cachedConsumerFirstName);
  const [searchText, setSearchText] = useState("");
  const [onlyOpenStores, setOnlyOpenStores] = useState(false);
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [refreshing, setRefreshing] = useState(false);

  const [liveListings, setLiveListings] =
    useState<FoodItem[]>(cachedListingsMemory);
  const [dynamicEstablishments, setDynamicEstablishments] = useState<
    Establishment[]
  >(cachedEstablishmentsMemory);
  const [loading, setLoading] = useState(cachedListingsMemory.length === 0);
  const [modalLivePrice, setModalLivePrice] = useState(0);

  const [selectedMerchant, setSelectedMerchant] =
    useState<Establishment | null>(null);
  const [mapModalTarget, setMapModalTarget] = useState<{
    name: string;
    address: string;
    lat: number;
    lng: number;
  } | null>(null);

  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [reportReason, setReportReason] = useState<string>(REPORT_REASONS[0]);
  const [reportDetails, setReportDetails] = useState<string>("");
  const [submittingReport, setSubmittingReport] = useState<boolean>(false);

  const [modalAlert, setModalAlert] = useState<ReserveModalState>({
    visible: false,
    title: "",
    message: "",
    type: "info",
  });

  const showModal = (
    title: string,
    message: string,
    type: "success" | "error" | "info" | "warning" = "info"
  ) => setModalAlert({ visible: true, title, message, type });

  const openReportModal = (target: ReportTarget) => {
    setSelectedFood(null);
    setSelectedMerchant(null);
    setReportReason(REPORT_REASONS[0]);
    setReportDetails("");
    setReportTarget(target);
  };

  const handleSubmitConsumerReport = async () => {
    if (!reportTarget) return;
    setSubmittingReport(true);
    try {
      const storedId = (await getStorageItem("profile_id")) || "0";
      const storedEmail = (await getStorageItem("user_email")) || "";

      const res = await api.post(`listings/consumer-portal/${storedId}/`, {
        action: "submit_report",
        email: storedEmail,
        target_type: reportTarget.targetType,
        prod_id: reportTarget.prodId || null,
        food_name: reportTarget.foodName || "",
        merchant_id: reportTarget.merchantId || null,
        establishment: reportTarget.establishment,
        reason: reportReason,
        details: reportDetails.trim(),
      });

      setReportTarget(null);
      setReportDetails("");
      showModal(
        "Report Submitted",
        res.data?.message ||
          "Thank you! ReServe Admin and the merchant have been notified for immediate compliance review.",
        "success"
      );
    } catch (error: any) {
      showModal(
        "Report Failed",
        error?.response?.data?.error ||
          "Could not submit your report right now. Please try again.",
        "error"
      );
    } finally {
      setSubmittingReport(false);
    }
  };

  useEffect(() => {
    loadConsumerIdentity();
    fetchMarketplaceListings();

    const locListener = DeviceEventEmitter.addListener(
      "app_location_updated",
      () => {
        fetchMarketplaceListings();
      }
    );
    const profListener = DeviceEventEmitter.addListener(
      "consumer_profile_updated",
      () => {
        loadConsumerIdentity();
      }
    );
    const claimsListener = DeviceEventEmitter.addListener(
      "consumer_claims_updated",
      () => {
        fetchMarketplaceListings();
      }
    );

    return () => {
      locListener.remove();
      profListener.remove();
      claimsListener.remove();
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadConsumerIdentity(), fetchMarketplaceListings()]);
    setRefreshing(false);
  };

  const loadConsumerIdentity = async () => {
    try {
      const storedName = await getStorageItem("entity_name");
      const storedId = await getStorageItem("profile_id");
      const storedEmail = (await getStorageItem("user_email")) || "";

      if (!storedId && !storedEmail) {
        router.replace("/consumer");
        return;
      }

      if (storedName) {
        const first = storedName.split(" ")[0];
        cachedConsumerFirstName = first;
        setConsumerName(first);
      }

      const resolvedId = storedId || "0";
      const res = await api.get(
        `listings/consumer-portal/${resolvedId}/?email=${encodeURIComponent(
          storedEmail
        )}`
      );
      if (res.data?.profile?.full_name) {
        const first = res.data.profile.full_name.split(" ")[0];
        cachedConsumerFirstName = first;
        setConsumerName(first);
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (!selectedFood) return;
    const interval = setInterval(() => {
      const res = getLivePricingData(
        selectedFood.preparationDate,
        selectedFood.expiryDate,
        selectedFood.expiryTime,
        selectedFood.price,
        selectedFood.floorPrice,
        selectedFood.pricingMode
      );
      setModalLivePrice(res.livePrice);
    }, 1000);
    return () => clearInterval(interval);
  }, [selectedFood]);

  const fetchMarketplaceListings = async () => {
    try {
      if (cachedListingsMemory.length === 0) setLoading(true);
      const storedId = (await getStorageItem("profile_id")) || "0";
      const storedEmail = (await getStorageItem("user_email")) || "";
      const response = await api.get(
        `listings/?consumer=${storedId}&email=${encodeURIComponent(
          storedEmail
        )}`
      );

      const fallbackPrep = formatDynamicDateFallback(-2);
      const fallbackExp = formatDynamicDateFallback(24);
      const nowMs = Date.now();

      const formatted: FoodItem[] = (
        Array.isArray(response.data) ? response.data : []
      )
        .filter((item: any) => {
          const qty = Number(item.qty_available ?? item.quantity ?? 0);
          const st = String(item.status || "Active").trim();
          if (qty <= 0 || st !== "Active") return false;

          const expDateStr = item.expiry_date || fallbackExp.datePart;
          const expTimeStr = item.expiry_time || fallbackExp.timePart;
          const expTs = parseSafeDate(expDateStr, expTimeStr);
          return expTs - nowMs > 1800 * 1000;
        })
        .map((item: any, index: number) => {
          const orig = Number(item.original_price || item.orig_price || 0);
          const current = Number(item.price || item.discounted_price || 0);
          const floor = Number(item.floor_price || 0);
          const expDateStr = item.expiry_date || fallbackExp.datePart;
          const expTimeStr = item.expiry_time || fallbackExp.timePart;

          const openTime = String(
            item.shop_open_time || item.shopOpenTime || "08:00 AM"
          );
          const closeTime = String(
            item.shop_close_time || item.shopCloseTime || "08:00 PM"
          );
          const hoursEnabled =
            item.shop_hours_enabled !== undefined
              ? Boolean(item.shop_hours_enabled)
              : item.shopHoursEnabled !== undefined
              ? Boolean(item.shopHoursEnabled)
              : true;

          const hasExplicitHours = Boolean(
            item.shop_open_time ||
              item.shopOpenTime ||
              item.is_shop_open !== undefined
          );
          const shopOpenNow = hasExplicitHours
            ? checkIsShopCurrentlyOpen(
                openTime,
                closeTime,
                hoursEnabled,
                item.is_shop_open
              )
            : true;

          const recordedTemp = Number(
            item.posted_temp || item.temperature || 0
          );
          const rawStorage = String(item.storage_condition || "");
          const storageLabel = rawStorage.toLowerCase().includes("chilled")
            ? "Chilled (4°C)"
            : recordedTemp > 0 && recordedTemp !== 4
            ? `Ambient (${recordedTemp.toFixed(1)}°C)`
            : rawStorage || "Ambient";

          return {
            id: String(item.prod_id || item.id || `fallback-${index}`),
            name: item.prod_name || "Surplus Item",
            description:
              item.prod_desc ||
              "Fresh surplus food item available for rescue.",
            merchantId: Number(item.merchant_id || item.merchant || 0),
            establishment: item.merchant_name || "Partner Merchant",
            merchantAddress: item.merchant_address || "Cebu City, Philippines",
            merchantLat: Number(item.merchant_lat || 10.3157),
            merchantLng: Number(item.merchant_lng || 123.8854),
            merchantAvgRating: Number(item.merchant_avg_rating || 0),
            merchantReviewCount: Number(item.merchant_review_count || 0),
            avgRating: Number(item.avg_rating || 0),
            reviewCount: Number(item.review_count || 0),
            reviews: Array.isArray(item.reviews) ? item.reviews : [],
            price: current,
            originalPrice: orig > 0 ? orig : current,
            floorPrice: floor,
            pricingMode: item.pricing_mode || "fixed",
            discount: 0,
            quantity: Number(item.qty_available ?? item.quantity ?? 0),
            unit: item.unit_name || "pcs",
            preparationDate:
              item.safely_anchor_time ||
              item.preparation_date ||
              fallbackPrep.combined,
            expiryDate: expDateStr,
            expiryTime: expTimeStr,
            storageCondition: storageLabel,
            image:
              item.image_path ||
              "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=700&q=80",
            category: normalizeListingClassification(item),
            distance: item.distance || "Within Cebu City",
            expiryTimestamp: parseSafeDate(expDateStr, expTimeStr),
            shopOpenTime: openTime,
            shopCloseTime: closeTime,
            shopHoursEnabled: hoursEnabled,
            isShopOpen: shopOpenNow,
          };
        });

      formatted.sort(
        (a: FoodItem, b: FoodItem) => a.expiryTimestamp - b.expiryTimestamp
      );
      cachedListingsMemory = formatted;
      setLiveListings(formatted);

      const estMap = new Map<string, Establishment>();
      formatted.forEach((f, idx) => {
        if (!estMap.has(f.establishment)) {
          estMap.set(f.establishment, {
            id: `EST-${idx}`,
            merchantId: f.merchantId,
            name: f.establishment,
            address: f.merchantAddress,
            lat: f.merchantLat,
            lng: f.merchantLng,
            avgRating: f.merchantAvgRating,
            reviewCount: f.merchantReviewCount,
            category: f.category,
            distance: f.distance,
            image: f.image,
            shopOpenTime: f.shopOpenTime,
            shopCloseTime: f.shopCloseTime,
            shopHoursEnabled: f.shopHoursEnabled,
            isShopOpen: f.isShopOpen,
          });
        }
      });
      const estArr = Array.from(estMap.values());
      cachedEstablishmentsMemory = estArr;
      setDynamicEstablishments(estArr);
    } catch (error) {
      console.log("Error fetching marketplace listings:", error);
    } finally {
      setLoading(false);
    }
  };

  const addToCart = async (food: FoodItem, qty: number) => {
    try {
      const storedCart = await AsyncStorage.getItem(CART_STORAGE_KEY);
      let cart = storedCart ? JSON.parse(storedCart) : [];

      const existingIndex = cart.findIndex((item: any) => item.id === food.id);
      const finalCartPrice = modalLivePrice > 0 ? modalLivePrice : food.price;

      if (existingIndex !== -1) {
        cart[existingIndex].quantity = Math.min(
          food.quantity,
          cart[existingIndex].quantity + qty
        );
        cart[existingIndex].price = finalCartPrice;
        cart[existingIndex].originalPrice = food.originalPrice;
        cart[existingIndex].floorPrice = food.floorPrice;
        cart[existingIndex].pricingMode = food.pricingMode;
      } else {
        cart.push({
          ...food,
          price: finalCartPrice,
          maxStock: food.quantity,
          quantity: qty,
        });
      }

      await AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
      DeviceEventEmitter.emit("consumer_cart_updated");

      setSelectedFood(null);
      setQuantity(1);

      const lineTotal = finalCartPrice * qty;
      const dep20 = Math.round(lineTotal * 0.2 * 100) / 100;
      const cash80 = Math.max(0, Math.round((lineTotal - dep20) * 100) / 100);

      showModal(
        "Added to Rescue Cart!",
        `${food.name} (${qty}x) added to your Rescue Cart.\n• 20% Online Deposit: ₱${dep20.toFixed(
          2
        )}\n• 80% Cash at Pickup: ₱${cash80.toFixed(2)}`,
        "success"
      );
    } catch (error) {
      console.log("Error adding to cart:", error);
    }
  };

  const searchFilter = (items: FoodItem[]) => {
    return items.filter((item) => {
      if (onlyOpenStores && !item.isShopOpen) return false;
      if (!searchText.trim()) return true;
      const search = searchText.toLowerCase();
      return (
        item.name.toLowerCase().includes(search) ||
        item.establishment.toLowerCase().includes(search) ||
        item.category.toLowerCase().includes(search)
      );
    });
  };

  const filteredListings = searchFilter(liveListings);
  const filteredEstablishments = dynamicEstablishments.filter((est) =>
    onlyOpenStores ? est.isShopOpen : true
  );

  const openFood = (food: FoodItem) => {
    setSelectedFood(food);
    setQuantity(1);
    const initialCalc = getLivePricingData(
      food.preparationDate,
      food.expiryDate,
      food.expiryTime,
      food.price,
      food.floorPrice,
      food.pricingMode
    );
    setModalLivePrice(initialCalc.livePrice);
  };

  const openMerchantStorefront = (est: Establishment) => {
    setSelectedMerchant(est);
  };

  const FoodCard = ({
    item,
    horizontal = false,
  }: {
    item: FoodItem;
    horizontal?: boolean;
  }) => {
    const cardCalc = getLivePricingData(
      item.preparationDate,
      item.expiryDate,
      item.expiryTime,
      item.price,
      item.floorPrice,
      item.pricingMode
    );

    if (cardCalc.isExpired) return null;

    const deposit20 = Math.round(cardCalc.livePrice * 0.2 * 100) / 100;

    return (
      <TouchableOpacity
        activeOpacity={0.88}
        style={[
          horizontal ? styles.featuredCard : styles.foodCard,
          !item.isShopOpen && { opacity: 0.85 },
        ]}
        onPress={() => openFood(item)}
      >
        <View
          style={
            horizontal
              ? styles.featuredImageContainer
              : styles.foodImageContainer
          }
        >
          <Image
            source={{ uri: item.image }}
            style={horizontal ? styles.featuredImage : styles.foodImage}
          />
          <View
            style={[
              styles.shopHoursCornerBadge,
              !item.isShopOpen && { backgroundColor: "rgba(179,38,30,0.9)" },
            ]}
          >
            <Text style={styles.shopHoursCornerText}>
              {item.isShopOpen
                ? "20% Deposit"
                : `Opens ${item.shopOpenTime}`}
            </Text>
          </View>
        </View>

        <View
          style={horizontal ? styles.featuredContent : styles.foodCardContent}
        >
          <Text style={styles.foodName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.establishmentName} numberOfLines={1}>
            {item.establishment} • {item.shopOpenTime}–{item.shopCloseTime}
          </Text>

          <View style={styles.priceRow}>
            <Text style={styles.foodPrice}>
              ₱{cardCalc.livePrice.toFixed(2)}
            </Text>
            {item.originalPrice > cardCalc.livePrice && (
              <Text style={styles.originalPrice}>
                ₱{item.originalPrice.toFixed(2)}
              </Text>
            )}
          </View>

          <Text style={styles.depositBreakdownMini} numberOfLines={1}>
            20% Online: ₱{deposit20.toFixed(2)} • 80% Cash
          </Text>

          <View style={styles.detailsMetaRow}>
            <LiveCountdown
              prepDate={item.preparationDate}
              expiryDate={item.expiryDate}
              expiryTime={item.expiryTime}
              initialPrice={item.price}
              floorPrice={item.floorPrice}
              pricingMode={item.pricingMode}
            />
          </View>

          <View style={styles.expiry}>
            <Ionicons name="calendar-outline" size={12} color={"#A94A3A"} />
            <Text style={styles.explicitExpiryText} numberOfLines={1}>
              Exp: {item.expiryDate} • {item.expiryTime}
            </Text>
          </View>

          <View style={styles.foodBottomRow}>
            <View style={styles.distanceRow}>
              <Ionicons name="location-outline" size={12} color={Colors.icon} />
              <Text style={styles.distanceText}>{item.distance}</Text>
            </View>
            <Text style={styles.availableText}>{item.quantity} left</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const EstablishmentCard = ({ item }: { item: Establishment }) => {
    const stars = "⭐".repeat(
      item.reviewCount > 0 ? Math.max(1, Math.round(item.avgRating)) : 5
    );
    return (
      <TouchableOpacity
        activeOpacity={0.88}
        style={styles.establishmentCard}
        onPress={() => openMerchantStorefront(item)}
      >
        <Image source={{ uri: item.image }} style={styles.establishmentImage} />
        <View style={styles.establishmentInfo}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 6,
            }}
          >
            <Text
              style={[styles.establishmentNameLarge, { flex: 1 }]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            <View
              style={[
                styles.storeStatusPill,
                !item.isShopOpen && styles.storeStatusPillClosed,
              ]}
            >
              <Text
                style={[
                  styles.storeStatusPillText,
                  !item.isShopOpen && { color: "#B3261E" },
                ]}
              >
                {item.isShopOpen
                  ? `Open • ${item.shopOpenTime}–${item.shopCloseTime}`
                  : `Closed • Opens ${item.shopOpenTime}`}
              </Text>
            </View>
          </View>
          <Text style={styles.ratingInlineText}>
            {stars} ({item.reviewCount}) • {item.category}
          </Text>
          <View style={styles.distanceRow}>
            <Ionicons name="location-outline" size={12} color={Colors.icon} />
            <Text style={styles.distanceText} numberOfLines={1}>
              {item.distance} away • Tap to view shop &amp; live route
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.icon} />
      </TouchableOpacity>
    );
  };

  const getMerchantMapHtml = (est: Establishment) => {
    const safeLat = Number(est.lat) || 10.3157;
    const safeLng = Number(est.lng) || 123.8854;
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; -webkit-touch-callout: none; }</style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', { zoomControl: true, tap: false }).setView([${safeLat}, ${safeLng}], 16);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
          }).addTo(map);
          var marker = L.marker([${safeLat}, ${safeLng}]).addTo(map);
          marker.bindPopup("<b>${est.name.replace(/"/g, "")}</b><br>${est.address.replace(
      /"/g,
      ""
    )}").openPopup();
        </script>
      </body>
      </html>
    `;
  };

  const activeModalUnitPrice = selectedFood
    ? modalLivePrice > 0
      ? modalLivePrice
      : selectedFood.price
    : 0;
  const activeModalTotal =
    Math.round(activeModalUnitPrice * quantity * 100) / 100;
  const activeModalDeposit20 = Math.round(activeModalTotal * 0.2 * 100) / 100;
  const activeModalCash80 = Math.max(
    0,
    Math.round((activeModalTotal - activeModalDeposit20) * 100) / 100
  );

  return (
    <View style={styles.container}>
      <ConsumerHeader />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeText}>Welcome, {consumerName}!</Text>
          <Text style={styles.welcomeSubtext}>
            Reserve surplus food with a 20% online commitment fee and pay the
            remaining 80% in cash upon pickup.
          </Text>
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color={Colors.icon} />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search food or establishments"
            placeholderTextColor={Colors.placeholder}
            style={styles.searchInput}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText("")}>
              <Ionicons name="close-circle" size={18} color={Colors.icon} />
            </TouchableOpacity>
          )}
        </View>

        {/* OPERATING HOURS FILTER BAR */}
        <View style={styles.hoursFilterRow}>
          <TouchableOpacity
            style={[
              styles.hoursFilterChip,
              !onlyOpenStores && styles.hoursFilterChipActive,
            ]}
            activeOpacity={0.8}
            onPress={() => setOnlyOpenStores(false)}
          >
            <Ionicons
              name="storefront-outline"
              size={13}
              color={!onlyOpenStores ? Colors.white : Colors.primary2}
            />
            <Text
              style={[
                styles.hoursFilterChipText,
                !onlyOpenStores && { color: Colors.white },
              ]}
            >
              All Partner Stores ({liveListings.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.hoursFilterChip,
              onlyOpenStores && styles.hoursFilterChipActive,
            ]}
            activeOpacity={0.8}
            onPress={() => setOnlyOpenStores(true)}
          >
            <Ionicons
              name="time-outline"
              size={13}
              color={onlyOpenStores ? Colors.white : Colors.primary}
            />
            <Text
              style={[
                styles.hoursFilterChipText,
                onlyOpenStores && { color: Colors.white },
              ]}
            >
              Open Now Only
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Featured Rescues</Text>
          </View>
        </View>

        {filteredListings.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.featuredScroll}
          >
            {filteredListings.map((item, index) => (
              <FoodCard key={item.id || index} item={item} horizontal />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.emptySearch}>
            <Ionicons name="search-outline" size={24} color={Colors.icon} />
            <Text style={styles.emptySearchText}>
              {loading ? "Loading listings..." : "No active listings found."}
            </Text>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Recommended for You</Text>
          </View>
        </View>

        {filteredListings.length > 0 ? (
          <View style={styles.foodGrid}>
            {filteredListings.map((item, index) => (
              <FoodCard key={item.id || index} item={item} />
            ))}
          </View>
        ) : (
          <View style={styles.emptySearch}>
            <Ionicons name="search-outline" size={24} color={Colors.icon} />
            <Text style={styles.emptySearchText}>
              {loading
                ? "Loading recommendations..."
                : "No recommendations found."}
            </Text>
          </View>
        )}

        {filteredEstablishments.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Partner Establishments</Text>
                <Text style={styles.sectionSubtitle}>
                  Tap a store to view its operating hours, rating, active
                  listings &amp; live GPS directions.
                </Text>
              </View>
            </View>

            <View style={styles.establishmentList}>
              {filteredEstablishments.map((item) => (
                <EstablishmentCard key={item.id} item={item} />
              ))}
            </View>
          </>
        )}
        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* FOOD DETAIL MODAL */}
      <Modal
        visible={selectedFood !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedFood(null)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setSelectedFood(null)}
          />
          <View style={styles.modalSheet}>
            {selectedFood && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Food Listing Details</Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <TouchableOpacity
                      style={styles.reportHeaderBtn}
                      onPress={() =>
                        openReportModal({
                          targetType: "listing",
                          prodId: selectedFood.id,
                          foodName: selectedFood.name,
                          merchantId: selectedFood.merchantId,
                          establishment: selectedFood.establishment,
                        })
                      }
                    >
                      <Ionicons name="flag-outline" size={13} color="#B3261E" />
                      <Text style={styles.reportHeaderBtnText}>Report</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.modalCloseButton}
                      onPress={() => setSelectedFood(null)}
                    >
                      <Ionicons
                        name="close"
                        size={20}
                        color={Colors.primary2}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={[
                    styles.modalScroll,
                    { paddingBottom: 150 },
                  ]}
                >
                  <Image
                    source={{ uri: selectedFood.image }}
                    style={styles.modalFoodImage}
                  />

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: 12,
                    }}
                  >
                    <View
                      style={[
                        styles.modalDiscountBadge,
                        {
                          marginTop: 0,
                          backgroundColor: "#E8EFEA",
                          borderWidth: 1,
                          borderColor: Colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.discountText,
                          { color: Colors.primary2 },
                        ]}
                      >
                        {selectedFood.category}
                      </Text>
                    </View>
                    <Text style={styles.ratingInlineText}>
                      {"⭐".repeat(
                        selectedFood.reviewCount > 0
                          ? Math.max(1, Math.round(selectedFood.avgRating))
                          : 5
                      )}{" "}
                      ({selectedFood.reviewCount}{" "}
                      {selectedFood.reviewCount === 1 ? "review" : "reviews"})
                    </Text>
                  </View>

                  <Text style={styles.modalFoodName}>{selectedFood.name}</Text>

                  <Text
                    style={{
                      fontFamily: "PoppinsRegular",
                      fontSize: 11,
                      color: Colors.primary1,
                      lineHeight: 17,
                    }}
                  >
                    {selectedFood.description}
                  </Text>

                  <View style={styles.modalPriceBox}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalPriceLabel}>
                        Live Rescue Price (20% Online Deposit • 80% Cash Pickup)
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "baseline",
                          gap: 8,
                          marginTop: 2,
                        }}
                      >
                        <Text style={styles.modalPrice}>
                          ₱{activeModalUnitPrice.toFixed(2)}
                        </Text>
                        {selectedFood.originalPrice > activeModalUnitPrice && (
                          <Text style={styles.modalOriginalPrice}>
                            ₱{selectedFood.originalPrice.toFixed(2)}
                          </Text>
                        )}
                      </View>
                      <Text
                        style={{
                          fontFamily: "PoppinsSemiBold",
                          fontSize: 10.5,
                          color: Colors.primary2,
                          marginTop: 4,
                        }}
                      >
                        • 20% Online Commitment Fee ({quantity}x): ₱
                        {activeModalDeposit20.toFixed(2)}
                      </Text>
                      <Text
                        style={{
                          fontFamily: "PoppinsMedium",
                          fontSize: 10.5,
                          color: "#B45309",
                          marginTop: 1,
                        }}
                      >
                        • 80% Cash Due at Pickup ({quantity}x): ₱
                        {activeModalCash80.toFixed(2)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.modalTimerBox}>
                    <View style={{ marginLeft: 10, flex: 1 }}>
                      <LiveCountdown
                        prepDate={selectedFood.preparationDate}
                        expiryDate={selectedFood.expiryDate}
                        expiryTime={selectedFood.expiryTime}
                        initialPrice={selectedFood.price}
                        floorPrice={selectedFood.floorPrice}
                        pricingMode={selectedFood.pricingMode}
                        textStyle={{ fontSize: 16, fontFamily: "PoppinsBold" }}
                      />
                      <Text style={styles.modalTimerLabel}>
                        Exp: {selectedFood.expiryDate} •{" "}
                        {selectedFood.expiryTime}
                      </Text>
                      <Text style={styles.modalStorageText}>
                        Prepared: {selectedFood.preparationDate} • Storage:{" "}
                        {selectedFood.storageCondition}
                      </Text>
                    </View>
                  </View>

                  {selectedFood.reviews && selectedFood.reviews.length > 0 && (
                    <View style={{ marginTop: 14 }}>
                      <Text style={styles.quantityLabel}>
                        Customer Reviews ({selectedFood.reviews.length})
                      </Text>
                      {selectedFood.reviews.slice(0, 3).map((rev) => (
                        <View
                          key={rev.id}
                          style={{
                            backgroundColor: Colors.input,
                            padding: 10,
                            borderRadius: 10,
                            marginBottom: 6,
                            borderWidth: 1,
                            borderColor: Colors.border,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: "PoppinsSemiBold",
                                fontSize: 10.5,
                                color: Colors.primary2,
                              }}
                            >
                              {rev.consumer} • {"⭐".repeat(rev.score)}
                            </Text>
                            <Text
                              style={{
                                fontFamily: "PoppinsRegular",
                                fontSize: 9.5,
                                color: Colors.icon,
                              }}
                            >
                              {rev.date}
                            </Text>
                          </View>
                          {rev.comment ? (
                            <Text
                              style={{
                                fontFamily: "PoppinsRegular",
                                fontSize: 10.5,
                                color: Colors.primary1,
                                marginTop: 2,
                              }}
                            >
                              &quot;{rev.comment}&quot;
                            </Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={styles.merchantBannerRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalEstablishment}>
                        {selectedFood.establishment} •{" "}
                        {"⭐".repeat(
                          selectedFood.merchantReviewCount > 0
                            ? Math.max(
                                1,
                                Math.round(selectedFood.merchantAvgRating)
                              )
                            : 5
                        )}{" "}
                        ({selectedFood.merchantReviewCount})
                      </Text>
                      <Text
                        style={{
                          fontFamily: "PoppinsMedium",
                          fontSize: 10,
                          color: selectedFood.isShopOpen
                            ? Colors.primary
                            : "#B3261E",
                          marginTop: 1,
                        }}
                      >
                        Shop Hours: {selectedFood.shopOpenTime} –{" "}
                        {selectedFood.shopCloseTime} (
                        {selectedFood.isShopOpen ? "Open" : "After Hours"})
                      </Text>
                      <Text
                        style={{
                          fontFamily: "PoppinsRegular",
                          fontSize: 10,
                          color: Colors.icon,
                        }}
                      >
                        {selectedFood.distance}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.showMapBtn}
                      onPress={() =>
                        setMapModalTarget({
                          name: selectedFood.establishment,
                          address: selectedFood.merchantAddress,
                          lat: selectedFood.merchantLat,
                          lng: selectedFood.merchantLng,
                        })
                      }
                    >
                      <Ionicons
                        name="navigate-outline"
                        size={14}
                        color={Colors.primary}
                      />
                      <Text style={styles.showMapBtnText}>
                        Show Shop in Maps
                      </Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>

                <View style={styles.stickyActionBar}>
                  <View style={styles.quantityRow}>
                    <Text style={styles.quantityLabel}>
                      Quantity ({selectedFood.quantity} {selectedFood.unit}{" "}
                      available)
                    </Text>
                    <View style={styles.quantitySelector}>
                      <TouchableOpacity
                        style={styles.quantityButton}
                        onPress={() =>
                          setQuantity((prev) => Math.max(1, prev - 1))
                        }
                      >
                        <Ionicons
                          name="remove"
                          size={16}
                          color={Colors.primary}
                        />
                      </TouchableOpacity>
                      <Text style={styles.quantityText}>{quantity}</Text>
                      <TouchableOpacity
                        style={styles.quantityButton}
                        onPress={() =>
                          setQuantity((prev) =>
                            Math.min(selectedFood.quantity, prev + 1)
                          )
                        }
                      >
                        <Ionicons name="add" size={16} color={Colors.primary} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.addToCartButton}
                    onPress={() => addToCart(selectedFood, quantity)}
                  >
                    <Ionicons
                      name="cart-outline"
                      size={18}
                      color={Colors.white}
                    />
                    <Text style={styles.addToCartText}>
                      Add to Rescue Cart (20% Deposit: ₱
                      {activeModalDeposit20.toFixed(2)})
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* PARTNER ESTABLISHMENT STOREFRONT & MAP MODAL */}
      <Modal
        visible={selectedMerchant !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedMerchant(null)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setSelectedMerchant(null)}
          />
          <View style={styles.modalSheet}>
            {selectedMerchant && (
              <>
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle} numberOfLines={1}>
                      {selectedMerchant.name}
                    </Text>
                    <Text
                      style={{
                        fontFamily: "PoppinsRegular",
                        fontSize: 10,
                        color: Colors.primary1,
                      }}
                      numberOfLines={1}
                    >
                      {selectedMerchant.address} • {selectedMerchant.distance}{" "}
                      away
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <TouchableOpacity
                      style={styles.reportHeaderBtn}
                      onPress={() =>
                        openReportModal({
                          targetType: "merchant",
                          merchantId: selectedMerchant.merchantId,
                          establishment: selectedMerchant.name,
                        })
                      }
                    >
                      <Ionicons name="flag-outline" size={13} color="#B3261E" />
                      <Text style={styles.reportHeaderBtnText}>
                        Report Store
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.modalCloseButton}
                      onPress={() => setSelectedMerchant(null)}
                    >
                      <Ionicons
                        name="close"
                        size={20}
                        color={Colors.primary2}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={[
                    styles.modalScroll,
                    { paddingBottom: 40 },
                  ]}
                >
                  <View style={styles.merchantProfileHeaderCard}>
                    <Image
                      source={{ uri: selectedMerchant.image }}
                      style={{ width: 64, height: 64, borderRadius: 12 }}
                    />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.establishmentNameLarge}>
                        {selectedMerchant.name}
                      </Text>
                      <Text style={styles.ratingInlineText}>
                        {"⭐".repeat(
                          selectedMerchant.reviewCount > 0
                            ? Math.max(
                                1,
                                Math.round(selectedMerchant.avgRating)
                              )
                            : 5
                        )}{" "}
                        (
                        {selectedMerchant.reviewCount > 0
                          ? selectedMerchant.avgRating.toFixed(1)
                          : "5.0"}{" "}
                        • {selectedMerchant.reviewCount} reviews)
                      </Text>
                      <Text
                        style={{
                          fontFamily: "PoppinsSemiBold",
                          fontSize: 10,
                          color: selectedMerchant.isShopOpen
                            ? Colors.primary
                            : "#B3261E",
                          marginTop: 2,
                        }}
                      >
                        Hours: {selectedMerchant.shopOpenTime} –{" "}
                        {selectedMerchant.shopCloseTime} (
                        {selectedMerchant.isShopOpen
                          ? "Open Now"
                          : "After Hours"}
                        )
                      </Text>
                      <View style={[styles.distanceRow, { marginTop: 4 }]}>
                        <Ionicons
                          name="location-outline"
                          size={13}
                          color={Colors.primary}
                        />
                        <Text
                          style={{
                            fontFamily: "PoppinsRegular",
                            fontSize: 10.5,
                            color: Colors.primary1,
                            flex: 1,
                          }}
                          numberOfLines={2}
                        >
                          {selectedMerchant.address} (
                          {selectedMerchant.distance})
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={{ marginTop: 16 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 8,
                      }}
                    >
                      <Text style={styles.sectionTitle}>
                        Store Map Location
                      </Text>
                      <TouchableOpacity
                        style={styles.showMapBtn}
                        onPress={() => {
                          const target = {
                            name: selectedMerchant.name,
                            address: selectedMerchant.address,
                            lat: selectedMerchant.lat,
                            lng: selectedMerchant.lng,
                          };
                          setSelectedMerchant(null);
                          setMapModalTarget(target);
                        }}
                      >
                        <Ionicons
                          name="navigate-outline"
                          size={13}
                          color={Colors.primary}
                        />
                        <Text style={styles.showMapBtnText}>
                          Show Shop in Maps (Live Route)
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View
                      style={{
                        height: 190,
                        width: "100%",
                        borderRadius: 14,
                        overflow: "hidden",
                        borderWidth: 1,
                        borderColor: Colors.border,
                        backgroundColor: "#E8EFEA",
                      }}
                    >
                      {Platform.OS === "web" ? (
                        React.createElement("iframe", {
                          srcDoc: getMerchantMapHtml(selectedMerchant),
                          style: {
                            width: "100%",
                            height: "100%",
                            border: "none",
                          },
                          title: "Merchant Map",
                        })
                      ) : (
                        <WebView
                          originWhitelist={["*"]}
                          source={{
                            html: getMerchantMapHtml(selectedMerchant),
                          }}
                          style={{ flex: 1 }}
                          scrollEnabled={false}
                          bounces={false}
                          javaScriptEnabled={true}
                          domStorageEnabled={true}
                        />
                      )}
                    </View>
                  </View>

                  <View style={{ marginTop: 18 }}>
                    <Text style={[styles.sectionTitle, { marginBottom: 10 }]}>
                      Active Surplus Listings
                    </Text>
                    <View style={styles.foodGrid}>
                      {liveListings
                        .filter(
                          (item) =>
                            item.establishment === selectedMerchant.name
                        )
                        .map((item) => (
                          <FoodCard key={item.id} item={item} />
                        ))}
                    </View>
                  </View>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* CONSUMER REPORT LISTING / STOREFRONT MODAL */}
      <Modal
        visible={reportTarget !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setReportTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setReportTarget(null)}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalSheet}
          >
            {reportTarget && (
              <>
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>
                      {reportTarget.targetType === "merchant"
                        ? "Report Partner Storefront"
                        : "Report Food Listing"}
                    </Text>
                    <Text
                      style={{
                        fontFamily: "PoppinsRegular",
                        fontSize: 10,
                        color: "#B3261E",
                      }}
                      numberOfLines={1}
                    >
                      {reportTarget.targetType === "merchant"
                        ? reportTarget.establishment
                        : `${reportTarget.foodName} • ${reportTarget.establishment}`}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.modalCloseButton}
                    onPress={() => setReportTarget(null)}
                  >
                    <Ionicons name="close" size={20} color={Colors.primary2} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={[
                    styles.modalScroll,
                    { paddingBottom: 28 },
                  ]}
                >
                  <View
                    style={{
                      backgroundColor: "#FBE4E1",
                      padding: 12,
                      borderRadius: 12,
                      marginBottom: 14,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <Ionicons
                      name="shield-outline"
                      size={20}
                      color="#B3261E"
                    />
                    <Text
                      style={{
                        flex: 1,
                        fontFamily: "PoppinsRegular",
                        fontSize: 10.5,
                        color: "#12372C",
                        lineHeight: 15,
                      }}
                    >
                      Reports are logged immediately with ReServe Admin and sent
                      as a compliance alert to the merchant.
                    </Text>
                  </View>

                  <Text
                    style={{
                      fontFamily: "PoppinsSemiBold",
                      fontSize: 12,
                      color: Colors.primary2,
                      marginBottom: 8,
                    }}
                  >
                    Select Reason for Reporting
                  </Text>

                  <View style={{ gap: 7, marginBottom: 14 }}>
                    {REPORT_REASONS.map((reason) => {
                      const active = reportReason === reason;
                      return (
                        <TouchableOpacity
                          key={reason}
                          activeOpacity={0.8}
                          onPress={() => setReportReason(reason)}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            padding: 11,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: active ? "#B3261E" : Colors.border,
                            backgroundColor: active ? "#FDF3F2" : Colors.white,
                            gap: 10,
                          }}
                        >
                          <Ionicons
                            name={
                              active ? "radio-button-on" : "radio-button-off"
                            }
                            size={18}
                            color={active ? "#B3261E" : Colors.icon}
                          />
                          <Text
                            style={{
                              flex: 1,
                              fontFamily: active
                                ? "PoppinsSemiBold"
                                : "PoppinsRegular",
                              fontSize: 11.5,
                              color: active ? "#B3261E" : Colors.primary2,
                            }}
                          >
                            {reason}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text
                    style={{
                      fontFamily: "PoppinsSemiBold",
                      fontSize: 12,
                      color: Colors.primary2,
                      marginBottom: 6,
                    }}
                  >
                    Additional Details (Optional)
                  </Text>
                  <TextInput
                    value={reportDetails}
                    onChangeText={setReportDetails}
                    placeholder="Describe what is inappropriate, unsafe, or misleading..."
                    placeholderTextColor={Colors.placeholder}
                    multiline
                    textAlignVertical="top"
                    style={{
                      minHeight: 84,
                      backgroundColor: Colors.input,
                      borderWidth: 1,
                      borderColor: Colors.border,
                      borderRadius: 12,
                      padding: 12,
                      fontFamily: "PoppinsRegular",
                      fontSize: 12,
                      color: Colors.primary2,
                      marginBottom: 16,
                    }}
                  />

                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <TouchableOpacity
                      style={[
                        styles.addToCartButton,
                        {
                          flex: 0.42,
                          backgroundColor: Colors.input,
                          borderWidth: 1,
                          borderColor: Colors.border,
                        },
                      ]}
                      onPress={() => setReportTarget(null)}
                    >
                      <Text
                        style={[
                          styles.addToCartText,
                          { color: Colors.primary2 },
                        ]}
                      >
                        Cancel
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={submittingReport}
                      style={[
                        styles.addToCartButton,
                        { flex: 0.58, backgroundColor: "#B3261E" },
                      ]}
                      onPress={handleSubmitConsumerReport}
                    >
                      <Ionicons
                        name="flag"
                        size={16}
                        color={Colors.white}
                      />
                      <Text style={styles.addToCartText}>
                        {submittingReport ? "Submitting..." : "Submit Report"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </>
            )}
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <ShopLocationMapModal
        visible={!!mapModalTarget}
        shopName={mapModalTarget?.name || ""}
        address={mapModalTarget?.address || ""}
        lat={mapModalTarget?.lat || 10.3157}
        lng={mapModalTarget?.lng || 123.8854}
        onClose={() => setMapModalTarget(null)}
      />

      <ReserveAlertModal
        visible={modalAlert.visible}
        title={modalAlert.title}
        message={modalAlert.message}
        type={modalAlert.type}
        onClose={() => setModalAlert((p) => ({ ...p, visible: false }))}
      />

      <ConsumerBottomNav activeTab="Home" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 },
  welcomeSection: { marginBottom: 16 },
  welcomeText: {
    fontFamily: "PoppinsBold",
    fontSize: 24,
    color: Colors.primary2,
  },
  welcomeSubtext: {
    fontFamily: "PoppinsRegular",
    fontSize: 12,
    color: Colors.primary1,
    marginTop: 2,
  },
  searchContainer: {
    height: 46,
    paddingHorizontal: 12,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontFamily: "PoppinsRegular",
    fontSize: 12,
    color: Colors.primary2,
    marginLeft: 8,
    paddingVertical: 0,
  },
  hoursFilterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  hoursFilterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  hoursFilterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  hoursFilterChipText: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 11,
    color: Colors.primary2,
  },
  sectionHeader: { marginBottom: 12, marginTop: 4 },
  sectionTitle: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 17,
    color: Colors.primary2,
  },
  sectionSubtitle: {
    fontFamily: "PoppinsRegular",
    fontSize: 11,
    color: Colors.primary1,
  },
  featuredScroll: { paddingBottom: 4, gap: 12 },
  featuredCard: {
    width: 235,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    overflow: "hidden",
  },
  featuredImageContainer: { width: "100%", height: 140, position: "relative" },
  featuredImage: { width: "100%", height: "100%", resizeMode: "cover" },
  featuredContent: { padding: 12 },
  foodGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  foodCard: {
    width: "48.5%",
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 12,
  },
  foodImageContainer: { width: "100%", height: 125, position: "relative" },
  foodImage: { width: "100%", height: "100%", resizeMode: "cover" },
  discountBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: Colors.primary,
    borderRadius: 6,
  },
  discountText: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 9,
    color: Colors.white,
  },
  shopHoursCornerBadge: {
    position: "absolute",
    bottom: 8,
    right: 8,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    backgroundColor: "rgba(18,55,44,0.88)",
    borderRadius: 6,
  },
  shopHoursCornerText: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 8.5,
    color: Colors.white,
  },
  foodCardContent: { padding: 10 },
  foodName: {
    fontFamily: "PoppinsBold",
    fontSize: 14.5,
    color: Colors.primary2,
  },
  establishmentName: {
    fontFamily: "PoppinsRegular",
    fontSize: 10,
    color: Colors.primary1,
    marginTop: 1,
  },
  priceRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  foodPrice: { fontFamily: "PoppinsSemiBold", fontSize: 15, color: "#000000" },
  originalPrice: {
    fontFamily: "PoppinsRegular",
    fontSize: 10,
    color: Colors.placeholder,
    textDecorationLine: "line-through",
    marginLeft: 6,
  },
  depositBreakdownMini: {
    fontFamily: "PoppinsMedium",
    fontSize: 9.5,
    color: Colors.primary,
    marginTop: 2,
  },
  explicitExpiryText: {
    fontFamily: "PoppinsMedium",
    fontSize: 9.5,
    color: "#A94A3A",
    marginTop: 3,
  },
  detailsMetaRow: { paddingTop: 6, marginTop: 2, marginBottom: 2 },
  timerRow: { flexDirection: "row", alignItems: "center" },
  timerText: {
    fontFamily: "PoppinsMedium",
    fontSize: 10,
    color: Colors.primary,
    marginLeft: 4,
  },
  timerExpiredText: { color: "#B3261E", fontFamily: "PoppinsBold" },
  foodBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 6,
  },
  distanceRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  distanceText: {
    fontFamily: "PoppinsRegular",
    fontSize: 10,
    color: Colors.icon,
  },
  availableText: {
    fontFamily: "PoppinsMedium",
    fontSize: 10,
    color: Colors.primary1,
  },
  establishmentList: { gap: 10 },
  establishmentCard: {
    padding: 10,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  establishmentImage: {
    width: 56,
    height: 56,
    borderRadius: 10,
    resizeMode: "cover",
  },
  establishmentInfo: { flex: 1, marginLeft: 12, marginRight: 6 },
  establishmentNameLarge: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 13,
    color: Colors.primary2,
  },
  storeStatusPill: {
    backgroundColor: "#E4F0E8",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  storeStatusPillClosed: {
    backgroundColor: "#FBE4E1",
  },
  storeStatusPillText: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 8.5,
    color: Colors.primary,
  },
  ratingInlineText: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 10.5,
    color: "#B45309",
    marginTop: 1,
  },
  emptySearch: {
    height: 100,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptySearchText: {
    fontFamily: "PoppinsRegular",
    fontSize: 11,
    color: Colors.primary1,
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(18,55,44,0.5)",
    justifyContent: "flex-end",
  },
  modalHeader: {
    height: 52,
    paddingHorizontal: 16,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitle: {
    fontFamily: "PoppinsBold",
    fontSize: 16,
    color: Colors.primary2,
  },
  reportHeaderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "#FBE4E1",
    borderWidth: 1,
    borderColor: "#E5B8B4",
  },
  reportHeaderBtnText: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 10,
    color: "#B3261E",
  },
  modalSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
    overflow: "hidden",
    display: "flex",
  },
  modalScroll: { padding: 16 },
  stickyActionBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  modalFoodImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    resizeMode: "cover",
  },
  modalDiscountBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Colors.primary,
    borderRadius: 6,
    marginTop: 12,
  },
  modalFoodName: {
    fontFamily: "PoppinsBold",
    fontSize: 20,
    color: Colors.primary2,
    marginTop: 8,
  },
  modalEstablishment: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 11.5,
    color: Colors.primary2,
  },
  merchantBannerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F2F7F4",
    padding: 15,
    borderRadius: 10,
    marginTop: 15,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  showMapBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.white,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  showMapBtnText: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 10,
    color: Colors.primary,
  },
  merchantProfileHeaderCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F2F7F4",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalTimerBox: {
    marginTop: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  modalTimerLabel: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 10.5,
    color: "#A94A3A",
  },
  modalStorageText: {
    fontFamily: "PoppinsRegular",
    fontSize: 10,
    color: "#0b0b0b",
    marginTop: 2,
  },
  modalPriceBox: {
    marginTop: 14,
    padding: 12,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalPriceLabel: {
    fontFamily: "PoppinsRegular",
    fontSize: 10,
    color: Colors.primary1,
  },
  modalPrice: { fontFamily: "PoppinsBold", fontSize: 22, color: Colors.primary },
  modalOriginalPrice: {
    fontFamily: "PoppinsRegular",
    fontSize: 12,
    color: Colors.placeholder,
    textDecorationLine: "line-through",
  },
  quantityButton: {
    width: 32,
    height: 32,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  quantityLabel: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 11,
    color: Colors.primary2,
    flex: 1,
    marginRight: 10,
  },
  quantitySelector: {
    height: 42,
    width: 130,
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 6,
  },
  addToCartButton: {
    width: "100%",
    height: 46,
    backgroundColor: Colors.button,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  quantityText: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 13,
    color: Colors.primary2,
  },
  addToCartText: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 12,
    color: Colors.white,
  },
  bottomSpacing: { height: 12 },
  expiry: { flexDirection: "row", alignItems: "center", gap: 5 },
});