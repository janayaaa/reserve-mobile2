import { Colors } from "@/constants/color";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useState } from "react";
import {
  DeviceEventEmitter,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../../services/api";
import {
  ReserveAlertModal,
  ReserveModalState,
} from "../components/CebuRegistrationHelpers";

const TIME_SLOTS = [
  "05:00 AM",
  "05:30 AM",
  "06:00 AM",
  "06:30 AM",
  "07:00 AM",
  "07:30 AM",
  "08:00 AM",
  "08:30 AM",
  "09:00 AM",
  "09:30 AM",
  "10:00 AM",
  "10:30 AM",
  "11:00 AM",
  "11:30 AM",
  "12:00 PM",
  "12:30 PM",
  "01:00 PM",
  "01:30 PM",
  "02:00 PM",
  "02:30 PM",
  "03:00 PM",
  "03:30 PM",
  "04:00 PM",
  "04:30 PM",
  "05:00 PM",
  "05:30 PM",
  "06:00 PM",
  "06:30 PM",
  "07:00 PM",
  "07:30 PM",
  "08:00 PM",
  "08:30 PM",
  "09:00 PM",
  "09:30 PM",
  "10:00 PM",
  "10:30 PM",
  "11:00 PM",
  "11:30 PM",
];

let cachedMerchantPersonalInfo = {
  merchantId: "1",
  busName: "",
  merchType: "Bakeshop",
  contactPerson: "",
  email: "",
  phone: "",
  hotline: "",
  expiryDate: "Verified",
  barangay: "",
  streetDetail: "",
  address: "Cebu City",
  latitude: 10.3157,
  longitude: 123.8854,
  pushNotif: true,
  smsAlerts: true,
  autoDonateExpiry: true,
  shopOpenTime: "08:00 AM",
  shopCloseTime: "08:00 PM",
  shopHoursEnabled: true,
  isLoaded: false,
};

const getStorageItem = async (key: string): Promise<string | null> => {
  if (Platform.OS === "web") return localStorage.getItem(key);
  return await SecureStore.getItemAsync(key);
};

const setStorageItem = async (key: string, val: string) => {
  if (!key || typeof key !== "string" || key.trim() === "") return;
  if (Platform.OS === "web") {
    localStorage.setItem(key, val);
  } else {
    try {
      await SecureStore.setItemAsync(key, val);
    } catch (e) {}
  }
};

export default function MerchantPersonalInfo() {
  const [merchantId, setMerchantId] = useState(
    cachedMerchantPersonalInfo.merchantId
  );
  const [busName, setBusName] = useState(cachedMerchantPersonalInfo.busName);
  const [merchType, setMerchType] = useState(
    cachedMerchantPersonalInfo.merchType
  );
  const [contactPerson, setContactPerson] = useState(
    cachedMerchantPersonalInfo.contactPerson
  );
  const [email, setEmail] = useState(cachedMerchantPersonalInfo.email);
  const [phone, setPhone] = useState(cachedMerchantPersonalInfo.phone);
  const [hotline, setHotline] = useState(cachedMerchantPersonalInfo.hotline);
  const [expiryDate, setExpiryDate] = useState(
    cachedMerchantPersonalInfo.expiryDate
  );
  const [barangay, setBarangay] = useState(cachedMerchantPersonalInfo.barangay);
  const [address, setAddress] = useState(cachedMerchantPersonalInfo.address);
  const [latitude, setLatitude] = useState(cachedMerchantPersonalInfo.latitude);
  const [longitude, setLongitude] = useState(
    cachedMerchantPersonalInfo.longitude
  );

  const [pushNotif, setPushNotif] = useState(
    cachedMerchantPersonalInfo.pushNotif
  );
  const [smsAlerts, setSmsAlerts] = useState(
    cachedMerchantPersonalInfo.smsAlerts
  );
  const [autoDonateExpiry, setAutoDonateExpiry] = useState(
    cachedMerchantPersonalInfo.autoDonateExpiry
  );

  // Shop Operating Hours States
  const [shopOpenTime, setShopOpenTime] = useState(
    cachedMerchantPersonalInfo.shopOpenTime
  );
  const [shopCloseTime, setShopCloseTime] = useState(
    cachedMerchantPersonalInfo.shopCloseTime
  );
  const [shopHoursEnabled, setShopHoursEnabled] = useState(
    cachedMerchantPersonalInfo.shopHoursEnabled
  );
  const [timePickerTarget, setTimePickerTarget] = useState<
    "open" | "close" | null
  >(null);

  const [isLoaded, setIsLoaded] = useState(cachedMerchantPersonalInfo.isLoaded);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [modalAlert, setModalAlert] = useState<ReserveModalState>({
    visible: false,
    title: "",
    message: "",
    type: "info",
  });

  const showAlert = (
    title: string,
    message: string,
    type: "success" | "error" | "info" | "warning" = "info"
  ) => setModalAlert({ visible: true, title, message, type });

  useEffect(() => {
    loadMerchantInfo();
  }, []);

  const loadMerchantInfo = async () => {
    try {
      const storedId = (await getStorageItem("profile_id")) || "1";
      const storedEmail = (await getStorageItem("user_email")) || "";
      setMerchantId(storedId);

      const [portalRes, settingsRes] = await Promise.all([
        api.get(
          `listings/merchant-portal/${storedId}/?email=${encodeURIComponent(
            storedEmail
          )}`
        ),
        api
          .get(
            `accounts/settings/?profile_id=${storedId}&email=${encodeURIComponent(
              storedEmail
            )}&role=Merchant`
          )
          .catch(() => null),
      ]);

      const p = portalRes.data?.profile;
      if (p) {
        const parts = (p.address || "").split(",");
        const nextStreet = parts[0] ? parts[0].trim() : "";
        const nextBrgy = parts[1]
          ? parts[1].replace(/brgy\.?/i, "").trim()
          : "";

        cachedMerchantPersonalInfo = {
          ...cachedMerchantPersonalInfo,
          merchantId: String(p.merch_id || storedId),
          busName: p.bus_name || "",
          merchType: p.merch_type || "Bakeshop",
          contactPerson: p.contact_person || "",
          email: p.email || storedEmail,
          phone: p.phone !== "Not Provided" ? p.phone || "" : "",
          hotline: p.hotline !== "N/A" ? p.hotline || "" : "",
          expiryDate: p.expiry_date || "Verified",
          address: p.address || "Cebu City",
          streetDetail: nextStreet,
          barangay: nextBrgy || cachedMerchantPersonalInfo.barangay,
          latitude: p.latitude ? Number(p.latitude) : 10.3157,
          longitude: p.longitude ? Number(p.longitude) : 123.8854,
          isLoaded: true,
        };

        setMerchantId(cachedMerchantPersonalInfo.merchantId);
        setBusName(cachedMerchantPersonalInfo.busName);
        setMerchType(cachedMerchantPersonalInfo.merchType);
        setContactPerson(cachedMerchantPersonalInfo.contactPerson);
        setEmail(cachedMerchantPersonalInfo.email);
        setPhone(cachedMerchantPersonalInfo.phone);
        setHotline(cachedMerchantPersonalInfo.hotline);
        setExpiryDate(cachedMerchantPersonalInfo.expiryDate);
        setAddress(cachedMerchantPersonalInfo.address);
        if (nextBrgy) setBarangay(nextBrgy);
        setLatitude(cachedMerchantPersonalInfo.latitude);
        setLongitude(cachedMerchantPersonalInfo.longitude);
      }

      if (settingsRes?.data) {
        const pNotif = Boolean(settingsRes.data.pushNotif ?? true);
        const sAlerts = Boolean(settingsRes.data.smsAlerts ?? true);
        const aDonate = Boolean(settingsRes.data.autoDonateExpiry ?? true);
        const sOpen = String(settingsRes.data.shopOpenTime || "08:00 AM");
        const sClose = String(settingsRes.data.shopCloseTime || "08:00 PM");
        const sEnabled = Boolean(settingsRes.data.shopHoursEnabled ?? true);

        cachedMerchantPersonalInfo.pushNotif = pNotif;
        cachedMerchantPersonalInfo.smsAlerts = sAlerts;
        cachedMerchantPersonalInfo.autoDonateExpiry = aDonate;
        cachedMerchantPersonalInfo.shopOpenTime = sOpen;
        cachedMerchantPersonalInfo.shopCloseTime = sClose;
        cachedMerchantPersonalInfo.shopHoursEnabled = sEnabled;

        setPushNotif(pNotif);
        setSmsAlerts(sAlerts);
        setAutoDonateExpiry(aDonate);
        setShopOpenTime(sOpen);
        setShopCloseTime(sClose);
        setShopHoursEnabled(sEnabled);
      }
    } catch (e) {
    } finally {
      setIsLoaded(true);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMerchantInfo();
    setRefreshing(false);
  };

  const persistUserSettings = async (overrides: Record<string, any>) => {
    const nextSettings = {
      pushNotif,
      smsAlerts,
      autoDonateExpiry,
      shopOpenTime,
      shopCloseTime,
      shopHoursEnabled,
      ...overrides,
    };
    try {
      await api.post("accounts/settings/", {
        profile_id: merchantId,
        email,
        role: "Merchant",
        settings: nextSettings,
      });
      DeviceEventEmitter.emit("merchant_profile_updated");
      DeviceEventEmitter.emit("merchant_listings_updated");
    } catch (e) {}
  };

  const handleToggleSetting = async (
    key: "pushNotif" | "smsAlerts" | "autoDonateExpiry" | "shopHoursEnabled",
    value: boolean
  ) => {
    if (key === "pushNotif") {
      cachedMerchantPersonalInfo.pushNotif = value;
      setPushNotif(value);
    }
    if (key === "smsAlerts") {
      cachedMerchantPersonalInfo.smsAlerts = value;
      setSmsAlerts(value);
    }
    if (key === "autoDonateExpiry") {
      cachedMerchantPersonalInfo.autoDonateExpiry = value;
      setAutoDonateExpiry(value);
    }
    if (key === "shopHoursEnabled") {
      cachedMerchantPersonalInfo.shopHoursEnabled = value;
      setShopHoursEnabled(value);
    }
    await persistUserSettings({ [key]: value });
  };

  const handleSelectTimeSlot = async (slot: string) => {
    if (timePickerTarget === "open") {
      cachedMerchantPersonalInfo.shopOpenTime = slot;
      setShopOpenTime(slot);
      setTimePickerTarget(null);
      await persistUserSettings({ shopOpenTime: slot });
    } else if (timePickerTarget === "close") {
      cachedMerchantPersonalInfo.shopCloseTime = slot;
      setShopCloseTime(slot);
      setTimePickerTarget(null);
      await persistUserSettings({ shopCloseTime: slot });
    }
  };

  const handleSave = async () => {
    if (!busName.trim()) {
      showAlert(
        "Establishment Name Required",
        "Please enter your business or establishment name.",
        "warning"
      );
      return;
    }

    setSaving(true);
    try {
      // Save operating hours & notification settings AND storefront identity
      // Note: Storefront physical address & GPS pin remain locked to registered KYB values
      const [res] = await Promise.all([
        api.post(`listings/merchant-portal/${merchantId}/`, {
          action: "update_profile",
          bus_name: busName.trim(),
          contact_person: contactPerson.trim(),
          hotline: hotline.trim(),
          email: email,
          phone: phone,
          shop_open_time: shopOpenTime,
          shop_close_time: shopCloseTime,
          shop_hours_enabled: shopHoursEnabled,
        }),
        api.post("accounts/settings/", {
          profile_id: merchantId,
          email,
          role: "Merchant",
          settings: {
            pushNotif,
            smsAlerts,
            autoDonateExpiry,
            shopOpenTime,
            shopCloseTime,
            shopHoursEnabled,
          },
        }),
      ]);

      cachedMerchantPersonalInfo = {
        ...cachedMerchantPersonalInfo,
        busName: busName.trim(),
        contactPerson: contactPerson.trim(),
        hotline: hotline.trim(),
        shopOpenTime,
        shopCloseTime,
        shopHoursEnabled,
      };

      await setStorageItem("entity_name", busName.trim());
      DeviceEventEmitter.emit("merchant_profile_updated");
      DeviceEventEmitter.emit("merchant_listings_updated");

      showAlert(
        "Storefront & Hours Saved",
        res.data?.message ||
          `Your establishment details and operating hours (${shopOpenTime} – ${shopCloseTime}) have been saved!`,
        "success"
      );
    } catch (e: any) {
      showAlert(
        "Update Error",
        e.response?.data?.error || "Could not save storefront changes.",
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView
      style={styles.container}
      edges={["top", "left", "right", "bottom"]}
    >
      <Stack.Screen options={{ animation: "none", gestureEnabled: false }} />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.7}
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace("/establishment/profile" as any);
            }
          }}
        >
          <Ionicons name="arrow-back" size={20} color={Colors.primary} />
        </TouchableOpacity>

        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>
            Storefront, Operating Hours &amp; Location
          </Text>
          <Text style={styles.headerSubtitle}>
            Configure daily open/close times, representative details, and
            alerts
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
        >
          <View style={styles.profileSummaryCard}>
            <View style={styles.profileCircle}>
              <Ionicons name="storefront" size={32} color={Colors.primary} />
            </View>
            <Text style={styles.profileTitle}>
              {isLoaded ? busName || "Merchant Storefront" : "Loading..."}
            </Text>
            <Text style={styles.profileSubtitle}>{address}</Text>

            <View style={styles.detailGrid}>
              <View style={styles.detailCell}>
                <Text style={styles.detailCellLabel}>Category</Text>
                <Text style={styles.detailCellValue}>{merchType}</Text>
              </View>
              <View style={styles.detailCellDivider} />
              <View style={styles.detailCell}>
                <Text style={styles.detailCellLabel}>Shop Hours</Text>
                <Text style={styles.detailCellValue}>
                  {shopHoursEnabled
                    ? `${shopOpenTime} – ${shopCloseTime}`
                    : "24/7 Open"}
                </Text>
              </View>
              <View style={styles.detailCellDivider} />
              <View style={styles.detailCell}>
                <Text style={styles.detailCellLabel}>Permit Expiry</Text>
                <Text style={styles.detailCellValue}>{expiryDate}</Text>
              </View>
            </View>
          </View>

          {/* SHOP OPEN & CLOSE OPERATING HOURS CARD */}
          <View style={styles.formCard}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <Text style={[styles.cardSectionHeading, { marginBottom: 0 }]}>
                Storefront Operating Hours
              </Text>
              <View style={styles.hoursStatusBadge}>
                <Ionicons
                  name="time-outline"
                  size={12}
                  color={Colors.primary}
                />
                <Text style={styles.hoursStatusBadgeText}>
                  {shopHoursEnabled ? "Active Schedule" : "Always Visible"}
                </Text>
              </View>
            </View>

            <Text style={styles.sectionHelperText}>
              Set your daily opening and closing hours. Outside these operating
              hours, your storefront and surplus food listings are automatically
              hidden from Consumer discovery.
            </Text>

            <View style={styles.settingItem}>
              <View style={styles.settingIcon}>
                <Ionicons
                  name="storefront-outline"
                  size={18}
                  color={Colors.primary}
                />
              </View>
              <View style={styles.settingContent}>
                <Text style={styles.settingTitle}>
                  Enforce Daily Shop Open / Close Hours
                </Text>
                <Text style={styles.settingSubtitle}>
                  Automatically hide active listings when your shop is closed
                </Text>
              </View>
              <Switch
                value={shopHoursEnabled}
                onValueChange={(v) =>
                  handleToggleSetting("shopHoursEnabled", v)
                }
                trackColor={{ false: "#CBD5E1", true: Colors.button }}
              />
            </View>

            {shopHoursEnabled && (
              <View style={styles.timePickersRow}>
                <TouchableOpacity
                  style={styles.timePickerBox}
                  activeOpacity={0.8}
                  onPress={() => setTimePickerTarget("open")}
                >
                  <Text style={styles.timePickerLabel}>SHOP OPEN TIME</Text>
                  <View style={styles.timePickerValueRow}>
                    <Ionicons
                      name="sunny-outline"
                      size={16}
                      color={Colors.primary}
                    />
                    <Text style={styles.timePickerValueText}>
                      {shopOpenTime}
                    </Text>
                    <Ionicons
                      name="chevron-down"
                      size={15}
                      color={Colors.icon}
                    />
                  </View>
                </TouchableOpacity>

                <View style={styles.timeArrowContainer}>
                  <Ionicons
                    name="arrow-forward"
                    size={16}
                    color={Colors.primary1}
                  />
                </View>

                <TouchableOpacity
                  style={styles.timePickerBox}
                  activeOpacity={0.8}
                  onPress={() => setTimePickerTarget("close")}
                >
                  <Text style={styles.timePickerLabel}>SHOP CLOSE TIME</Text>
                  <View style={styles.timePickerValueRow}>
                    <Ionicons
                      name="moon-outline"
                      size={16}
                      color={Colors.primary}
                    />
                    <Text style={styles.timePickerValueText}>
                      {shopCloseTime}
                    </Text>
                    <Ionicons
                      name="chevron-down"
                      size={15}
                      color={Colors.icon}
                    />
                  </View>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* AUTOMATION & ALERT PREFERENCES */}
          <View style={styles.formCard}>
            <Text style={styles.cardSectionHeading}>
              Automation &amp; Alert Preferences
            </Text>

            <View style={styles.settingItem}>
              <View style={styles.settingIcon}>
                <Ionicons
                  name="notifications-outline"
                  size={18}
                  color={Colors.primary}
                />
              </View>
              <View style={styles.settingContent}>
                <Text style={styles.settingTitle}>
                  Order &amp; Pickup Push Alerts
                </Text>
                <Text style={styles.settingSubtitle}>
                  Receive instant alerts when consumers reserve items
                </Text>
              </View>
              <Switch
                value={pushNotif}
                onValueChange={(v) => handleToggleSetting("pushNotif", v)}
                trackColor={{ false: "#CBD5E1", true: Colors.button }}
              />
            </View>

            <View style={styles.settingDivider} />

            <View style={styles.settingItem}>
              <View style={styles.settingIcon}>
                <Ionicons
                  name="flash-outline"
                  size={18}
                  color={Colors.primary}
                />
              </View>
              <View style={styles.settingContent}>
                <Text style={styles.settingTitle}>
                  TTT 1-Hour Expiry Warnings
                </Text>
                <Text style={styles.settingSubtitle}>
                  Alert when listings are within 1 hour of safety threshold
                </Text>
              </View>
              <Switch
                value={autoDonateExpiry}
                onValueChange={(v) =>
                  handleToggleSetting("autoDonateExpiry", v)
                }
                trackColor={{ false: "#CBD5E1", true: Colors.button }}
              />
            </View>
          </View>

          {/* STOREFRONT IDENTITY & LOCKED CEBU CITY LOCATION */}
          <View style={styles.formCard}>
            <Text style={styles.cardSectionHeading}>
              Storefront Identity &amp; Locked Cebu City Pin
            </Text>

            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Establishment Name *</Text>
              <View style={styles.inputContainer}>
                <Ionicons
                  name="storefront-outline"
                  size={18}
                  color={Colors.primary}
                />
                <TextInput
                  style={styles.input}
                  value={busName}
                  onChangeText={setBusName}
                  placeholder="Enter establishment name"
                  placeholderTextColor={Colors.placeholder}
                />
              </View>
            </View>

            <View style={styles.fieldContainer}>
              <Text style={styles.label}>
                Authorized Representative / Contact Person *
              </Text>
              <View style={styles.inputContainer}>
                <Ionicons
                  name="person-outline"
                  size={18}
                  color={Colors.primary}
                />
                <TextInput
                  style={styles.input}
                  value={contactPerson}
                  onChangeText={setContactPerson}
                  placeholder="Enter manager or owner name"
                  placeholderTextColor={Colors.placeholder}
                />
              </View>
            </View>

            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Business Landline / Hotline</Text>
              <View style={styles.inputContainer}>
                <Ionicons
                  name="call-outline"
                  size={18}
                  color={Colors.primary}
                />
                <TextInput
                  style={styles.input}
                  value={hotline}
                  onChangeText={setHotline}
                  placeholder="e.g. (032) 231-0000 or N/A"
                  placeholderTextColor={Colors.placeholder}
                />
              </View>
            </View>

            {/* NON-EDITABLE KYB-LOCKED STOREFRONT ADDRESS & MAP PIN */}
            <View style={styles.lockedLocationCard}>
              <View style={styles.lockedLocationHeader}>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <Ionicons
                    name="lock-closed"
                    size={15}
                    color={Colors.primary}
                  />
                  <Text style={styles.lockedLocationTitle}>
                    Registered Cebu City Address &amp; Map Pin (Locked)
                  </Text>
                </View>
              </View>

              <View style={styles.lockedFieldRow}>
                <Ionicons
                  name="location"
                  size={17}
                  color={Colors.primary}
                  style={{ marginTop: 1 }}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.lockedAddressValue}>{address}</Text>
                  {barangay ? (
                    <Text style={styles.lockedCoordsValue}>
                      Barangay: {barangay} • Cebu City
                    </Text>
                  ) : null}
                </View>
              </View>

             

              <Text style={styles.lockedNoticeText}>
                For marketplace security and municipal permit compliance, your
                storefront address and Haversine GPS pin are permanently locked
                to the location verified on your Cebu City Business Permit.
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.saveButton}
            activeOpacity={0.85}
            onPress={handleSave}
            disabled={saving}
          >
            <Ionicons
              name="checkmark-circle-outline"
              size={19}
              color={Colors.white}
            />
            <Text style={styles.saveText}>
              {saving ? "SAVING CHANGES..." : "Save Storefront & Shop Hours"}
            </Text>
          </TouchableOpacity>

          <Text style={styles.note}>
            Your pinned Cebu City coordinates allow nearby Consumers and Food
            Banks within the Haversine radius to discover your surplus listings
            during your active operating hours.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* SHOP OPEN / CLOSE TIME PICKER MODAL */}
      <Modal
        visible={timePickerTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setTimePickerTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setTimePickerTarget(null)}
          />
          <View style={styles.timeModalCard}>
            <View style={styles.timeModalHeader}>
              <View>
                <Text style={styles.timeModalTitle}>
                  Select{" "}
                  {timePickerTarget === "open"
                    ? "Shop Open Time"
                    : "Shop Close Time"}
                </Text>
                <Text style={styles.timeModalSubtitle}>
                  Choose your daily storefront{" "}
                  {timePickerTarget === "open" ? "opening" : "closing"} time
                </Text>
              </View>
              <TouchableOpacity onPress={() => setTimePickerTarget(null)}>
                <Ionicons name="close" size={22} color={Colors.primary2} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 320 }}
              contentContainerStyle={styles.timeGridContainer}
            >
              {TIME_SLOTS.map((slot) => {
                const isSelected =
                  (timePickerTarget === "open" && shopOpenTime === slot) ||
                  (timePickerTarget === "close" && shopCloseTime === slot);
                return (
                  <TouchableOpacity
                    key={slot}
                    style={[
                      styles.timeSlotChip,
                      isSelected && styles.timeSlotChipActive,
                    ]}
                    activeOpacity={0.8}
                    onPress={() => handleSelectTimeSlot(slot)}
                  >
                    <Text
                      style={[
                        styles.timeSlotChipText,
                        isSelected && styles.timeSlotChipTextActive,
                      ]}
                    >
                      {slot}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ReserveAlertModal
        visible={modalAlert.visible}
        title={modalAlert.title}
        message={modalAlert.message}
        type={modalAlert.type}
        onClose={() => {
          setModalAlert((prev) => ({ ...prev, visible: false }));
          if (modalAlert.type === "success") {
            router.back();
          }
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    height: 60,
    paddingHorizontal: 16,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextContainer: { marginLeft: 11, flex: 1 },
  headerTitle: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 15,
    color: Colors.primary2,
  },
  headerSubtitle: {
    fontFamily: "PoppinsRegular",
    fontSize: 9.5,
    color: Colors.primary1,
    marginTop: -1,
  },
  content: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 40 },
  profileSummaryCard: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  profileCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#E8EFEA",
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  profileTitle: {
    fontFamily: "PoppinsBold",
    fontSize: 17,
    color: Colors.primary2,
    textAlign: "center",
  },
  profileSubtitle: {
    fontFamily: "PoppinsRegular",
    fontSize: 10.5,
    color: Colors.primary1,
    marginTop: 2,
    textAlign: "center",
  },
  detailGrid: {
    flexDirection: "row",
    width: "100%",
    backgroundColor: "#F7F9F7",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 14,
  },
  detailCell: { flex: 1, alignItems: "center", paddingHorizontal: 4 },
  detailCellDivider: { width: 1, backgroundColor: Colors.border },
  detailCellLabel: {
    fontFamily: "PoppinsRegular",
    fontSize: 9.5,
    color: Colors.primary1,
  },
  detailCellValue: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 10,
    color: Colors.primary2,
    marginTop: 2,
    textAlign: "center",
  },
  formCard: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    padding: 15,
    marginBottom: 16,
  },
  cardSectionHeading: {
    fontFamily: "PoppinsBold",
    fontSize: 13.5,
    color: Colors.primary2,
    marginBottom: 10,
  },
  sectionHelperText: {
    fontFamily: "PoppinsRegular",
    fontSize: 10.5,
    color: Colors.primary1,
    lineHeight: 15,
    marginBottom: 8,
  },
  hoursStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E8EFEA",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  hoursStatusBadgeText: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 9.5,
    color: Colors.primary,
  },
  timePickersRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 8,
  },
  timePickerBox: {
    flex: 1,
    backgroundColor: "#F7F9F7",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 11,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  timePickerLabel: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 9,
    color: Colors.primary1,
    letterSpacing: 0.4,
  },
  timePickerValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  timePickerValueText: {
    fontFamily: "PoppinsBold",
    fontSize: 13,
    color: Colors.primary2,
  },
  timeArrowContainer: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  settingItem: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#E7EEE9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  settingContent: { flex: 1, paddingRight: 8 },
  settingTitle: {
    fontFamily: "PoppinsMedium",
    fontSize: 12,
    color: Colors.primary2,
  },
  settingSubtitle: {
    fontFamily: "PoppinsRegular",
    fontSize: 10,
    color: Colors.primary1,
    marginTop: 1,
  },
  settingDivider: { height: 1, backgroundColor: Colors.border },
  fieldContainer: { marginBottom: 14 },
  label: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 10.5,
    color: Colors.primary2,
    marginBottom: 6,
  },
  inputContainer: {
    height: 44,
    backgroundColor: Colors.input,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    flex: 1,
    fontFamily: "PoppinsRegular",
    fontSize: 11.5,
    color: Colors.primary2,
    marginLeft: 8,
    paddingVertical: 0,
  },
  lockedLocationCard: {
    backgroundColor: "#F3F6F4",
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 13,
    marginTop: 4,
  },
  lockedLocationHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  lockedLocationTitle: {
    fontFamily: "PoppinsBold",
    fontSize: 11,
    color: Colors.primary2,
  },
  kybVerifiedPill: {
    backgroundColor: "#E4F0E8",
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  kybVerifiedPillText: {
    fontFamily: "PoppinsBold",
    fontSize: 9,
    color: Colors.primary,
  },
  lockedFieldRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 10,
  },
  lockedAddressValue: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 11.5,
    color: Colors.primary2,
  },
  lockedCoordsValue: {
    fontFamily: "PoppinsRegular",
    fontSize: 10,
    color: Colors.primary1,
    marginTop: 2,
  },
  lockedGpsPillRow: {
    flexDirection: "row",
    marginTop: 8,
  },
  lockedGpsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#E8EFEA",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  lockedGpsPillText: {
    fontFamily: "PoppinsMedium",
    fontSize: 10,
    color: Colors.primary2,
  },
  lockedNoticeText: {
    fontFamily: "PoppinsRegular",
    fontSize: 9.5,
    color: Colors.primary1,
    lineHeight: 14,
    marginTop: 8,
  },
  saveButton: {
    height: 46,
    backgroundColor: Colors.button,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    gap: 6,
  },
  saveText: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 12,
    color: Colors.white,
  },
  note: {
    fontFamily: "PoppinsRegular",
    fontSize: 9.5,
    lineHeight: 14,
    color: Colors.placeholder,
    textAlign: "center",
    marginTop: 10,
    paddingHorizontal: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(18,55,44,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  timeModalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 18,
  },
  timeModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  timeModalTitle: {
    fontFamily: "PoppinsBold",
    fontSize: 15,
    color: Colors.primary2,
  },
  timeModalSubtitle: {
    fontFamily: "PoppinsRegular",
    fontSize: 10.5,
    color: Colors.primary1,
  },
  timeGridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingVertical: 4,
  },
  timeSlotChip: {
    width: "31%",
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#F3F6F4",
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  timeSlotChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  timeSlotChipText: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 11,
    color: Colors.primary2,
  },
  timeSlotChipTextActive: {
    color: Colors.white,
  },
});