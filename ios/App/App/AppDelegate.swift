import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private var firebaseConfigured = false
    /// Avoid posting the same FCM token repeatedly to Capacitor.
    private var lastPostedFcmToken: String?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Configure Firebase only when GoogleService-Info.plist is present.
        if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
            FirebaseApp.configure()
            Messaging.messaging().delegate = self
            firebaseConfigured = true
        } else {
            print("[Push] GoogleService-Info.plist missing — Firebase Messaging not configured")
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        print("[Push] APNs registration succeeded (deviceToken bytes=\(deviceToken.count))")
        if firebaseConfigured {
            // APNs device token must be handed to Firebase so it can mint an FCM token.
            Messaging.messaging().apnsToken = deviceToken
            print("[Push] Assigned Messaging.messaging().apnsToken")
            // Capacitor 7 PushNotificationsPlugin accepts either Data (APNs hex) or String.
            // We must deliver the FCM registration token String — never the APNs hex Data —
            // because send-push-notification uses FCM HTTP v1.
            Messaging.messaging().token { [weak self] token, error in
                if let error {
                    print("[Push] Failed to fetch FCM token: \(error.localizedDescription)")
                    NotificationCenter.default.post(
                        name: .capacitorDidFailToRegisterForRemoteNotifications,
                        object: error
                    )
                    return
                }
                if let token {
                    print("[Push] Firebase FCM token received, length=\(token.count)")
                } else {
                    print("[Push] Firebase FCM token received: nil")
                }
                // force: true — account switches reuse the same FCM token; JS must still
                // receive a registration event so it can reassociate the token to the new user.
                self?.postFcmTokenToCapacitor(token, force: true)
            }
            return
        }

        // Without Firebase, fall back to Capacitor's default APNs Data path.
        print("[Push] Firebase not configured — posting APNs Data to Capacitor")
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("[Push] APNs registration failed: \(error.localizedDescription)")
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    /// Capacitor 7 supports `notification.object as? String` and emits it as `registration.value`.
    /// - Parameter force: when true (explicit APNs register callback), always notify JS even if
    ///   the FCM string is unchanged — required for SpeedVendors account switching on one device.
    private func postFcmTokenToCapacitor(_ token: String?, force: Bool = false) {
        guard let token, !token.isEmpty else { return }
        if !force && token == lastPostedFcmToken {
            print("[Push] Skipping duplicate FCM token post (length=\(token.count))")
            return
        }
        lastPostedFcmToken = token
        print("[Push] Posting FCM registration token to Capacitor (length=\(token.count), force=\(force))")
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: token)
    }
}

extension AppDelegate: MessagingDelegate {
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        // Token rotation/refresh — dedupe is fine here.
        postFcmTokenToCapacitor(fcmToken, force: false)
    }
}
