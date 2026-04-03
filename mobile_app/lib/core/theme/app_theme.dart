import 'package:flutter/material.dart';

class AppTheme {
  static ThemeData light() {
    const seed = Color(0xFF0E5D6F);
    const accent = Color(0xFFEAAE52);
    final scheme = ColorScheme.fromSeed(
      seedColor: seed,
      brightness: Brightness.light,
      primary: seed,
      secondary: accent,
      surface: const Color(0xFFF7F4EE),
    );
    return ThemeData(
      colorScheme: scheme,
      useMaterial3: true,
      scaffoldBackgroundColor: const Color(0xFFF4EFE6),
      cardTheme: const CardThemeData(
        elevation: 0,
        color: Colors.white,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(24)),
        ),
      ),
      appBarTheme: const AppBarTheme(
        elevation: 0,
        backgroundColor: Colors.transparent,
        foregroundColor: Color(0xFF142127),
        centerTitle: false,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(20),
          borderSide: BorderSide.none,
        ),
      ),
      textTheme: _textTheme(const Color(0xFF142127)),
    );
  }

  static ThemeData dark() {
    const seed = Color(0xFF4AC7D8);
    const accent = Color(0xFFFFC978);
    final scheme = ColorScheme.fromSeed(
      seedColor: seed,
      brightness: Brightness.dark,
      primary: seed,
      secondary: accent,
      surface: const Color(0xFF10171D),
    );
    return ThemeData(
      colorScheme: scheme,
      useMaterial3: true,
      scaffoldBackgroundColor: const Color(0xFF071015),
      cardTheme: const CardThemeData(
        elevation: 0,
        color: Color(0xFF0E1920),
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(24)),
        ),
      ),
      appBarTheme: const AppBarTheme(
        elevation: 0,
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
        centerTitle: false,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xFF101C24),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(20),
          borderSide: BorderSide.none,
        ),
      ),
      textTheme: _textTheme(Colors.white),
    );
  }

  static TextTheme _textTheme(Color bodyColor) {
    return TextTheme(
      displaySmall: TextStyle(
        color: bodyColor,
        fontSize: 34,
        fontWeight: FontWeight.w800,
        height: 1.05,
        letterSpacing: -1.1,
      ),
      headlineMedium: TextStyle(
        color: bodyColor,
        fontSize: 26,
        fontWeight: FontWeight.w700,
        height: 1.15,
      ),
      titleLarge: TextStyle(
        color: bodyColor,
        fontSize: 20,
        fontWeight: FontWeight.w700,
      ),
      titleMedium: TextStyle(
        color: bodyColor,
        fontSize: 16,
        fontWeight: FontWeight.w700,
      ),
      bodyLarge: TextStyle(
        color: bodyColor.withValues(alpha: 0.88),
        fontSize: 16,
        height: 1.45,
      ),
      bodyMedium: TextStyle(
        color: bodyColor.withValues(alpha: 0.76),
        fontSize: 14,
        height: 1.45,
      ),
      labelLarge: TextStyle(
        color: bodyColor,
        fontSize: 14,
        fontWeight: FontWeight.w700,
      ),
    );
  }
}
