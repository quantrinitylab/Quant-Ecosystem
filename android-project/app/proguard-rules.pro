# Quant Android App Proguard Rules
-keepattributes *Annotation*,InnerClasses,EnclosingMethod,Signature

# Kotlinx Serialization
-keepclassmembers class * {
    companion object *;
}
-keepclasseswithmembers class * {
    kotlinx.serialization.KSerializer serializer(...);
}

# Android WebKit
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Preserve Compose and AndroidX components
-keep class androidx.browser.customtabs.** { *; }
-dontwarn androidx.browser.customtabs.**
