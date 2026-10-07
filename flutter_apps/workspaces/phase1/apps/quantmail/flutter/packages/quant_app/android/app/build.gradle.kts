plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin
    // Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.quantrinity.quantmail"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "com.quantrinity.quantmail"
        minSdk = 24
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // Release keystore (S6, security audit). Provide via Gradle properties
    // (gradle.properties, ~/.gradle/gradle.properties, or -P flags) or
    // environment variables:
    //   QUANTMAIL_KEYSTORE_FILE, QUANTMAIL_KEYSTORE_PASSWORD,
    //   QUANTMAIL_KEY_ALIAS, QUANTMAIL_KEY_PASSWORD
    signingConfigs {
        create("release") {
            val keystoreFile =
                (project.findProperty("QUANTMAIL_KEYSTORE_FILE") as String?)
                    ?: System.getenv("QUANTMAIL_KEYSTORE_FILE")
            // Fail-loud only when a release build is actually being assembled
            // — debug `flutter run` keeps working with no keystore present.
            // Release builds are never silently signed with the debug key.
            val releaseRequested = gradle.startParameter.taskNames
                .any { it.contains("Release", ignoreCase = true) }
            if (keystoreFile.isNullOrBlank()) {
                if (releaseRequested) {
                    throw GradleException(
                        "Release signing misconfigured: QUANTMAIL_KEYSTORE_FILE " +
                        "is not set. Provide it as a Gradle property " +
                        "(gradle.properties, ~/.gradle/gradle.properties, or " +
                        "-PQUANTMAIL_KEYSTORE_FILE=...) or environment variable, " +
                        "plus QUANTMAIL_KEYSTORE_PASSWORD, QUANTMAIL_KEY_ALIAS " +
                        "and QUANTMAIL_KEY_PASSWORD. Release builds are never " +
                        "signed with the debug key."
                    )
                }
            } else {
                storeFile = file(keystoreFile)
                storePassword =
                    (project.findProperty("QUANTMAIL_KEYSTORE_PASSWORD") as String?)
                        ?: System.getenv("QUANTMAIL_KEYSTORE_PASSWORD")
                keyAlias =
                    (project.findProperty("QUANTMAIL_KEY_ALIAS") as String?)
                        ?: System.getenv("QUANTMAIL_KEY_ALIAS")
                keyPassword =
                    (project.findProperty("QUANTMAIL_KEY_PASSWORD") as String?)
                        ?: System.getenv("QUANTMAIL_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

flutter {
    source = "../.."
}
