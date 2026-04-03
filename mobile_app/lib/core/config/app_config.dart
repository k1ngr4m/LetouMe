class AppConfig {
  const AppConfig({
    required this.apiBaseUrl,
    this.appName = 'LetouMe Mobile',
  });

  final String appName;
  final String apiBaseUrl;

  static const current = AppConfig(
    apiBaseUrl: 'http://localhost:8000/api',
  );
}
