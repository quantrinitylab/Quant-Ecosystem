plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.compose.compiler)
  alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.quant.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.quant.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 100
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        manifestPlaceholders["appName"] = "Quant"
        manifestPlaceholders["deepLinkScheme"] = "quant"
        manifestPlaceholders["appHost"] = "quantmail.in"
    }

    flavorDimensions += "app"
    productFlavors {
        create("quantmail") {
            dimension = "app"
            applicationId = "com.quant.mail"
            manifestPlaceholders["appName"] = "QuantMail"
            manifestPlaceholders["deepLinkScheme"] = "quantmail"
            manifestPlaceholders["appHost"] = "quantmail.in"
            resValue("string", "app_name", "QuantMail")
            resValue("string", "default_app_url", "https://quantmail.in/")
            resValue("string", "deep_link_scheme", "quantmail")
            buildConfigField("String", "APP_NAME", "\"QuantMail\"")
            buildConfigField("String", "DEFAULT_APP_URL", "\"https://quantmail.in/\"")
            buildConfigField("String", "DEEP_LINK_SCHEME", "\"quantmail\"")
            buildConfigField("String", "APP_HOST", "\"quantmail.in\"")
        }
        create("quantchat") {
            dimension = "app"
            applicationId = "com.quant.chat"
            manifestPlaceholders["appName"] = "QuantChat"
            manifestPlaceholders["deepLinkScheme"] = "quantchat"
            manifestPlaceholders["appHost"] = "quantchat.quantrinity.in"
            resValue("string", "app_name", "QuantChat")
            resValue("string", "default_app_url", "https://quantchat.quantrinity.in/")
            resValue("string", "deep_link_scheme", "quantchat")
            buildConfigField("String", "APP_NAME", "\"QuantChat\"")
            buildConfigField("String", "DEFAULT_APP_URL", "\"https://quantchat.quantrinity.in/\"")
            buildConfigField("String", "DEEP_LINK_SCHEME", "\"quantchat\"")
            buildConfigField("String", "APP_HOST", "\"quantchat.quantrinity.in\"")
        }
        create("quantgram") {
            dimension = "app"
            applicationId = "com.quant.gram"
            manifestPlaceholders["appName"] = "QuantGram"
            manifestPlaceholders["deepLinkScheme"] = "quantgram"
            manifestPlaceholders["appHost"] = "quantgram.quantrinity.in"
            resValue("string", "app_name", "QuantGram")
            resValue("string", "default_app_url", "https://quantgram.quantrinity.in/")
            resValue("string", "deep_link_scheme", "quantgram")
            buildConfigField("String", "APP_NAME", "\"QuantGram\"")
            buildConfigField("String", "DEFAULT_APP_URL", "\"https://quantgram.quantrinity.in/\"")
            buildConfigField("String", "DEEP_LINK_SCHEME", "\"quantgram\"")
            buildConfigField("String", "APP_HOST", "\"quantgram.quantrinity.in\"")
        }
        create("quantube") {
            dimension = "app"
            applicationId = "com.quant.tube"
            manifestPlaceholders["appName"] = "QuanTube"
            manifestPlaceholders["deepLinkScheme"] = "quantube"
            manifestPlaceholders["appHost"] = "quantube.quantrinity.in"
            resValue("string", "app_name", "QuanTube")
            resValue("string", "default_app_url", "https://quantube.quantrinity.in/")
            resValue("string", "deep_link_scheme", "quantube")
            buildConfigField("String", "APP_NAME", "\"QuanTube\"")
            buildConfigField("String", "DEFAULT_APP_URL", "\"https://quantube.quantrinity.in/\"")
            buildConfigField("String", "DEEP_LINK_SCHEME", "\"quantube\"")
            buildConfigField("String", "APP_HOST", "\"quantube.quantrinity.in\"")
        }
        create("quantai") {
            dimension = "app"
            applicationId = "com.quant.ai"
            manifestPlaceholders["appName"] = "QuantAI"
            manifestPlaceholders["deepLinkScheme"] = "quantai"
            manifestPlaceholders["appHost"] = "quantai.quantrinity.in"
            resValue("string", "app_name", "QuantAI")
            resValue("string", "default_app_url", "https://quantai.quantrinity.in/")
            resValue("string", "deep_link_scheme", "quantai")
            buildConfigField("String", "APP_NAME", "\"QuantAI\"")
            buildConfigField("String", "DEFAULT_APP_URL", "\"https://quantai.quantrinity.in/\"")
            buildConfigField("String", "DEEP_LINK_SCHEME", "\"quantai\"")
            buildConfigField("String", "APP_HOST", "\"quantai.quantrinity.in\"")
        }
        create("quantdrive") {
            dimension = "app"
            applicationId = "com.quant.drive"
            manifestPlaceholders["appName"] = "QuantDrive"
            manifestPlaceholders["deepLinkScheme"] = "quantdrive"
            manifestPlaceholders["appHost"] = "quantmail.in"
            resValue("string", "app_name", "QuantDrive")
            resValue("string", "default_app_url", "https://quantmail.in/drive")
            resValue("string", "deep_link_scheme", "quantdrive")
            buildConfigField("String", "APP_NAME", "\"QuantDrive\"")
            buildConfigField("String", "DEFAULT_APP_URL", "\"https://quantmail.in/drive\"")
            buildConfigField("String", "DEEP_LINK_SCHEME", "\"quantdrive\"")
            buildConfigField("String", "APP_HOST", "\"quantmail.in\"")
        }
        create("quantcalendar") {
            dimension = "app"
            applicationId = "com.quant.calendar"
            manifestPlaceholders["appName"] = "QuantCalendar"
            manifestPlaceholders["deepLinkScheme"] = "quantcalendar"
            manifestPlaceholders["appHost"] = "quantmail.in"
            resValue("string", "app_name", "QuantCalendar")
            resValue("string", "default_app_url", "https://quantmail.in/calendar")
            resValue("string", "deep_link_scheme", "quantcalendar")
            buildConfigField("String", "APP_NAME", "\"QuantCalendar\"")
            buildConfigField("String", "DEFAULT_APP_URL", "\"https://quantmail.in/calendar\"")
            buildConfigField("String", "DEEP_LINK_SCHEME", "\"quantcalendar\"")
            buildConfigField("String", "APP_HOST", "\"quantmail.in\"")
        }
        create("codehub") {
            dimension = "app"
            applicationId = "com.quant.git"
            manifestPlaceholders["appName"] = "CodeHub"
            manifestPlaceholders["deepLinkScheme"] = "quantgit"
            manifestPlaceholders["appHost"] = "quantmail.in"
            resValue("string", "app_name", "CodeHub")
            resValue("string", "default_app_url", "https://quantmail.in/quantgit")
            resValue("string", "deep_link_scheme", "quantgit")
            buildConfigField("String", "APP_NAME", "\"CodeHub\"")
            buildConfigField("String", "DEFAULT_APP_URL", "\"https://quantmail.in/quantgit\"")
            buildConfigField("String", "DEEP_LINK_SCHEME", "\"quantgit\"")
            buildConfigField("String", "APP_HOST", "\"quantmail.in\"")
        }
        create("quantapp") {
            dimension = "app"
            applicationId = "com.quant.app"
            manifestPlaceholders["appName"] = "Quant"
            manifestPlaceholders["deepLinkScheme"] = "quant"
            manifestPlaceholders["appHost"] = "quantmail.in"
            resValue("string", "app_name", "Quant")
            resValue("string", "default_app_url", "https://quantmail.in/")
            resValue("string", "deep_link_scheme", "quant")
            buildConfigField("String", "APP_NAME", "\"Quant\"")
            buildConfigField("String", "DEFAULT_APP_URL", "\"https://quantmail.in/\"")
            buildConfigField("String", "DEEP_LINK_SCHEME", "\"quant\"")
            buildConfigField("String", "APP_HOST", "\"quantmail.in\"")
        }
    }

    signingConfigs {
        create("release") {
            val keystoreFile = System.getenv("KEYSTORE_FILE")
            if (!keystoreFile.isNullOrBlank() && file(keystoreFile).exists()) {
                storeFile = file(keystoreFile)
                storePassword = System.getenv("KEYSTORE_PASSWORD") ?: ""
                keyAlias = System.getenv("KEY_ALIAS") ?: ""
                keyPassword = System.getenv("KEY_PASSWORD") ?: ""
            } else {
                val debugKeystore = file("${System.getProperty("user.home")}/.android/debug.keystore")
                if (debugKeystore.exists()) {
                    storeFile = debugKeystore
                    storePassword = "android"
                    keyAlias = "androiddebugkey"
                    keyPassword = "android"
                }
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            val releaseConfig = signingConfigs.getByName("release")
            signingConfig = if (releaseConfig.storeFile != null && releaseConfig.storeFile?.exists() == true) {
                releaseConfig
            } else {
                signingConfigs.getByName("debug")
            }
        }
        debug {
            // debug settings inherit default debug signing
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
      compose = true
      aidl = false
      buildConfig = true
      resValues = true
      shaders = false
    }

    packaging {
      resources {
        excludes += "/META-INF/{AL2.0,LGPL2.1}"
      }
    }
}

kotlin {
    jvmToolchain(17)
}

dependencies {
  val composeBom = platform(libs.androidx.compose.bom)
  implementation(composeBom)
  androidTestImplementation(composeBom)

  // Core Android dependencies
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.lifecycle.runtime.ktx)
  implementation(libs.androidx.activity.compose)

  // Arch Components
  implementation(libs.androidx.lifecycle.runtime.compose)
  implementation(libs.androidx.lifecycle.viewmodel.compose)

  // Compose
  implementation(libs.androidx.compose.ui)
  implementation(libs.androidx.compose.ui.tooling.preview)
  implementation(libs.androidx.compose.material3)
  // Tooling
  debugImplementation(libs.androidx.compose.ui.tooling)
  // Instrumented tests
  androidTestImplementation(libs.androidx.compose.ui.test.junit4)
  debugImplementation(libs.androidx.compose.ui.test.manifest)

  // Local tests: jUnit, coroutines, Android runner
  testImplementation(libs.junit)
  testImplementation(libs.kotlinx.coroutines.test)

  // Instrumented tests: jUnit rules and runners
  androidTestImplementation(libs.androidx.test.core)
  androidTestImplementation(libs.androidx.test.ext.junit)
  androidTestImplementation(libs.androidx.test.runner)
  androidTestImplementation(libs.androidx.test.espresso.core)

  // Navigation
  implementation(libs.androidx.navigation3.ui)
  implementation(libs.androidx.navigation3.runtime)
  implementation(libs.androidx.lifecycle.viewmodel.navigation3)

  // Chrome Custom Tabs for OAuth
  implementation("androidx.browser:browser:1.8.0")

  // Native Pull to Refresh
  implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
}

