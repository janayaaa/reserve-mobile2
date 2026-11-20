import { Colors } from "@/constants/color";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  DeviceEventEmitter,
  KeyboardAvoidingView,
  Platform,
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
  ReserveConfirmModal,
  ReserveModalState,
} from "../components/CebuRegistrationHelpers";

const getStorageItem = async (key: string): Promise<string | null> => {
  if (Platform.OS === "web") return localStorage.getItem(key);
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
};

const setStorageItem = async (key: string, value: string) => {
  if (Platform.OS === "web") {
    localStorage.setItem(key, value);
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {}
};

const clearMerchantStorage = async () => {
  const keys = [
    "access",
    "refresh",
    "user_role",
    "user_email",
    "profile_id",
    "entity_name",
    "merch_type",
    "account_status",
  ];
  for (const k of keys) {
    if (Platform.OS === "web") localStorage.removeItem(k);
    else {
      try {
        await SecureStore.deleteItemAsync(k);
      } catch {}
    }
  }
};

export default function EstablishmentPrivacyScreen() {
  const [merchantId, setMerchantId] = useState("");
  const [busName, setBusName] = useState("Partner Establishment");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("Active");

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // Privacy & Alert Toggles
  const [orderAlertsEnabled, setOrderAlertsEnabled] = useState(true);
  const [expiryWarningsEnabled, setExpiryWarningsEnabled] = useState(true);
  const [payoutReceiptsEnabled, setPayoutReceiptsEnabled] = useState(true);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [deactivateConfirmVisible, setDeactivateConfirmVisible] =
    useState(false);
  const [deactivating, setDeactivating] = useState(false);

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

  const loadPrivacyData = useCallback(async () => {
    try {
      const storedId = await getStorageItem("profile_id");
      const storedEmail = (await getStorageItem("user_email")) || "";

      if (!storedId && !storedEmail) {
        router.replace("/consumer");
        return;
      }

      const resolvedId = storedId || "0";
      setMerchantId(resolvedId);

      const res = await api.get(
        `listings/merchant-portal/${resolvedId}/?email=${encodeURIComponent(
          storedEmail
        )}`
      );

      const p = res.data?.profile;
      if (p) {
        setMerchantId(String(p.merch_id || resolvedId));
        setBusName(p.bus_name || "Partner Establishment");
        setEmail(p.email || storedEmail);
        setPhone(
          p.phone && p.phone !== "Not Provided" ? String(p.phone) : ""
        );
        setStatus(p.status || "Active");
      }
    } catch (err) {
      console.log("Error loading merchant privacy settings:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrivacyData();
  }, [loadPrivacyData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPrivacyData();
    setRefreshing(false);
  };

  const handleSaveCredentials = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      showModal(
        "Invalid Email",
        "Please enter a valid official email address.",
        "warning"
      );
      return;
    }

    if (!cleanPhone || cleanPhone.replace(/\D/g, "").length < 10) {
      showModal(
        "Invalid Mobile Number",
        "Please enter a valid 11-digit Philippine mobile number (e.g., 09171234567).",
        "warning"
      );
      return;
    }

    setSavingCredentials(true);
    try {
      const activeId =
        merchantId || (await getStorageItem("profile_id")) || "0";
      const currentStoredEmail = (await getStorageItem("user_email")) || "";

      const res = await api.post(`listings/merchant-portal/${activeId}/`, {
        action: "update_profile",
        email: currentStoredEmail,
        new_email: cleanEmail,
        phone: cleanPhone,
      });

      await setStorageItem("user_email", res.data?.email || cleanEmail);
      DeviceEventEmitter.emit("merchant_profile_updated");

      showModal(
        "Credentials Updated",
        "Your official login email and verified contact number have been updated.",
        "success"
      );
    } catch (err: any) {
      showModal(
        "Update Failed",
        err.response?.data?.error ||
          "Could not update your account credentials.",
        "error"
      );
    } finally {
      setSavingCredentials(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword.trim()) {
      showModal(
        "Current Password Required",
        "Please enter your current password to verify your identity.",
        "warning"
      );
      return;
    }
    if (newPassword.trim().length < 6) {
      showModal(
        "Weak Password",
        "Your new password must be at least 6 characters long.",
        "warning"
      );
      return;
    }
    if (newPassword.trim() !== confirmPassword.trim()) {
      showModal(
        "Password Mismatch",
        "Your new password and confirmation password do not match.",
        "warning"
      );
      return;
    }

    setSavingPassword(true);
    try {
      const activeId =
        merchantId || (await getStorageItem("profile_id")) || "0";
      const storedEmail = (await getStorageItem("user_email")) || email;

      const res = await api.post(`listings/merchant-portal/${activeId}/`, {
        action: "change_password",
        email: storedEmail,
        current_password: currentPassword.trim(),
        new_password: newPassword.trim(),
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      showModal(
        "Password Updated",
        res.data?.message ||
          "Your storefront account password has been changed successfully.",
        "success"
      );
    } catch (err: any) {
      showModal(
        "Password Error",
        err.response?.data?.error || "Could not update password.",
        "error"
      );
    } finally {
      setSavingPassword(false);
    }
  };

  const executeDeactivateAccount = async () => {
    setDeactivateConfirmVisible(false);
    setDeactivating(true);
    try {
      const activeId =
        merchantId || (await getStorageItem("profile_id")) || "0";
      const storedEmail = (await getStorageItem("user_email")) || email;

      await api.post(`listings/merchant-portal/${activeId}/`, {
        action: "deactivate_account",
        email: storedEmail,
      });

      await clearMerchantStorage();
      router.replace("/consumer");
    } catch (err: any) {
      setDeactivating(false);
      showModal(
        "Deactivation Error",
        err.response?.data?.error ||
          "Could not deactivate your storefront account.",
        "error"
      );
    }
  };

  return (
    <SafeAreaView
      style={styles.container}
      edges={["top", "left", "right", "bottom"]}
    >
      <Stack.Screen options={{ headerShown: false, animation: "none" }} />

      {/* TOP HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.7}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/establishment/profile" as any);
          }}
        >
          <Ionicons name="arrow-back" size={20} color={Colors.primary} />
        </TouchableOpacity>

        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Privacy &amp; Security</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {busName}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
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
          {loading ? (
            <View style={{ paddingVertical: 40, alignItems: "center" }}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : (
            <>
              {/* 1. LOGIN & VERIFIED CONTACT CREDENTIALS */}
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <View style={styles.cardIconBox}>
                    <Ionicons
                      name="mail-unread-outline"
                      size={18}
                      color={Colors.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>
                      Login &amp; Contact Credentials
                    </Text>
                    <Text style={styles.cardSubtitle}>
                      Used for official login, Xendit payout alerts, and KYB
                      notices
                    </Text>
                  </View>
                </View>

                <Text style={styles.inputLabel}>Official Account Email *</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholder="store@example.com"
                  placeholderTextColor={Colors.placeholder}
                  style={styles.input}
                />

                <Text style={styles.inputLabel}>
                  Verified Mobile Number (SMS &amp; E-Wallet) *
                </Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  placeholder="09171234567"
                  placeholderTextColor={Colors.placeholder}
                  style={styles.input}
                />

                <TouchableOpacity
                  style={styles.primaryButton}
                  activeOpacity={0.85}
                  onPress={handleSaveCredentials}
                  disabled={savingCredentials}
                >
                  {savingCredentials ? (
                    <ActivityIndicator size="small" color={Colors.white} />
                  ) : (
                    <>
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={17}
                        color={Colors.white}
                      />
                      <Text style={styles.primaryButtonText}>
                        Save Contact Credentials
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* 2. CHANGE PASSWORD */}
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <View style={styles.cardIconBox}>
                    <Ionicons
                      name="key-outline"
                      size={18}
                      color={Colors.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>Change Password</Text>
                    <Text style={styles.cardSubtitle}>
                      Keep your merchant portal and wallet payouts secure
                    </Text>
                  </View>
                </View>

                <Text style={styles.inputLabel}>Current Password *</Text>
                <View style={styles.passwordInputWrapper}>
                  <TextInput
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    secureTextEntry={!showCurrentPw}
                    placeholder="Enter current password"
                    placeholderTextColor={Colors.placeholder}
                    style={styles.passwordInput}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowCurrentPw((p) => !p)}
                  >
                    <Ionicons
                      name={showCurrentPw ? "eye-off-outline" : "eye-outline"}
                      size={18}
                      color={Colors.icon}
                    />
                  </TouchableOpacity>
                </View>

                <Text style={styles.inputLabel}>
                  New Password (min. 6 characters) *
                </Text>
                <View style={styles.passwordInputWrapper}>
                  <TextInput
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showNewPw}
                    placeholder="Enter new password"
                    placeholderTextColor={Colors.placeholder}
                    style={styles.passwordInput}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowNewPw((p) => !p)}
                  >
                    <Ionicons
                      name={showNewPw ? "eye-off-outline" : "eye-outline"}
                      size={18}
                      color={Colors.icon}
                    />
                  </TouchableOpacity>
                </View>

                <Text style={styles.inputLabel}>Confirm New Password *</Text>
                <View style={styles.passwordInputWrapper}>
                  <TextInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirmPw}
                    placeholder="Re-enter new password"
                    placeholderTextColor={Colors.placeholder}
                    style={styles.passwordInput}
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowConfirmPw((p) => !p)}
                  >
                    <Ionicons
                      name={showConfirmPw ? "eye-off-outline" : "eye-outline"}
                      size={18}
                      color={Colors.icon}
                    />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.primaryButton}
                  activeOpacity={0.85}
                  onPress={handleChangePassword}
                  disabled={savingPassword}
                >
                  {savingPassword ? (
                    <ActivityIndicator size="small" color={Colors.white} />
                  ) : (
                    <>
                      <Ionicons
                        name="lock-closed-outline"
                        size={17}
                        color={Colors.white}
                      />
                      <Text style={styles.primaryButtonText}>
                        Update Password
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* 3. SECURITY & OPERATIONAL ALERTS */}
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <View style={styles.cardIconBox}>
                    <Ionicons
                      name="notifications-outline"
                      size={18}
                      color={Colors.primary}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>
                      Operational &amp; Security Alerts
                    </Text>
                    <Text style={styles.cardSubtitle}>
                      Real-time notifications for reservations, TTT safety, and
                      Xendit payouts
                    </Text>
                  </View>
                </View>

                <View style={styles.toggleRow}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.toggleTitle}>
                      20% Reservation Deposit Alerts
                    </Text>
                    <Text style={styles.toggleDesc}>
                      Notify immediately when a consumer locks an order via
                      Xendit
                    </Text>
                  </View>
                  <Switch
                    value={orderAlertsEnabled}
                    onValueChange={setOrderAlertsEnabled}
                    trackColor={{ false: "#D1D5DB", true: Colors.primary }}
                    thumbColor={Colors.white}
                  />
                </View>

                <View style={styles.toggleRow}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.toggleTitle}>
                      TTT 1-Hour &amp; 30-Min Safety Cutoffs
                    </Text>
                    <Text style={styles.toggleDesc}>
                      Warn before perishable listings reach auto-donate or flag
                      limits
                    </Text>
                  </View>
                  <Switch
                    value={expiryWarningsEnabled}
                    onValueChange={setExpiryWarningsEnabled}
                    trackColor={{ false: "#D1D5DB", true: Colors.primary }}
                    thumbColor={Colors.white}
                  />
                </View>

                <View style={[styles.toggleRow, { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.toggleTitle}>
                      Xendit Payout Disbursement Receipts
                    </Text>
                    <Text style={styles.toggleDesc}>
                      Receive instant reference numbers for GCash and Maya
                      withdrawals
                    </Text>
                  </View>
                  <Switch
                    value={payoutReceiptsEnabled}
                    onValueChange={setPayoutReceiptsEnabled}
                    trackColor={{ false: "#D1D5DB", true: Colors.primary }}
                    thumbColor={Colors.white}
                  />
                </View>
              </View>

              {/* 4. DANGER ZONE: DEACTIVATE STOREFRONT */}
              <View style={styles.dangerCard}>
                <View style={styles.cardHeaderRow}>
                  <View style={styles.dangerIconBox}>
                    <Ionicons
                      name="warning-outline"
                      size={18}
                      color="#B3261E"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dangerTitle}>
                      Deactivate Storefront Account
                    </Text>
                    <Text style={styles.dangerSubtitle}>
                      Temporarily hides your storefront and listings from the
                      Cebu City discovery feed
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.dangerButton}
                  activeOpacity={0.85}
                  onPress={() => setDeactivateConfirmVisible(true)}
                  disabled={deactivating}
                >
                  <Ionicons name="power-outline" size={16} color="#B3261E" />
                  <Text style={styles.dangerButtonText}>
                    {deactivating
                      ? "Deactivating Storefront..."
                      : "Deactivate Storefront Account"}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <ReserveConfirmModal
        visible={deactivateConfirmVisible}
        title="Deactivate Storefront?"
        message="Are you sure you want to set your storefront account to Inactive? Your listings will be hidden from consumers until reactivated by ReServe Admin."
        confirmText="Yes, Deactivate"
        cancelText="Cancel"
        isDestructive
        onConfirm={executeDeactivateAccount}
        onCancel={() => setDeactivateConfirmVisible(false)}
      />

      <ReserveAlertModal
        visible={modalAlert.visible}
        title={modalAlert.title}
        message={modalAlert.message}
        type={modalAlert.type}
        onClose={() => setModalAlert((p) => ({ ...p, visible: false }))}
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
    fontSize: 10.5,
    color: Colors.primary1,
    marginTop: -1,
  },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  cardIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#E8EFEA",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontFamily: "PoppinsBold",
    fontSize: 14,
    color: Colors.primary2,
  },
  cardSubtitle: {
    fontFamily: "PoppinsRegular",
    fontSize: 10.5,
    color: Colors.primary1,
  },
  inputLabel: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 11,
    color: Colors.primary2,
    marginBottom: 5,
    marginTop: 4,
  },
  input: {
    height: 44,
    backgroundColor: Colors.input,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    fontFamily: "PoppinsRegular",
    fontSize: 12,
    color: Colors.primary2,
    marginBottom: 10,
  },
  passwordInputWrapper: {
    height: 44,
    backgroundColor: Colors.input,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  passwordInput: {
    flex: 1,
    fontFamily: "PoppinsRegular",
    fontSize: 12,
    color: Colors.primary2,
  },
  eyeButton: {
    paddingLeft: 8,
    paddingVertical: 4,
  },
  primaryButton: {
    height: 45,
    backgroundColor: Colors.button,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 4,
  },
  primaryButtonText: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 12,
    color: Colors.white,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  toggleTitle: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 12,
    color: Colors.primary2,
  },
  toggleDesc: {
    fontFamily: "PoppinsRegular",
    fontSize: 10.5,
    color: Colors.primary1,
    marginTop: 1,
  },
  dangerCard: {
    backgroundColor: "#FFFBFB",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F5C2C0",
    padding: 16,
    marginBottom: 16,
  },
  dangerIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#FBE4E1",
    alignItems: "center",
    justifyContent: "center",
  },
  dangerTitle: {
    fontFamily: "PoppinsBold",
    fontSize: 14,
    color: "#B3261E",
  },
  dangerSubtitle: {
    fontFamily: "PoppinsRegular",
    fontSize: 10.5,
    color: "#7F1D1D",
  },
  dangerButton: {
    height: 44,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: "#E5B8B4",
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  dangerButtonText: {
    fontFamily: "PoppinsSemiBold",
    fontSize: 12,
    color: "#B3261E",
  },
});